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
  subsidy: ["assistance", "grant", "scheme"],
  scheme: ["subsidy", "assistance"],
  loan: ["credit", "bank", "finance"],
  shed: ["house", "housing"],
  house: ["shed"],
  housing: ["shed", "house"],
  chicken: ["bird", "poultry"],
  hen: ["layer", "bird"],
  bird: ["chicken", "poultry"],
  chick: ["chicks", "brooding"],
  egg: ["layer", "laying"],
  meat: ["broiler"],
  temp: ["temperature"],
  price: ["cost", "rate"],
  cost: ["rate", "norm"],
  mortality: ["death", "loss"],
  vaccine: ["vaccination", "immunisation"],
  vaccination: ["vaccine", "schedule"],
  disease: ["infection", "outbreak"],
  apart: ["separate", "quarantine"],
  join: ["mixing"],
  hygiene: ["biosecurity", "disinfection"],
  biosecurity: ["hygiene", "disinfection"],
  feeder: ["feeding", "feed"],
  drinker: ["water", "drinking"],
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

// Pages converted from HTML put each cell of a table in a paragraph of its own. Read one by one, every cell looks
// like a heading and its text was lost (the broiler vaccination schedule was in no passage at all).
const TABLE_MIN_CELLS = 4;
const isCellLine = (line) => line.trim().length <= 60 && wordCount(line) <= 8;
const isCellParagraph = (paragraph) => paragraph.split("\n").every(isCellLine);
const isHeadingParagraph = (paragraph) => !paragraph.includes("\n") && looksLikeHeading(paragraph);

/**
 * The paragraphs with each run of table cells joined into one: "Vaccination schedule: Age | Vaccine | ...", in
 * pieces of at most `maxWords` words. The run's first line, when it reads as a heading, stays its heading.
 */
function joinTables(paragraphs, maxWords) {
  const out = [];
  let index = 0;
  while (index < paragraphs.length) {
    let end = index;
    while (end < paragraphs.length && isCellParagraph(paragraphs[end])) end += 1;
    // The run's last line, before ordinary text, is that text's heading and not a cell.
    if (end < paragraphs.length && end > index && isHeadingParagraph(paragraphs[end - 1])) end -= 1;
    if (end - index < TABLE_MIN_CELLS) {
      out.push(paragraphs[index]);
      index += 1;
      continue;
    }
    const cells = paragraphs.slice(index, end).flatMap((paragraph) => paragraph.split("\n"));
    const heading = looksLikeHeading(cells[0]) ? cells.shift() : null;
    let piece = [];
    const flush = () => {
      if (piece.length) out.push(heading ? `${heading}\n${heading}: ${piece.join(" | ")}` : piece.join(" | "));
      piece = [];
    };
    for (const cell of cells) {
      if (piece.length && wordCount([...piece, cell].join(" ")) > maxWords) flush();
      piece.push(cell);
    }
    flush();
    index = end;
  }
  return out;
}

/**
 * Cuts a document into passages of about `maxWords` words with `overlapWords` of overlap, keeping paragraph
 * boundaries where possible. Each passage remembers the closest heading above it.
 */
function chunkText(text, { maxWords = 170, overlapWords = 30 } = {}) {
  const paragraphs = joinTables(
    String(text)
      .split(/\n\s*\n/)
      .map((p) => p.replace(/[ \t]+/g, " ").replace(/\n+/g, "\n").trim())
      .filter(Boolean),
    maxWords
  );

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

const ASKS_FOR_AMOUNT = /\b(how (long|many|much|old|often|far|high|wide|deep)|when|what age|at what|which day|how soon)\b/i;

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
  // A question asking for an amount is answered by a sentence with a number in it: between two sentences that
  // match it equally, "keep new birds separate for at least 21 days" beats "isolation of new birds is necessary".
  const wantsAmount = ASKS_FOR_AMOUNT.test(query);
  let best = 0;
  let bestScore = -1;
  sentences.forEach((sentence, index) => {
    const score = new Set(tokenize(sentence).filter((token) => wanted.has(token))).size + (wantsAmount && /\d/.test(sentence) ? 0.5 : 0);
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

/** Restores the degree sign some pages lose ("25-300C" really reads "25-30 °C", "950F" reads "95 °F"). */
function fixDegreeSigns(text) {
  return (
    text
      .replace(/\b(\d{2})0\s*-\s*(\d{2})0\s?([CF])\b/g, "$1-$2 °$3")
      .replace(/\b(\d{2,3})0\s?([CF])\b/g, "$1 °$2")
      // A weekly step ("reduced at the rate of 50F weekly", "reduce 50F every week") is a single digit: 5 °F.
      .replace(/\b(rate of |reduce[ds]? (?:by )?)(\d)0\s?([CF])\b/g, "$1$2 °$3")
  );
}

module.exports = { chunkText, expandQueryTokens, fixDegreeSigns, focusPassage, splitQuestion, stem, tokenize, wordCount };
