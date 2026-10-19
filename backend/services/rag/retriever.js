// Hybrid retrieval over a fixed set of passages: BM25 keyword scoring plus embedding similarity, fused with
// reciprocal-rank fusion. Works with keywords alone until the embeddings are ready, and across languages
// (a Hindi question finding an English passage) once they are.

const { expandQueryTokens, tokenize } = require("./text");

const BM25_K1 = 1.4;
const BM25_B = 0.75;
const RRF_K = 60; // standard damping constant for reciprocal-rank fusion
const POOL = 40; // how many candidates each ranker contributes
const RESERVED_PER_RANKER = 2; // each ranker's top results always make the final list

function normalise(vector) {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) out[i] = vector[i] / norm;
  return out;
}

function dot(a, b) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) sum += a[i] * b[i];
  return sum;
}

/** Indexes whose score is above zero, best first, at most `limit`. */
function topIndexes(scores, limit) {
  const indexes = [];
  for (let i = 0; i < scores.length; i += 1) if (scores[i] > 0) indexes.push(i);
  indexes.sort((a, b) => scores[b] - scores[a]);
  return indexes.slice(0, limit);
}

function createRetriever(chunks) {
  const termFreqs = [];
  const docFreq = new Map();
  let totalTokens = 0;
  for (const chunk of chunks) {
    const tokens = tokenize(`${chunk.title} ${chunk.section || ""} ${chunk.text}`);
    const tf = new Map();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    for (const token of tf.keys()) docFreq.set(token, (docFreq.get(token) || 0) + 1);
    termFreqs.push({ tf, length: tokens.length });
    totalTokens += tokens.length;
  }
  const count = chunks.length;
  const avgLength = totalTokens / Math.max(count, 1);
  const vectors = new Array(count).fill(null);

  function keywordScores(query) {
    const scores = new Float64Array(count);
    const queryTokens = expandQueryTokens([...new Set(tokenize(query))]);
    for (const token of queryTokens) {
      const df = docFreq.get(token);
      if (!df) continue;
      const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5));
      for (let i = 0; i < count; i += 1) {
        const tf = termFreqs[i].tf.get(token);
        if (!tf) continue;
        const norm = 1 - BM25_B + (BM25_B * termFreqs[i].length) / avgLength;
        scores[i] += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm));
      }
    }
    return scores;
  }

  function similarityScores(queryVector) {
    const scores = new Float64Array(count);
    const query = normalise(queryVector);
    for (let i = 0; i < count; i += 1) {
      if (vectors[i]) scores[i] = Math.max(dot(query, vectors[i]), 0);
    }
    return scores;
  }

  /**
   * @param {string} query
   * @param {object} [options]
   * @param {number[]|Float32Array} [options.queryVector]  embedding of the query, when available
   * @param {Array<{tag:string,value:string,factor:number}>} [options.boosts]  favour passages about the project
   * @param {number} [options.k]  how many passages to return
   * @param {number} [options.perDocument]  at most this many passages from one document
   */
  function search(query, { queryVector = null, boosts = [], k = 5, perDocument = 3 } = {}) {
    const keyword = keywordScores(query);
    const semantic = queryVector && vectors.some(Boolean) ? similarityScores(queryVector) : null;

    const fused = new Map();
    const add = (indexes, key) => {
      indexes.forEach((index, rank) => {
        const entry = fused.get(index) || { score: 0 };
        entry[key] = rank + 1;
        entry.score += 1 / (RRF_K + rank + 1);
        fused.set(index, entry);
      });
    };
    add(topIndexes(keyword, POOL), "keywordRank");
    if (semantic) add(topIndexes(semantic, POOL), "semanticRank");

    const ranked = [...fused.entries()].map(([index, entry]) => {
      const chunk = chunks[index];
      let score = entry.score * (chunk.priority ?? 1);
      for (const boost of boosts) {
        if (chunk.tags?.[boost.tag] && String(chunk.tags[boost.tag]).toLowerCase() === String(boost.value).toLowerCase()) {
          score *= boost.factor;
        }
      }
      return { chunk, score, keywordRank: entry.keywordRank, semanticRank: entry.semanticRank, similarity: semantic ? semantic[index] : null };
    });
    ranked.sort((a, b) => b.score - a.score);

    const picked = new Set();
    const perDoc = new Map();
    const take = (hit) => {
      if (!hit || picked.has(hit) || picked.size >= k) return;
      const used = perDoc.get(hit.chunk.docId) || 0;
      if (used >= perDocument) return;
      perDoc.set(hit.chunk.docId, used + 1);
      picked.add(hit);
    };
    // Fusion alone can push a strong keyword-only (or meaning-only) match below passages that merely score
    // modestly on both lists, so each ranker's best results are guaranteed a place first.
    const byRank = (key) => ranked.filter((hit) => hit[key] && hit[key] <= RESERVED_PER_RANKER).sort((a, b) => a[key] - b[key]);
    const reservedKeyword = byRank("keywordRank");
    const reservedSemantic = byRank("semanticRank");
    for (let i = 0; i < RESERVED_PER_RANKER; i += 1) {
      take(reservedKeyword[i]);
      take(reservedSemantic[i]);
    }
    for (const hit of ranked) take(hit);
    return [...picked].sort((a, b) => b.score - a.score);
  }

  return {
    size: count,
    search,
    setVector(index, vector) {
      vectors[index] = normalise(vector);
    },
    vectorCount: () => vectors.filter(Boolean).length,
  };
}

module.exports = { createRetriever, normalise };
