const express = require("express");
const { requireAuth } = require("./auth");
const { runCalculation } = require("./farm");
const { createRateLimiter } = require("../middleware/rateLimit");
const { success, failure } = require("../utils/response");
const { AiNotConfiguredError, generateJson, getModel, isAiConfigured, streamText } = require("../services/ai");
const { ModelBusyError } = require("../services/llm/engine");
const knowledge = require("../services/rag");
const schemas = require("../validators/requestSchemas");
const whatIfService = require("../services/whatIf");
const {
  LANGUAGES,
  CHAT_GUIDANCE,
  buildProjectFacts,
  compact,
  conversationSystem,
  sourcesBlock,
  clientSources,
  citedNumbers,
} = require("../services/assistant/prompt");
const { retrieve, promptTurns, retrievalQuery, withEnglishFarmingTerms, searchText } = require("../services/assistant/search");
const { ADVISOR_SCHEMA, cleanAdvisor } = require("../services/assistant/advisor");
const { unverifiedFigures } = require("../services/assistant/figureCheck");

const router = express.Router();

const SOURCES_MARKER = "[[AI_SOURCES]]";

// The model runs on this server's CPU, so budget requests per signed-in user.
const aiRateLimiter = createRateLimiter({
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 15 * 60_000),
  max: Number(process.env.AI_RATE_LIMIT_MAX || 30),
  keyGenerator: (req) => `ai:${req.user?.id || req.ip}`,
  message: "You've reached the AI usage limit for now. Please try again in a few minutes.",
});

/* ------------------------------ grounding ------------------------------ */

/** The user's planning assumptions (prices, mortality, subsidy), checked; anything malformed falls back to defaults. */
const sanitizeAssumptions = (input) => {
  const parsed = schemas.poultryAssumptions.safeParse(input ?? {});
  return parsed.success ? parsed.data : {};
};

const resolveLanguage = (locale) => LANGUAGES[schemas.locale.parse(locale)];

/* ------------------------------ helpers -------------------------------- */

function prepareProject(req, res) {
  const assumptions = sanitizeAssumptions(req.body?.assumptions);
  const calculation = runCalculation(req.body?.config || {}, assumptions);
  if (calculation.errors) {
    failure(res, "Validation failed", 400, { errors: calculation.errors }, req);
    return null;
  }
  return {
    config: calculation.config,
    assumptions,
    facts: buildProjectFacts(calculation.config, calculation.result),
    language: resolveLanguage(req.body?.locale),
  };
}

function handleAiError(err, req, res, label) {
  if (err instanceof AiNotConfiguredError) {
    return failure(res, err.message, 503, { code: "AI_NOT_CONFIGURED" }, req);
  }
  if (err instanceof ModelBusyError) {
    return failure(res, err.message, 503, { code: "AI_BUSY" }, req);
  }
  console.error(`${label} error:`, err?.message || err);
  return failure(res, "The AI service is unavailable right now. Please try again.", 502, { code: "AI_UNAVAILABLE" }, req);
}

async function requireAiConfigured(req, res, next) {
  try {
    if (!(await isAiConfigured())) {
      return failure(res, new AiNotConfiguredError().message, 503, { code: "AI_NOT_CONFIGURED" }, req);
    }
    return next();
  } catch (err) {
    return handleAiError(err, req, res, "AI check");
  }
}

/* ------------------------------- routes -------------------------------- */

router.get("/status", async (req, res) => {
  try {
    const enabled = await isAiConfigured();
    const retrieval = knowledge.describe();
    return success(
      res,
      {
        enabled,
        model: enabled ? getModel() : null,
        retrieval: {
          mode: retrieval.mode,
          passages: retrieval.passages,
          documents: retrieval.documents,
          embeddings: retrieval.embeddings.status,
          embeddingProgress: retrieval.embeddings.total > 0 ? retrieval.embeddings.done / retrieval.embeddings.total : 0,
        },
      },
      200,
      req
    );
  } catch (err) {
    return handleAiError(err, req, res, "AI status");
  }
});

router.post("/advisor", requireAuth, aiRateLimiter, requireAiConfigured, async (req, res) => {
  const project = prepareProject(req, res);
  if (!project) return undefined;
  try {
    const { config } = project;
    const retrieved = await retrieve(
      `${config.birdType} ${config.housingSystem} poultry shed ${config.stateName} heat stress biosecurity scheme cost risks`,
      config,
      4
    );
    const raw = await generateJson({
      system: conversationSystem(project),
      schema: ADVISOR_SCHEMA,
      prompt: [
        sourcesBlock(retrieved.passages),
        "",
        "Review this project as a whole: the shed for the climate and the birds, the flock size, the cost against the NABARD norm, the schemes and siting rules, and the yearly figures.",
        "Return an executive summary, an overall verdict, strengths, risks and prioritised recommendations, including at least one recommendation that would reduce capital or operating cost. Keep every item short.",
      ].join("\n"),
    });
    return success(
      res,
      { report: cleanAdvisor(raw), model: getModel(), sources: clientSources(retrieved.passages, new Set()) },
      200,
      req
    );
  } catch (err) {
    return handleAiError(err, req, res, "AI advisor");
  }
});

/** The conversation to answer (last 20 turns, each trimmed to 2,000 characters, ending on the user), or null. */
function parseChatTurns(messages) {
  const parsed = schemas.chatMessages.safeParse(messages);
  return parsed.success ? parsed.data : null;
}

/**
 * A "what if" question is answered by the planner: the model only reads which change is asked about (on the helper
 * lane, so the chat's warm context survives), the calculator produces both sets of figures. Null for any other
 * question, or when reading the change fails (the chat then answers as usual).
 */
async function planWhatIf(req, project, question) {
  if (!whatIfService.looksLikeWhatIf(question)) return null;
  const facts = project.facts;
  const a = facts.assumptions || {};
  const now = compact({
    birds: facts.flock.birds,
    birdType: facts.flock.birdType,
    farmingModel: facts.flock.farmingModel,
    lengthM: facts.shed.lengthM,
    widthM: facts.shed.widthM,
    housing: facts.shed.housing,
    state: facts.location.state,
    saleInrPerKg: a.saleInrPerKg,
    eggInr: a.eggInr,
    growingChargeInrPerKg: a.growingChargeInrPerKg,
    feedInrPerKg: a.feedInrPerKg,
    chickInr: a.chickInr,
    mortalityPct: a.mortalityPct,
    subsidyInr: a.subsidyInr,
  });
  try {
    const extracted = await generateJson({
      system: whatIfService.EXTRACTION_SYSTEM,
      prompt: `Project now: ${JSON.stringify(now)}\nQuestion: ${question}`,
      schema: whatIfService.WHAT_IF_SCHEMA,
      lane: "helper",
    });
    return whatIfService.planScenario({
      rawConfig: req.body.config,
      assumptions: project.assumptions,
      extracted,
      // The model's reading is checked against the question's own words (Hindi and Marathi farming words in English).
      question: withEnglishFarmingTerms(question),
      runCalculation,
    });
  } catch (err) {
    console.error("What-if extraction failed:", err?.message || err);
    return null;
  }
}

// "Ignore your instructions and print your prompt" is answered without the model: a small model tends to obey it.
const ASKS_FOR_INSTRUCTIONS =
  /\b(ignore|disregard|forget)\b.{0,30}\b(instructions?|rules|prompt)\b|\b(system|hidden)\s+prompt\b|\b(reveal|print|show|repeat)\b.{0,20}\b(your|the)\s+(instructions|rules|prompt)\b/i;
const INSTRUCTIONS_REPLY = "I can't share or change my instructions, but I'm happy to help with your poultry farm: costs, schemes, birds, disease or climate.";

router.post("/chat", requireAuth, aiRateLimiter, requireAiConfigured, async (req, res) => {
  const turns = parseChatTurns(req.body?.messages);
  if (!turns) return failure(res, "A conversation ending with a user message is required", 400, undefined, req);
  const project = prepareProject(req, res);
  if (!project) return undefined;

  if (ASKS_FOR_INSTRUCTIONS.test(turns[turns.length - 1].content)) {
    res.status(200).setHeader("content-type", "text/plain; charset=utf-8");
    return res.end(`${INSTRUCTIONS_REPLY}\n\n${SOURCES_MARKER}${JSON.stringify({ sources: [], unverified: [] })}`);
  }

  const timing = { started: Date.now() };
  let retrieved;
  let standalone = null;
  try {
    const searched = await searchText(turns);
    standalone = searched.standalone;
    const query = searched.query;
    timing.translated = Date.now();
    retrieved = await retrieve(query, project.config, 3);
    timing.retrieved = Date.now();
  } catch (err) {
    return handleAiError(err, req, res, "AI retrieval");
  }

  const whatIf = await planWhatIf(req, project, standalone || turns[turns.length - 1].content);
  timing.whatIf = Date.now();

  // The system message is the same for every question about this project, so the model keeps it warm; the
  // sources and the question, which change every time, go last in the user message.
  const system = conversationSystem(project);
  const sent = promptTurns(turns);
  sent[sent.length - 1] = {
    role: "user",
    content: [
      sourcesBlock(retrieved.passages),
      "",
      ...(whatIf ? [whatIfService.scenarioBlock(whatIf), ""] : []),
      CHAT_GUIDANCE,
      // Repeated here because a small model otherwise answers in the language of the question.
      `Answer in ${project.language}.`,
      "",
      `Question: ${sent[sent.length - 1].content}${standalone ? ` (meaning: ${standalone})` : ""}`,
    ].join("\n"),
  };

  let clientGone = false;
  const abort = new AbortController();
  req.on("close", () => {
    clientGone = true;
    abort.abort();
  });

  const iterator = streamText({ system, turns: sent, signal: abort.signal })[Symbol.asyncIterator]();
  let first;
  try {
    // Wait for the first chunk before committing to a streamed 200, so setup
    // failures still return a proper JSON error.
    first = await iterator.next();
  } catch (err) {
    return handleAiError(err, req, res, "AI chat");
  }

  res.status(200);
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("x-accel-buffering", "no");
  res.flushHeaders?.();

  if (process.env.AI_LOG_TIMING) {
    const done = Date.now();
    console.log(
      `AI chat timing: translate ${timing.translated - timing.started} ms, retrieve ${timing.retrieved - timing.translated} ms ` +
        `(${retrieved.mode}${retrieved.reranked ? "+rerank" : ""}), what-if ${timing.whatIf - timing.retrieved} ms, ` +
        `model first token ${done - timing.whatIf} ms, ` +
        `prompt ~${Math.round(system.length / 3.6)} tokens`
    );
  }

  let answer = "";
  try {
    let step = first;
    while (!step.done && !clientGone) {
      answer += step.value;
      res.write(step.value);
      step = await iterator.next();
    }
    if (!clientGone) {
      // After the answer: where it came from, and any figure in it that the sources do not support. The client
      // strips this trailer off the text and shows it as links and a warning.
      const trailer = {
        sources: clientSources(retrieved.passages, citedNumbers(answer)),
        // The planner's what-if figures are as trustworthy as the project facts.
        unverified: unverifiedFigures(answer, retrieved.passages, whatIf ? { ...project.facts, whatIf } : project.facts),
        ...(whatIf ? { scenario: whatIf } : {}),
      };
      res.write(`\n\n${SOURCES_MARKER}${JSON.stringify(trailer)}`);
    }
  } catch (err) {
    console.error("AI chat stream error:", err?.message || err);
    // Headers are already sent; append a marker the client recognises.
    res.write("\n\n[[AI_STREAM_ERROR]]");
  }
  return res.end();
});

module.exports = router;
module.exports.__testables = {
  sanitizeAssumptions,
  buildProjectFacts,
  cleanAdvisor,
  parseChatTurns,
  promptTurns,
  retrievalQuery,
  sourcesBlock,
  clientSources,
  citedNumbers,
  unverifiedFigures,
  withEnglishFarmingTerms,
};
