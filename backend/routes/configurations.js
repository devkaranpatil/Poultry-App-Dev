const express = require("express");
const crypto = require("crypto");
const { configurations } = require("../repositories");
const { requireAuth } = require("./auth");
const { success, failure } = require("../utils/response");

const { configurationId, firstIssue, saveConfigurationBody } = require("../validators/requestSchemas");

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const records = await configurations.listByUser(req.user.id);
    return success(res, { configurations: records }, 200, req);
  } catch (err) {
    console.error("List configurations error", err);
    return failure(res, "Failed to load configurations", 500, undefined, req);
  }
});

router.post("/", async (req, res) => {
  const parsed = saveConfigurationBody.safeParse(req.body ?? {});
  if (!parsed.success) return failure(res, firstIssue(parsed.error), 400, undefined, req);
  const { name, config, configType } = parsed.data;

  try {
    const saved = await configurations.upsert({
      id: crypto.randomUUID(),
      userId: req.user.id,
      name,
      normalizedName: name.toLowerCase(),
      configType,
      config,
      now: new Date(),
    });
    // The name belongs to a setup this app does not own (saved by the polyhouse planner on the same account).
    if (!saved) return failure(res, "That name is already used by another saved project. Choose another name.", 409, undefined, req);
    const { created, ...configuration } = saved;

    return success(res, { configuration }, created ? 201 : 200, req);
  } catch (err) {
    console.error("Save configuration error", err);
    return failure(res, "Failed to save configuration", 500, undefined, req);
  }
});

router.delete("/:id", async (req, res) => {
  const parsedId = configurationId.safeParse(String(req.params.id || "").trim());
  // Not a UUID: it cannot be one of this user's rows. Same answer as a missing row, so ids cannot be probed.
  if (!parsedId.success) return failure(res, "Configuration not found", 404, undefined, req);
  const id = parsedId.data;

  try {
    const deleted = await configurations.deleteForUser(id, req.user.id);

    if (!deleted) {
      return failure(res, "Configuration not found", 404, undefined, req);
    }

    return success(res, { id }, 200, req);
  } catch (err) {
    console.error("Delete configuration error", err);
    return failure(res, "Failed to delete configuration", 500, undefined, req);
  }
});

module.exports = router;
