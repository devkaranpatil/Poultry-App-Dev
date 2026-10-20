// The assistant's knowledge base: builds the passages once, embeds them in the background, and answers
// "which passages are relevant to this question?" for the AI routes.
//
// Search works the moment the server starts (keyword scoring). As the embedding model finishes the passages,
// searches turn hybrid automatically; the embeddings are cached on disk so this happens once.

const engine = require("../llm/engine");
const { buildCorpus } = require("./corpus");
const { createEmbeddingStore, hashText } = require("./embeddingStore");
const { createRetriever } = require("./retriever");
const { focusPassage, splitQuestion } = require("./text");

const QUERY_EMBED_TIMEOUT_MS = 10_000;
const RERANK_TIMEOUT_MS = 40_000;
const RERANK_POOL = 10; // candidates the reranker reads per question (about half a second each on a laptop CPU)
const SHOWN_CHARS = 650; // the part of each passage the reranker and the model read
// Passages from one document in the final context. The planner's own pages (bird list, cost model) match many
// questions on wording alone and would push out the guides that hold the actual answer.
const maxPerDocument = (passage) => (passage.kind === "planner" ? 1 : 3);
const EMBED_BATCH = 4; // small batches, so a user's question never waits long behind the background work
const SAVE_EVERY = 40;

// District climate summaries are found by district name, and all read alike, so embedding them would cost
// about 45 percent of the embedding time and add nothing.
const isEmbeddable = (chunk) => chunk.docId !== "dataset-district-climate";
const embeddingInput = (chunk) => `${chunk.title}${chunk.section ? ` - ${chunk.section}` : ""}\n${chunk.text}`;

const embeddingState = () => ({ status: "idle", done: 0, total: 0, error: null });

let built = null;
let embedding = embeddingState();
let warmPromise = null;

function knowledge() {
  if (!built) {
    const corpus = buildCorpus();
    built = { ...corpus, retriever: createRetriever(corpus.chunks) };
  }
  return built;
}

/** Test hook: replace the corpus with a handful of passages, and forget any embeddings. */
function useChunksForTesting(chunks) {
  built = chunks ? { chunks, documents: [], missing: [], retriever: createRetriever(chunks) } : null;
  embedding = embeddingState();
  warmPromise = null;
}

/** Embeds every embeddable passage that is not cached yet. Runs once; later calls share the same work. */
function warmEmbeddings() {
  if (warmPromise) return warmPromise;
  warmPromise = (async () => {
    const kb = knowledge();
    if (!(await engine.hasEmbeddings())) {
      embedding = { ...embeddingState(), status: "unavailable" };
      return;
    }
    const store = createEmbeddingStore({
      model: engine.embeddingModelLabel(),
      file: process.env.RAG_EMBEDDINGS_FILE || undefined, // default: backend/.data/rag-embeddings.json
    });
    store.load();

    const wanted = [];
    kb.chunks.forEach((chunk, index) => {
      if (isEmbeddable(chunk)) wanted.push({ index, text: embeddingInput(chunk), hash: hashText(embeddingInput(chunk)) });
    });
    embedding = { status: "running", done: 0, total: wanted.length, error: null };

    const missing = [];
    for (const item of wanted) {
      const cached = store.get(item.hash);
      if (cached) {
        kb.retriever.setVector(item.index, cached);
        embedding.done += 1;
      } else {
        missing.push(item);
      }
    }

    let sinceSave = 0;
    for (let start = 0; start < missing.length; start += EMBED_BATCH) {
      const batch = missing.slice(start, start + EMBED_BATCH);
      const vectors = await engine.embed(batch.map((item) => item.text));
      batch.forEach((item, i) => {
        store.set(item.hash, vectors[i]);
        kb.retriever.setVector(item.index, vectors[i]);
      });
      embedding.done += batch.length;
      sinceSave += batch.length;
      if (sinceSave >= SAVE_EVERY) {
        store.save();
        sinceSave = 0;
      }
    }
    if (sinceSave > 0 || missing.length > 0) store.save();
    embedding.status = "ready";
  })().catch((err) => {
    embedding = { ...embedding, status: "failed", error: String(err?.message || err) };
    warmPromise = null; // allow a later retry
  });
  return warmPromise;
}

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms))]);

/** One question, one ranked list of passages. */
async function searchOne(query, { k, boosts }) {
  const kb = knowledge();
  let queryVector = null;
  if (kb.retriever.vectorCount() > 0) {
    try {
      [queryVector] = await withTimeout(engine.embed([String(query).slice(0, 600)]), QUERY_EMBED_TIMEOUT_MS);
    } catch {
      queryVector = null; // the question embedding failed or was slow: keywords still work
    }
  }
  // With a reranker, look at a wider pool and let it choose; without one, the hybrid order is the answer.
  const useReranker = await engine.hasReranker().catch(() => false);
  const pool = useReranker ? Math.max(RERANK_POOL, k * 2) : k;
  // Five candidates per document for the reranker; measured on datasets/eval, three lost answers that sit in
  // the fourth or fifth passage of a guide.
  const hits = kb.retriever.search(query, { queryVector, boosts, k: pool, perDocument: useReranker ? 5 : 3 });
  let passages = hits.map((hit, index) => ({
    n: index + 1,
    id: hit.chunk.id,
    title: hit.chunk.title,
    publisher: hit.chunk.publisher,
    url: hit.chunk.url,
    section: hit.chunk.section,
    status: hit.chunk.status,
    scope: hit.chunk.scope,
    note: hit.chunk.note,
    text: focusPassage(hit.chunk.text, query, SHOWN_CHARS),
    docId: hit.chunk.docId,
    kind: hit.chunk.kind,
    score: hit.score,
  }));

  let reranked = false;
  if (useReranker && passages.length > 1) {
    try {
      // Text only: adding titles made the planner's short pages (in the polyhouse version, "Crops in the planner - Capsicum") outrank
      // the guides (measured on datasets/eval).
      const relevance = await withTimeout(engine.rerank(query, passages.map((passage) => passage.text)), RERANK_TIMEOUT_MS);
      // Older documents lose half their relevance, so a current rule wins over a superseded one.
      const adjusted = passages.map((passage, i) => ({ ...passage, relevance: relevance[i] * (passage.status === "older" ? 0.5 : 1) }));
      adjusted.sort((a, b) => b.relevance - a.relevance);
      passages = adjusted;
      reranked = true;
    } catch {
      reranked = false; // the reranker failed or was slow: keep the hybrid order
    }
  }

  const perDocument = new Map();
  const chosen = [];
  for (const passage of passages) {
    const used = perDocument.get(passage.docId) || 0;
    if (used >= maxPerDocument(passage)) continue;
    perDocument.set(passage.docId, used + 1);
    chosen.push(passage);
    if (chosen.length >= k) break;
  }
  return {
    mode: queryVector ? "hybrid" : "keyword",
    reranked,
    passages: chosen.map(({ docId, ...passage }, index) => ({ ...passage, n: index + 1 })),
  };
}

/**
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.k]  passages to return
 * @param {Array<{tag:string,value:string,factor:number}>} [options.boosts]  favour passages about this project
 * @returns {Promise<{ mode: "hybrid"|"keyword", passages: object[] }>}
 *
 * A compound question ("what is the area limit, and what is the cost norm?") is searched part by part and the
 * results are interleaved, so one half cannot crowd out the other.
 */
async function search(query, { k = 4, boosts = [] } = {}) {
  const parts = splitQuestion(query);
  if (parts.length === 1) return searchOne(query, { k, boosts });

  const perPart = Math.max(2, Math.ceil(k / parts.length));
  const results = [];
  for (const part of parts) results.push(await searchOne(part, { k: perPart, boosts }));

  const merged = [];
  const seen = new Set();
  for (let rank = 0; rank < perPart && merged.length < k; rank += 1) {
    for (const result of results) {
      const passage = result.passages[rank];
      if (passage && !seen.has(passage.id) && merged.length < k) {
        seen.add(passage.id);
        merged.push(passage);
      }
    }
  }
  return {
    mode: results.some((result) => result.mode === "hybrid") ? "hybrid" : "keyword",
    reranked: results.every((result) => result.reranked),
    passages: merged.map((passage, index) => ({ ...passage, n: index + 1 })),
  };
}

/** What is loaded, for the status endpoint and the server log. */
function describe() {
  const kb = knowledge();
  return {
    passages: kb.chunks.length,
    documents: kb.documents.length,
    missingDocuments: kb.missing,
    embeddings: { ...embedding, vectors: kb.retriever.vectorCount() },
    mode: kb.retriever.vectorCount() > 0 ? "hybrid" : "keyword",
  };
}

module.exports = { describe, search, useChunksForTesting, warmEmbeddings };
