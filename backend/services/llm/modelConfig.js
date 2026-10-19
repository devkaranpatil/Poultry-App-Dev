const path = require("path");

// The assistant runs inside this Node process (node-llama-cpp + GGUF weights): no Ollama, no hosted API,
// no key. The weights are downloaded once into MODELS_DIR (`npm run models:download` in backend/).
//
// Defaults (both open licences, both verified on Hugging Face on 2026-10-13):
//   chat model       Qwen3-4B    Apache-2.0, ~2.5 GB at Q4_K_M, multilingual (includes Hindi and Marathi)
//   embedding model  bge-m3      MIT, ~0.44 GB at Q4_K_M, multilingual, so a Hindi question can find English text
// Override with LLM_MODEL_URI / EMBED_MODEL_URI (a `hf:user/repo/file.gguf` URI or a path to a .gguf file).
//
// Why the 4B: on the 66-question set in datasets/eval it fixed half of the 1.7B's remaining failures (it reads
// the right passage, keeps to the rules, writes usable Hindi and Marathi). The cost is speed. Measured on a 15 W
// laptop CPU (Intel Core 7 150U, 8 threads): the 4B reads a prompt at ~30 tokens/s and writes ~8.6 tokens/s,
// a full answer in about 50-90 s; Qwen3-1.7B (hf:Qwen/Qwen3-1.7B-GGUF/Qwen3-1.7B-Q8_0.gguf) manages ~52 and
// ~12.6, about 1.8x faster, if speed matters more than accuracy on a slow machine.

const os = require("os");

const DEFAULT_CHAT_URI = "hf:Qwen/Qwen3-4B-GGUF/Qwen3-4B-Q4_K_M.gguf";
const DEFAULT_EMBED_URI = "hf:gpustack/bge-m3-GGUF/bge-m3-Q4_K_M.gguf";
// Cross-encoder that reads the question and a passage together and scores how well the passage answers it.
// Apache-2.0, ~0.44 GB. It lifted the right passage from rank 8-10 to rank 1 in testing. Set RERANK=off to skip it.
const DEFAULT_RERANK_URI = "hf:gpustack/bge-reranker-v2-m3-GGUF/bge-reranker-v2-m3-Q4_K_M.gguf";

const clean = (value) => String(value || "").trim();

function getModelsDir() {
  return clean(process.env.LLM_MODELS_DIR) || path.resolve(__dirname, "../../.models");
}

function getChatModelUri() {
  return clean(process.env.LLM_MODEL_URI) || DEFAULT_CHAT_URI;
}

function getEmbeddingModelUri() {
  return clean(process.env.EMBED_MODEL_URI) || DEFAULT_EMBED_URI;
}

function getRerankModelUri() {
  return clean(process.env.RERANK_MODEL_URI) || DEFAULT_RERANK_URI;
}

const rerankEnabled = () => clean(process.env.RERANK).toLowerCase() !== "off";

/** Short name for status output: the file name without its extension. */
function modelLabel(uri) {
  const last = String(uri).split(/[\\/]/).pop() || String(uri);
  return last.replace(/\.gguf$/i, "");
}

const intFromEnv = (name, fallback) => {
  const value = Number.parseInt(clean(process.env[name]), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/**
 * Threads for inference. Using every logical core is slower on laptop CPUs with efficiency cores (measured:
 * 8 threads gave 8.0 tokens/s, the default of 10 gave 5.0), so leave two free and cap at 8.
 */
function defaultThreads() {
  const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(2, Math.min(8, cores - 2));
}

function getRuntimeOptions() {
  return {
    // Prompt budget: facts + retrieved passages + conversation must fit. Longer costs RAM and time on CPU.
    contextSize: intFromEnv("LLM_CONTEXT_SIZE", 4096),
    maxAnswerTokens: intFromEnv("LLM_MAX_ANSWER_TOKENS", 450),
    maxJsonTokens: intFromEnv("LLM_MAX_JSON_TOKENS", 1000),
    threads: intFromEnv("LLM_THREADS", defaultThreads()),
  };
}

module.exports = {
  DEFAULT_CHAT_URI,
  DEFAULT_EMBED_URI,
  DEFAULT_RERANK_URI,
  getChatModelUri,
  getEmbeddingModelUri,
  getModelsDir,
  getRerankModelUri,
  getRuntimeOptions,
  modelLabel,
  rerankEnabled,
};
