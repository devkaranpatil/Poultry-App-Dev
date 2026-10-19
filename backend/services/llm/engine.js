// In-process language model + embedding model (node-llama-cpp running GGUF weights). There is no server, no
// API key and no network call at run time: the weights live in backend/.models (see modelConfig.js).
//
// The engine is loaded lazily on the first request and shared. Chat requests run one at a time (a CPU has
// one set of cores), so a short queue protects the server from piling up work.

const fs = require("fs");
const {
  getChatModelUri,
  getEmbeddingModelUri,
  getModelsDir,
  getRerankModelUri,
  getRuntimeOptions,
  modelLabel,
  rerankEnabled,
} = require("./modelConfig");

const MAX_QUEUED_REQUESTS = 4;
const EMBED_CONTEXT_SIZE = 1024;
const MAX_EMBED_CHARS = 1500; // a passage is about 170 words; longer input only costs time
const STATUS_CACHE_MS = 10_000;

class ModelBusyError extends Error {
  constructor() {
    super("The AI model is busy with other requests. Please try again in a moment.");
    this.name = "ModelBusyError";
  }
}

class ModelMissingError extends Error {
  constructor(role) {
    super(`The ${role} model is not installed. Run "npm run models:download" in backend/.`);
    this.name = "ModelMissingError";
  }
}

let testEngine = null;
let llamaPromise = null;
let chatPromise = null;
let embedPromise = null;
let rerankPromise = null;
let fileStatusCache = null;

const importLlamaModule = () => import("node-llama-cpp");

async function getLlama() {
  if (!llamaPromise) {
    // CPU by default. Letting the runtime pick an integrated GPU (Vulkan) gave no meaningful speed-up on a laptop and
    // can run out of shared graphics memory when several processes hold models. Set LLM_GPU=auto on a real GPU.
    const gpu = String(process.env.LLM_GPU || "").trim().toLowerCase() === "auto" ? "auto" : false;
    llamaPromise = importLlamaModule().then(({ getLlama: create, LlamaLogLevel }) =>
      create({ gpu, logLevel: LlamaLogLevel.error })
    );
    llamaPromise.catch(() => {
      llamaPromise = null;
    });
  }
  return llamaPromise;
}

/** Where the weights are, without downloading anything. */
async function locateModel(uri) {
  const { resolveModelFile } = await importLlamaModule();
  try {
    const file = await resolveModelFile(uri, { directory: getModelsDir(), download: false, cli: false });
    return file && fs.existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

async function modelFiles() {
  if (fileStatusCache && Date.now() - fileStatusCache.at < STATUS_CACHE_MS) return fileStatusCache.value;
  const [chat, embeddings, reranker] = await Promise.all([
    locateModel(getChatModelUri()),
    locateModel(getEmbeddingModelUri()),
    rerankEnabled() ? locateModel(getRerankModelUri()) : Promise.resolve(null),
  ]);
  fileStatusCache = { at: Date.now(), value: { chat, embeddings, reranker } };
  return fileStatusCache.value;
}

/* --------------------------------- loading --------------------------------- */

function loadChat() {
  if (!chatPromise) {
    chatPromise = (async () => {
      const file = (await modelFiles()).chat;
      if (!file) throw new ModelMissingError("chat");
      const llama = await getLlama();
      const options = getRuntimeOptions();
      const model = await llama.loadModel({ modelPath: file });
      const context = await model.createContext({
        contextSize: options.contextSize,
        sequences: 2,
        ...(options.threads ? { threads: options.threads } : {}),
      });
      // Two sequences that live as long as the server. The runtime keeps the tokens it has already read in a
      // sequence and, when the next prompt starts with the same tokens, skips them: a repeat of a 1,000-token
      // prompt start answered in 0.3 s instead of 18 s in testing. The chat sequence holds the project prompt;
      // the helper sequence takes small side jobs (translating a question) so they never wipe that cache.
      return { llama, model, context, chatSequence: context.getSequence(), helperSequence: context.getSequence() };
    })();
    chatPromise.catch(() => {
      chatPromise = null;
    });
  }
  return chatPromise;
}

function loadEmbedder() {
  if (!embedPromise) {
    embedPromise = (async () => {
      const file = (await modelFiles()).embeddings;
      if (!file) throw new ModelMissingError("embedding");
      const llama = await getLlama();
      const model = await llama.loadModel({ modelPath: file });
      const context = await model.createEmbeddingContext({ contextSize: EMBED_CONTEXT_SIZE, threads: getRuntimeOptions().threads });
      return { model, context };
    })();
    embedPromise.catch(() => {
      embedPromise = null;
    });
  }
  return embedPromise;
}

function loadReranker() {
  if (!rerankPromise) {
    rerankPromise = (async () => {
      const file = (await modelFiles()).reranker;
      if (!file) throw new ModelMissingError("reranking");
      const llama = await getLlama();
      const model = await llama.loadModel({ modelPath: file });
      const context = await model.createRankingContext({ contextSize: EMBED_CONTEXT_SIZE, threads: getRuntimeOptions().threads });
      return { model, context };
    })();
    rerankPromise.catch(() => {
      rerankPromise = null;
    });
  }
  return rerankPromise;
}

/* ------------------------------- request queue ------------------------------ */

let queueTail = Promise.resolve();
let queued = 0;

/** Waits for earlier chat requests, then resolves with a function that releases the next one. */
async function acquireChatSlot() {
  if (queued >= MAX_QUEUED_REQUESTS) throw new ModelBusyError();
  queued += 1;
  let release;
  const mine = new Promise((resolve) => {
    release = resolve;
  });
  const previous = queueTail;
  queueTail = previous.then(() => mine);
  await previous;
  return () => {
    queued -= 1;
    release();
  };
}

/* --------------------------------- chat ------------------------------------ */

const thinkingBlock = /<think>[\s\S]*?<\/think>/g;
const stripThinking = (text) => text.replace(thinkingBlock, "").replace(/^\s+/, "");

/** Qwen3 reasons before answering unless told not to; that is slow on a CPU and not wanted in the answer. */
const isQwen3 = () => /qwen3/i.test(getChatModelUri());

const grammars = new WeakMap();
async function grammarFor(llama, schema) {
  if (!grammars.has(schema)) grammars.set(schema, await llama.createGrammarForJsonSchema(schema));
  return grammars.get(schema);
}

/**
 * Runs one conversation turn. `turns` is [{ role: "user" | "assistant", content }] ending with the user.
 * Returns the reply text, or the parsed object when `schema` is given.
 */
async function runChat({ system, turns, schema, signal, onText, maxTokens, temperature, lane }) {
  const { LlamaChatSession } = await importLlamaModule();
  const { llama, chatSequence, helperSequence } = await loadChat();
  const options = getRuntimeOptions();
  const sequence = lane === "helper" ? helperSequence : chatSequence;
  // The sequence is NOT disposed with the session: its already-read tokens are what the next request reuses.
  const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: system, autoDisposeSequence: false });
  try {
    const earlier = turns.slice(0, -1);
    if (earlier.length > 0) {
      session.setChatHistory([
        { type: "system", text: system },
        ...earlier.map((turn) =>
          turn.role === "assistant" ? { type: "model", response: [turn.content] } : { type: "user", text: turn.content }
        ),
      ]);
    }
    const last = turns[turns.length - 1].content;
    const grammar = schema ? await grammarFor(llama, schema) : undefined;
    const reply = await session.prompt(isQwen3() ? `${last} /no_think` : last, {
      grammar,
      signal,
      stopOnAbortSignal: true,
      // Qwen's recommended non-thinking settings: pure greedy decoding makes small models loop and repeat.
      temperature: temperature ?? (schema ? 0.3 : 0.5),
      topP: 0.8,
      topK: 20,
      repeatPenalty: { penalty: 1.1, lastTokens: 128 },
      maxTokens: maxTokens ?? (schema ? options.maxJsonTokens : options.maxAnswerTokens),
      budgets: { thoughtTokens: 0 },
      onTextChunk: onText,
    });
    const clean = stripThinking(reply);
    return grammar ? grammar.parse(clean) : clean;
  } finally {
    session.dispose({ disposeSequence: false });
  }
}

/** Complete answer (or parsed JSON when `schema` is given). */
async function complete(args) {
  if (testEngine) return testEngine.complete(args);
  const release = await acquireChatSlot();
  try {
    return await runChat(args);
  } finally {
    release();
  }
}

/** Streams the reply as text chunks. Stops generating if the consumer stops reading. */
async function* stream(args) {
  if (testEngine) {
    yield* testEngine.stream(args);
    return;
  }
  const release = await acquireChatSlot();
  const abort = new AbortController();
  const queue = [];
  let finished = false;
  let failure = null;
  let wake = null;
  const notify = () => {
    if (wake) {
      wake();
      wake = null;
    }
  };

  const onAbort = () => abort.abort();
  args.signal?.addEventListener("abort", onAbort);

  const job = runChat({
    ...args,
    signal: abort.signal,
    onText: (chunk) => {
      queue.push(chunk);
      notify();
    },
  })
    .catch((err) => {
      failure = err;
    })
    .finally(() => {
      finished = true;
      notify();
    });

  let started = false; // the model often opens with blank lines; drop them so the answer starts at its first word
  try {
    for (;;) {
      if (queue.length > 0) {
        const chunk = started ? queue.shift() : queue.shift().replace(/^\s+/, "");
        if (!chunk) continue;
        started = true;
        yield chunk;
      } else if (finished) {
        break;
      } else {
        await new Promise((resolve) => {
          wake = resolve;
        });
      }
    }
    if (failure && !abort.signal.aborted) throw failure;
  } finally {
    abort.abort(); // consumer left early (client disconnected): stop generating
    args.signal?.removeEventListener("abort", onAbort);
    await job;
    release();
  }
}

/* ------------------------------- embeddings -------------------------------- */

let embedTail = Promise.resolve();

/** One vector per text. Texts longer than the embedding window are shortened rather than rejected. */
async function embed(texts) {
  if (testEngine) return testEngine.embed(texts);
  const run = async () => {
    const { context } = await loadEmbedder();
    const vectors = [];
    for (const text of texts) {
      let input = String(text).slice(0, MAX_EMBED_CHARS);
      for (let attempt = 0; ; attempt += 1) {
        try {
          const embedding = await context.getEmbeddingFor(input);
          vectors.push(Float32Array.from(embedding.vector));
          break;
        } catch (err) {
          if (attempt >= 3) throw err;
          input = input.slice(0, Math.floor(input.length * 0.6)); // too long for the window: shorten and retry
        }
      }
    }
    return vectors;
  };
  const result = embedTail.then(run, run);
  embedTail = result.catch(() => {});
  return result;
}

let rerankTail = Promise.resolve();

/**
 * How well each text answers the query, 0 to 1, in the same order as `texts`. A cross-encoder reads the query
 * and the text together, so it separates a passage that answers the question from one that only shares words.
 */
async function rerank(query, texts) {
  if (testEngine) return testEngine.rerank(query, texts);
  const run = async () => {
    const { context } = await loadReranker();
    const scores = [];
    for (const text of texts) scores.push(await context.rank(String(query).slice(0, 400), String(text).slice(0, MAX_EMBED_CHARS)));
    return scores;
  };
  const result = rerankTail.then(run, run);
  rerankTail = result.catch(() => {});
  return result;
}

async function hasReranker() {
  if (testEngine) return typeof testEngine.rerank === "function";
  return Boolean((await modelFiles()).reranker);
}

/* ---------------------------------- status ---------------------------------- */

/** True when the chat weights are present (or a test engine is installed). */
async function isAvailable() {
  if (testEngine) return true;
  return Boolean((await modelFiles()).chat);
}

async function hasEmbeddings() {
  if (testEngine) return Boolean(testEngine.embed);
  return Boolean((await modelFiles()).embeddings);
}

async function status() {
  if (testEngine) return testEngine.status?.() ?? { chatModel: "test-model", chatReady: true, embeddingModel: null, embeddingsReady: false };
  const files = await modelFiles();
  return {
    chatModel: modelLabel(getChatModelUri()),
    chatReady: Boolean(files.chat),
    chatLoaded: Boolean(chatPromise),
    embeddingModel: modelLabel(getEmbeddingModelUri()),
    embeddingsReady: Boolean(files.embeddings),
    rerankModel: rerankEnabled() ? modelLabel(getRerankModelUri()) : null,
    rerankReady: Boolean(files.reranker),
  };
}

function chatModelLabel() {
  return testEngine ? testEngine.status?.().chatModel || "test-model" : modelLabel(getChatModelUri());
}

function embeddingModelLabel() {
  return testEngine ? testEngine.status?.().embeddingModel || "test-embeddings" : modelLabel(getEmbeddingModelUri());
}

/** Loads both models now so the first user request is not slow. Safe to call more than once. */
async function warmUp() {
  const files = await modelFiles();
  const started = Date.now();
  if (files.chat) await loadChat();
  if (files.embeddings) await loadEmbedder();
  if (files.reranker) await loadReranker();
  return { chat: Boolean(files.chat), embeddings: Boolean(files.embeddings), reranker: Boolean(files.reranker), ms: Date.now() - started };
}

/** Test hook: swap in a fake engine exposing complete(), stream(), embed() and optionally status(). */
function setEngineForTesting(fake) {
  testEngine = fake;
}

module.exports = {
  ModelBusyError,
  ModelMissingError,
  chatModelLabel,
  complete,
  embed,
  embeddingModelLabel,
  hasEmbeddings,
  hasReranker,
  isAvailable,
  rerank,
  setEngineForTesting,
  status,
  stream,
  warmUp,
};
