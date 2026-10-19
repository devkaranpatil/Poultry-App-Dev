// Text helpers for retrieval: tokenising (for keyword scoring) and cutting documents into passages.

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how i if in into is it its may " +
    "might more most must no not of on or our should so some such than that the their them then there these they this " +
    "to was we were what when where which who why will with would you your about also any each other per via"
  ).split(" ")
);

/** Light stemmer: enough to match plurals (houses/house, tomatoes/tomato) without a language model. */
function stem(token) {
  if (token.length <= 3 || !/^[a-z]+$/.test(token)) return token;
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("oes")) return token.slice(0, -2);
  if (/(xes|ches|shes|sses)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith("s") && !/(ss|us|is)$/.test(token)) return token.slice(0, -1);
  return token;
}

/**
 * Lower-cased word tokens in any script, stopwords removed. Combining marks (\p{M}) are part of a word:
 * in Devanagari the vowel signs and the virama are marks, so without them every Hindi word falls apart.
 */
function tokenize(text) {
  const words = String(text).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  const out = [];
  for (const word of words) {
    if (word.length < 2 || STOPWORDS.has(word)) continue;
    out.push(stem(word));
  }
  return out;
}

const wordCount = (text) => (text.match(/\S+/g) || []).length;

/**
 * Words people use that the documents word differently. Added to a question's keywords (never to the
 * documents), so "maximum area" also finds "max area" and "subsidy" finds "pattern of assistance".
 */
const QUERY_SYNONYMS = {
  maximum: ["max", "limit"],
  max: ["maximum", "limit"],
  minimum: ["min"],
  subsidy: ["assistance", "grant"],
  polyhouse: ["greenhouse", "poly"],
  greenhouse: ["polyhouse"],
  poly: ["polyhouse", "greenhouse"],
  temp: ["temperature"],
  price: ["cost", "rate"],
  cost: ["rate", "norm"],
  yield: ["production"],
  pest: ["insect"],
  disease: ["pathogen"],
};

/** The question's tokens plus their synonyms, without duplicates. */
function expandQueryTokens(tokens) {
  const out = new Set(tokens);
  for (const token of tokens) for (const synonym of QUERY_SYNONYMS[token] || []) out.add(stem(synonym));
  return [...out];
}

/**
 * Splits a compound question ("what is X, and what is Y?") into its parts, so each part is searched on its
 * own instead of one part drowning out the other. Returns the original question when it is a single question.
 */
function splitQuestion(question, maxParts = 3) {
  const parts = String(question)
    .split(/\?+\s*|;\s*|\s+and\s+(?=(?:what|how|which|where|when|why|is|are|does|do|can|should)\b)/i)
    .map((part) => part.trim())
    .filter((part) => wordCount(part) >= 3);
  return parts.length > 1 ? parts.slice(0, maxParts) : [String(question).trim()];
}

/** A short line with no sentence punctuation is treated as a heading for the passages that follow. */
function looksLikeHeading(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return false;
  if (/[.,;:]$/.test(trimmed) || /\|/.test(trimmed)) return false;
  if (wordCount(trimmed) > 12) return false;
  return /^[A-Z0-9(]/.test(trimmed);
}

/** Splits a paragraph into sentence-sized pieces so no single unit is huge. */
function splitSentences(paragraph) {
  // Split after sentence punctuation that is followed by a space, so decimals like "13.4 mg" stay whole.
  return paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
}

/**
 * Cuts a document into passages of about `maxWords` words with `overlapWords` of overlap, keeping paragraph
 * boundaries where possible. Each passage remembers the closest heading above it.
 */
function chunkText(text, { maxWords = 170, overlapWords = 30 } = {}) {
  const paragraphs = String(text)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/\n+/g, "\n").trim())
    .filter(Boolean);

  const units = []; // { text, section }
  let section = "";
  for (const paragraph of paragraphs) {
    const body = [];
    for (const line of paragraph.split("\n")) {
      if (body.length === 0 && looksLikeHeading(line)) section = line.trim();
      else body.push(line);
    }
    const joined = body.join(" ").trim();
    if (!joined) continue;
    let piece = "";
    for (const sentence of splitSentences(joined)) {
      if (piece && wordCount(piece) + wordCount(sentence) > maxWords) {
        units.push({ text: piece, section });
        piece = "";
      }
      piece = piece ? `${piece} ${sentence}` : sentence;
    }
    if (piece.trim()) units.push({ text: piece.trim(), section });
  }

  const chunks = [];
  let buffer = []; // paragraphs in the passage being built (the first may be the overlap carried over)
  let fresh = 0; // how many of them are new, not carried-over overlap
  let words = 0;
  let current = "";
  const emit = () => {
    if (fresh > 0) chunks.push({ text: buffer.join("\n"), section: current });
  };
  for (const unit of units) {
    const size = wordCount(unit.text);
    if (fresh > 0 && words + size > maxWords) {
      emit();
      const tail = buffer.join(" ").split(/\s+/).slice(-overlapWords).join(" ");
      buffer = overlapWords > 0 && tail ? [tail] : [];
      words = wordCount(tail);
      fresh = 0;
    }
    if (fresh === 0) current = unit.section || current;
    buffer.push(unit.text);
    fresh += 1;
    words += size;
  }
  emit();
  return chunks.filter((chunk) => wordCount(chunk.text) >= 12);
}

/**
 * The part of a passage that answers the question, at most `maxChars` long. A passage can hold two topics
 * (leaf miner, then whitefly); showing only its first characters would hide the second. The window starts at
 * the sentence sharing most words with the question, runs forward, then backward if there is room.
 */
function focusPassage(text, query, maxChars = 650) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const sentences = splitSentences(clean);
  const wanted = new Set(expandQueryTokens(tokenize(query)));
  let best = 0;
  let bestScore = -1;
  sentences.forEach((sentence, index) => {
    const score = new Set(tokenize(sentence).filter((token) => wanted.has(token))).size;
    if (score > bestScore) [best, bestScore] = [index, score];
  });

  const budget = maxChars - 2; // room for the "…" marks
  let first = best;
  let last = best;
  let length = sentences[best].length;
  while (last + 1 < sentences.length && length + 1 + sentences[last + 1].length <= budget) length += 1 + sentences[++last].length;
  while (first > 0 && length + 1 + sentences[first - 1].length <= budget) length += 1 + sentences[--first].length;

  let window = sentences.slice(first, last + 1).join(" ");
  if (window.length > budget) window = window.slice(0, budget).replace(/\s+\S*$/, "");
  return `${first > 0 ? "…" : ""}${window}${last < sentences.length - 1 || window.length < length ? "…" : ""}`;
}

/** Restores the degree sign some pages lose ("25-300C" really reads "25-30 C"). */
function fixDegreeSigns(text) {
  return text.replace(/\b(\d{2})0\s*-\s*(\d{2})0\s?C\b/g, "$1-$2 °C").replace(/\b(\d{2})0\s?C\b/g, "$1 °C");
}

module.exports = { chunkText, expandQueryTokens, fixDegreeSigns, focusPassage, splitQuestion, stem, tokenize, wordCount };
