// Downloads the chat and embedding model weights (GGUF) into backend/.models. Run once:
//
//   npm run models:download            (from backend/)
//
// Re-running is safe: files that already exist are kept. Needs internet only for this step; afterwards the
// assistant works fully offline.

const fs = require("fs");
const path = require("path");
const {
  getChatModelUri,
  getEmbeddingModelUri,
  getModelsDir,
  getRerankModelUri,
  modelLabel,
  rerankEnabled,
} = require("../services/llm/modelConfig");

async function main() {
  const { resolveModelFile } = await import("node-llama-cpp");
  const directory = getModelsDir();
  fs.mkdirSync(directory, { recursive: true });

  const wanted = [
    ["embedding model", getEmbeddingModelUri()],
    ["chat model", getChatModelUri()],
  ];
  if (rerankEnabled()) wanted.push(["reranking model", getRerankModelUri()]);
  for (const [role, uri] of wanted) {
    console.log(`\n${role}: ${modelLabel(uri)}`);
    const file = await resolveModelFile(uri, { directory, download: "auto", cli: true });
    const sizeMb = Math.round(fs.statSync(file).size / 1e6);
    console.log(`  ready: ${path.relative(process.cwd(), file) || file} (${sizeMb} MB)`);
  }
  console.log("\nDone. Start the backend; the assistant loads these on the first request.");
}

main().catch((err) => {
  console.error("Model download failed:", err?.message || err);
  process.exit(1);
});
