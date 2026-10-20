// Scores the local AI assistant against datasets/eval/assistant-questions.json, through the real /api/ai/chat
// route and the real models. Run after any change to retrieval, prompts or the model:
//
//   cd backend && npm run eval:assistant                    all questions (about 50-90 s each on a laptop CPU)
//   cd backend && npm run eval:assistant -- --only=id1,id2  some questions
//
// Each answer is checked with the question's regular expressions; the full answers go to backend/.data/eval-*.txt.
// Development only: it signs every request in as a test user, so it refuses to run with NODE_ENV=production.

const fs = require("fs");
const path = require("path");

if (process.env.NODE_ENV === "production") {
  console.error("evalAssistant bypasses login and must not run in production.");
  process.exit(1);
}
process.env.AI_WARMUP = "off"; // the script warms the embeddings itself, before the first question
process.env.AI_RATE_LIMIT_MAX = process.env.AI_RATE_LIMIT_MAX || "100000";

// Replace the login check before the AI routes load it: every request is a fixed test user.
const authPath = require.resolve("../routes/auth");
require(authPath);
require.cache[authPath].exports.requireAuth = (req, _res, next) => {
  req.user = { id: "eval", email: "eval@localhost" };
  next();
};

const express = require("express");
const aiRouter = require("../routes/ai");
const knowledge = require("../services/rag");

const EVAL_FILE = path.resolve(__dirname, "../../datasets/eval/assistant-questions.json");
const REPORT_DIR = path.resolve(__dirname, "../.data");

const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice("--only=".length).split(",")) : null;

async function main() {
  const evalSet = JSON.parse(fs.readFileSync(EVAL_FILE, "utf8"));
  const cases = evalSet.questions.filter((question) => !only || only.has(question.id));

  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRouter);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}/api/ai`;

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportFile = path.join(REPORT_DIR, `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  const log = (line) => {
    fs.appendFileSync(reportFile, `${line}\n`);
    console.log(line);
  };

  const started = Date.now();
  await knowledge.warmEmbeddings();
  log(`# ${cases.length} questions, embeddings ready in ${Math.round((Date.now() - started) / 1000)} s`);
  log(`# status ${await (await fetch(`${base}/status`)).text()}`);

  const byKind = {};
  let passed = 0;
  for (const question of cases) {
    const body =
      question.kind === "http"
        ? { config: evalSet.project, ...question.body }
        : {
            config: evalSet.project,
            ...(evalSet.assumptions ? { assumptions: evalSet.assumptions } : {}),
            locale: question.locale || "en",
            messages: [...(question.history || []), { role: "user", content: question.question }],
          };
    const askedAt = Date.now();
    const response = await fetch(`${base}/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    const seconds = Math.round((Date.now() - askedAt) / 1000);

    let ok;
    let detail = "";
    if (question.kind === "http") {
      ok = response.status === question.expectStatus;
      detail = ` status=${response.status}`;
    } else {
      const answer = text.split("[[AI_SOURCES]]")[0];
      const missing = question.mustMatch.filter((pattern) => !new RegExp(pattern, "i").test(answer));
      const banned = question.mustNotMatch.filter((pattern) => new RegExp(pattern, "i").test(answer));
      ok = response.status === 200 && missing.length === 0 && banned.length === 0;
      if (response.status !== 200) detail += ` status=${response.status}`;
      if (missing.length) detail += ` missing=${JSON.stringify(missing)}`;
      if (banned.length) detail += ` banned=${JSON.stringify(banned)}`;
    }

    byKind[question.kind] = byKind[question.kind] || { passed: 0, total: 0 };
    byKind[question.kind].total += 1;
    if (ok) {
      passed += 1;
      byKind[question.kind].passed += 1;
    }
    log(`\n## ${ok ? "PASS" : "FAIL"} [${question.id}] (${question.kind}) ${seconds}s${detail}\n${text.trim()}`);
  }

  const kinds = Object.entries(byKind).map(([kind, score]) => `${kind} ${score.passed}/${score.total}`).join(", ");
  log(`\n# score ${passed}/${cases.length} (${kinds})`);
  log(`# report: ${reportFile}`);
  server.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
