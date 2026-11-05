// The project review: the shape the model must return, and the clean-up of what it actually returned.

const ADVISOR_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "3-4 sentence executive summary of the project's viability." },
    verdict: { type: "string", enum: ["strong", "viable", "marginal", "weak"] },
    strengths: { type: "array", items: { type: "string" }, description: "2-4 strengths, one short sentence each." },
    risks: {
      type: "array",
      description: "2-4 key risks.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title", "detail", "severity"],
      },
    },
    recommendations: {
      type: "array",
      description: "3-5 prioritised, actionable recommendations.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          category: { type: "string", enum: ["structure", "birds", "climate", "cost", "operations"] },
          impact: { type: "string", description: "Expected effect, e.g. 'Reduces heat stress'." },
        },
        required: ["title", "detail", "category", "impact"],
      },
    },
  },
  required: ["summary", "verdict", "strengths", "risks", "recommendations"],
};

const str = (value, max = 600) => String(value ?? "").trim().slice(0, max);
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

function cleanAdvisor(raw) {
  return {
    summary: str(raw?.summary, 1200),
    verdict: oneOf(raw?.verdict, ["strong", "viable", "marginal", "weak"], "viable"),
    strengths: list(raw?.strengths, 5).map((item) => str(item)).filter(Boolean),
    risks: list(raw?.risks, 6)
      .map((risk) => ({
        title: str(risk?.title, 120),
        detail: str(risk?.detail),
        severity: oneOf(risk?.severity, ["low", "medium", "high"], "medium"),
      }))
      .filter((risk) => risk.title),
    recommendations: list(raw?.recommendations, 8)
      .map((rec) => ({
        title: str(rec?.title, 120),
        detail: str(rec?.detail),
        category: oneOf(rec?.category, ["structure", "birds", "climate", "cost", "operations"], "operations"),
        impact: str(rec?.impact, 160),
      }))
      .filter((rec) => rec.title),
  };
}

module.exports = { ADVISOR_SCHEMA, cleanAdvisor };
