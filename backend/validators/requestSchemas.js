/* =====================================================
   REQUEST BODY SCHEMAS (zod)
   Location: backend/validators/requestSchemas.js

   The shape of what clients may send to the routes that store data or reach the model. The planner
   configuration itself keeps its own rule set (configValidator.js), whose field-by-field messages the UI shows.
===================================================== */

const { z } = require("zod");

const MAX_NAME_LENGTH = 120;
const MAX_CHAT_TURNS = 20; // accepted from the client
const MAX_MESSAGE_CHARS = 2000;
const CONFIG_TYPES = ["greenhouse", "polyhouse"];
const FINANCIAL_FIELDS = [
  "subsidyPct",
  "operatingCostPct",
  "yieldPerSqm",
  "pricePerUnit",
  "netInvestment",
  "annualRevenue",
  "annualProfit",
  "paybackYears",
  "roi",
];

/** The first problem, as a sentence for the client. */
const firstIssue = (error) => error.issues[0]?.message || "Invalid request";

/* ---------------------------- saved configurations ---------------------------- */

const shortText = z.string().trim().max(80);
const dimension = z.number().finite().min(0).max(10_000);

/**
 * A saved setup may be incomplete (a draft), so every field is optional, but each one that is present must have
 * the right type and a sane size. Unknown keys are dropped, so nothing else ends up in the database.
 */
const savedConfig = z
  .object(
    {
      length: dimension,
      width: dimension,
      gutterHeight: dimension,
      ridgeHeight: dimension,
      greenhouseType: shortText,
      polyhouseType: shortText,
      roofType: shortText,
      structureMaterial: shortText,
      coverMaterial: shortText,
      sideVentilation: shortText,
      doorEntry: shortText,
      doorType: shortText,
      selectedCrop: shortText,
      irrigationSystem: shortText,
      state: shortText,
      stateName: shortText,
      district: shortText,
    },
    { error: (issue) => (issue.input === undefined ? "Configuration payload is required" : "Configuration payload must be an object") }
  )
  .partial();

const saveConfigurationBody = z.object({
  name: z
    .string({ error: "Configuration name is required" })
    .transform((value) => value.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH))
    .pipe(z.string().min(1, "Configuration name is required")),
  config: savedConfig,
  configType: z.enum(CONFIG_TYPES, { error: "Configuration type is invalid" }).default("greenhouse"),
});

/** Ids are UUIDs; anything else cannot exist, so the route answers 404 without a database query. */
const configurationId = z.uuid();

/* ------------------------------------ AI ------------------------------------ */

const chatMessage = z.object({
  // Anything that is not the assistant is the user: the client only ever sends these two.
  role: z.enum(["user", "assistant"]).catch("user"),
  content: z
    .string({ error: "Message content must be text" })
    .transform((value) => value.trim().slice(0, MAX_MESSAGE_CHARS))
    .pipe(z.string().min(1, "Message content is required")),
});

/** The last MAX_CHAT_TURNS turns of a conversation that ends with the user. Older turns are not checked. */
const chatMessages = z
  .array(z.unknown(), { error: "Messages must be a list" })
  .min(1, "A conversation ending with a user message is required")
  .transform((messages) => messages.slice(-MAX_CHAT_TURNS))
  .pipe(z.array(chatMessage))
  .refine((turns) => turns[turns.length - 1].role === "user", "A conversation ending with a user message is required");

/** The interface language; anything unknown falls back to English. */
const locale = z.enum(["en", "hi", "mr"]).catch("en");

const saneNumber = z.number().finite().refine((value) => Math.abs(value) < 1e12);

/**
 * The client's planning estimates. They only add context to the prompt, so a bad field is dropped instead of
 * failing the request; nothing usable at all gives null.
 */
const financials = z
  .object(Object.fromEntries(FINANCIAL_FIELDS.map((field) => [field, saneNumber.nullable().optional().catch(undefined)])))
  .transform((value) => {
    const kept = Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
    return Object.keys(kept).length > 0 ? kept : null;
  })
  .nullable()
  .catch(null);

/* ------------------------------- risk (Monte Carlo) ------------------------------- */

const finite = z.number({ error: "Must be a number" }).finite();

/**
 * One simulation request: the setup (checked by the planner's own validator afterwards), the user's planning
 * assumptions, and optional run settings. Trials and years are bounded so one request stays under a second.
 */
const riskRequest = z.object({
  config: z.record(z.string(), z.unknown(), { error: "A project configuration is required" }),
  assumptions: z.object(
    {
      subsidyPct: finite.min(0).max(100),
      yieldPerSqm: finite.positive().max(10_000),
      pricePerUnit: finite.positive().max(1_000_000),
      operatingCostPct: finite.min(0).max(100),
    },
    { error: "Planning assumptions are required" }
  ),
  options: z
    .object({
      years: z.number().int().min(1).max(15).default(5),
      discountRatePct: finite.min(0).max(30).default(10),
      trials: z.number().int().min(500).max(20_000).default(5000),
      seed: z.number().int().min(0).max(2 ** 31 - 1).default(1),
    })
    .prefault({}),
});

module.exports = {
  CONFIG_TYPES,
  FINANCIAL_FIELDS,
  MAX_CHAT_TURNS,
  MAX_MESSAGE_CHARS,
  MAX_NAME_LENGTH,
  chatMessages,
  configurationId,
  financials,
  firstIssue,
  locale,
  riskRequest,
  saveConfigurationBody,
};
