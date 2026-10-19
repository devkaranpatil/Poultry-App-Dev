// The assistant's language model, as the AI routes see it. It runs inside this server process (see
// services/llm): no external API, no key, nothing leaves the machine.

const engine = require("./llm/engine");

class AiNotConfiguredError extends Error {
  constructor(message) {
    super(message || 'The AI model is not installed. Run "npm run models:download" in backend/.');
    this.name = "AiNotConfiguredError";
  }
}

const getModel = () => engine.chatModelLabel();

/** True when the model weights are on disk (or a test engine is installed). */
const isAiConfigured = () => engine.isAvailable();

/** Test hook: swap in a fake engine exposing complete(), stream(), embed() and optionally status(). */
const setAiClientForTesting = (fake) => engine.setEngineForTesting(fake);

/** Missing weights are a configuration problem, not an outage. */
function rethrow(err) {
  if (err instanceof engine.ModelMissingError) throw new AiNotConfiguredError(err.message);
  throw err;
}

/**
 * One-shot request whose output must match `schema` (JSON Schema). The model is constrained to that schema
 * while it writes, so the result always parses. Returns the parsed object.
 */
async function generateJson({ system, prompt, schema, lane }) {
  try {
    // lane "helper" for side jobs (such as reading a what-if question), so the chat's warm context survives.
    const result = await engine.complete({ system, turns: [{ role: "user", content: prompt }], schema, ...(lane ? { lane, temperature: 0 } : {}) });
    if (!result || typeof result !== "object") throw new Error("The AI returned an empty response");
    return result;
  } catch (err) {
    return rethrow(err);
  }
}

/** A short free-text completion (no schema), for small helper tasks such as translating a search query. */
async function generateText({ system, prompt, maxTokens }) {
  try {
    // lane "helper": a side job must not overwrite the conversation the chat is keeping warm.
    const result = await engine.complete({ system, turns: [{ role: "user", content: prompt }], maxTokens, temperature: 0, lane: "helper" });
    return typeof result === "string" ? result : "";
  } catch (err) {
    return rethrow(err);
  }
}

/**
 * Streams a conversational reply. `turns` is [{ role: "user" | "assistant", content }] ending with the user's
 * latest message. Yields text chunks.
 */
async function* streamText({ system, turns, signal }) {
  try {
    yield* engine.stream({ system, turns, signal });
  } catch (err) {
    rethrow(err);
  }
}

module.exports = {
  AiNotConfiguredError,
  generateJson,
  generateText,
  getModel,
  isAiConfigured,
  setAiClientForTesting,
  streamText,
};
