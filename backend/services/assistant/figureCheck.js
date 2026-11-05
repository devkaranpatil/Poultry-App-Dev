// Checking the figures in an answer against the material the model was given.
const { PASSAGE_CHARS } = require("./prompt");

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const asciiDigits = (text) => text.replace(/[०-९]/g, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit)));
const normaliseFigure = (figure) => figure.replace(/,/g, "").replace(/\.0+$/, "");
const FIGURE_PATTERN = /(\d[\d,]*(?:\.\d+)?)\s?([A-Za-z%°]{0,3})/g;
const DOSE_UNIT = /^(ml|l|g|kg|mg|mm|cm|m|ha|t|%|°|c|ec|sc|wp|sl|sq)$/i;
const AMOUNT_UNIT = /^(kg|g|mg|ml|l)$/i;

/**
 * Small models sometimes state a figure (a dose, a temperature, a rate) that is in none of the material they were
 * given. This lists every significant figure in the answer that appears in neither the passages the model saw
 * nor the project facts, so the reader is warned instead of trusting it. Citation numbers and list numbers are
 * ignored, as are small whole numbers without a unit.
 */
function unverifiedFigures(answer, passages, facts) {
  const shown = [passages.map((passage) => passage.text.slice(0, PASSAGE_CHARS)).join(" "), JSON.stringify(facts)].join(" ");
  const shownAscii = asciiDigits(shown).replace(/(\d),(\d)/g, "$1$2");
  const known = new Set([...shownAscii.matchAll(FIGURE_PATTERN)].map((match) => normaliseFigure(match[1])));
  const body = asciiDigits(answer).replace(/\[\d{1,2}\]/g, " ").replace(/^\s*\d+[.)]\s/gm, " ");
  const flagged = new Set();
  for (const match of body.matchAll(FIGURE_PATTERN)) {
    const figure = normaliseFigure(match[1]);
    const unit = match[2] || "";
    const significant = Number(figure) > 10 || figure.includes(".") || DOSE_UNIT.test(unit || "x");
    // An amount ("50 kg") must appear with its unit: the bare number 50 elsewhere (a 50% subsidy) does not
    // support it. A range counts ("2-3 kg" supports "2 kg").
    const amountUnsupported = AMOUNT_UNIT.test(unit) &&
      !new RegExp(`(^|[^\\d.])${figure.replace(".", "\\.")}(?![\\d.])[^a-z]{0,12}${unit}\\b`, "i").test(shownAscii);
    if (significant && (!known.has(figure) || amountUnsupported)) flagged.add(`${match[1]}${unit && DOSE_UNIT.test(unit) ? unit : ""}`);
  }
  return [...flagged].slice(0, 6);
}

module.exports = { unverifiedFigures };
