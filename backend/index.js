const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

for (const envPath of [path.resolve(__dirname, ".env"), path.resolve(__dirname, "../.env")]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false, quiet: true });
  }
}

const app = require("./app");
const { connectDb } = require("./config/db");

const PORT = process.env.PORT || 5000;

/**
 * Gets the assistant ready in the background so the first question is not slow: builds the knowledge base,
 * loads the models, and embeds the passages (cached on disk, so the long part happens once). Never blocks
 * or crashes the server; if the model files are missing the AI routes simply report that.
 */
function warmAssistant() {
  if (process.env.AI_WARMUP === "off") return;
  const engine = require("./services/llm/engine");
  const knowledge = require("./services/rag");
  const info = knowledge.describe();
  console.log(`Assistant knowledge base: ${info.passages} passages from ${info.documents} documents.`);
  if (info.missingDocuments.length > 0) {
    console.warn(`  Missing source text: ${info.missingDocuments.join(", ")} (run: python datasets/scripts/fetch_knowledge.py)`);
  }
  if (info.unusableDocuments.length > 0) {
    console.warn(`  Text extraction failed (empty or near-empty), assistant cannot use: ${info.unusableDocuments.join(", ")}`);
  }
  engine
    .warmUp()
    .then((loaded) => {
      if (!loaded.chat) return console.warn('Assistant model not installed. Run "npm run models:download" in backend/.');
      console.log(`Assistant model loaded in ${(loaded.ms / 1000).toFixed(1)} s.`);
      return knowledge.warmEmbeddings().then(() => {
        const state = knowledge.describe().embeddings;
        console.log(`Assistant embeddings: ${state.status} (${state.done}/${state.total} passages).`);
      });
    })
    .catch((err) => console.warn("Assistant warm-up failed:", err?.message || err));
}

async function bootstrap() {
  try {
    await connectDb();

    app.listen(PORT, () => {
      console.log(`Backend running on http://localhost:${PORT}`);
      warmAssistant();
    });
  } catch (err) {
    console.error("Failed to bootstrap backend:", err);
    process.exit(1);
  }
}

bootstrap();
