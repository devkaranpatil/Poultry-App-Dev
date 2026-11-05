// Turning a chat into a search of the knowledge base: the turns to send, the English query and the ranking boosts.
const { generateText } = require("../ai");
const knowledge = require("../rag");

const PROMPT_CHAT_TURNS = 6; // actually sent to the model: older turns only cost time on a CPU

/** Passages about this project's district, bird and shed rank higher when they also match the question. */
function projectBoosts(config) {
  return [
    config.district ? { tag: "district", value: config.district, factor: 1.8 } : null,
    config.birdType ? { tag: "bird", value: config.birdType, factor: 1.08 } : null,
    config.housingSystem ? { tag: "housing", value: config.housingSystem, factor: 1.08 } : null,
  ].filter(Boolean);
}

// The bird a question names. The guides for that bird rank a little higher, so a broiler question is not answered
// from the long layer tables of the disease page; the boost is small, since large ones crowd out the right text.
const BIRD_WORDS = {
  broiler: /\bbroilers?\b|ब्रॉयलर/i,
  layer: /\blayers?\b|\bhens?\b|\begg[\s-]*laying\b|लेयर/i,
  desi: /\bdesi\b|देसी|vanaraja|kaveri|giriraja|gramapriya|kadaknath|backyard/i,
};

function questionBoosts(query) {
  return Object.entries(BIRD_WORDS)
    .filter(([, words]) => words.test(query))
    .map(([bird]) => ({ tag: "birdKind", value: bird, factor: 1.15 }));
}

async function retrieve(query, config, k) {
  return knowledge.search(query, { k, boosts: [...projectBoosts(config), ...questionBoosts(query)] });
}

/** The last few turns, starting on a user turn, so the model sees context without a long prompt. */
function promptTurns(turns) {
  const recent = turns.slice(-PROMPT_CHAT_TURNS);
  const firstUser = recent.findIndex((turn) => turn.role === "user");
  return recent.slice(Math.max(firstUser, 0));
}

/** A short follow-up ("and for cucumber?") is searched together with the question before it. */
function retrievalQuery(turns) {
  const question = turns[turns.length - 1].content;
  if (question.split(/\s+/).length >= 6) return question;
  const previous = [...turns.slice(0, -1)].reverse().find((turn) => turn.role === "user");
  return previous ? `${previous.content} ${question}` : question;
}

const hasIndicScript = (text) => /[ऀ-ॿ]/.test(text);

// Farming words a small translation model gets wrong ("शिमला मिर्च" is capsicum, not the city of Shimla). They are
// swapped for English before the model sees the question, because a small model ignores a glossary hint.
// Longer phrases come first so they win over the words inside them.
const FARMING_TERMS = [
  ["ब्रॉयलर", "broiler"], ["ब्रायलर", "broiler"], ["लेयर", "layer"], ["देसी मुर्गी", "desi chicken"], ["गावरान कोंबडी", "desi chicken"],
  ["कड़कनाथ", "kadaknath"], ["कडकनाथ", "kadaknath"], ["वनराजा", "vanaraja"], ["मुर्गी पालन", "poultry farming"],
  ["कुक्कुटपालन", "poultry farming"], ["कुक्कुट पालन", "poultry farming"], ["पोल्ट्री", "poultry"], ["मुर्गियां", "chickens"],
  ["मुर्गी", "chicken"], ["कोंबड्या", "chickens"], ["कोंबडी", "chicken"], ["चूजे", "chicks"], ["चूजा", "chick"], ["पिल्ले", "chicks"],
  ["अंडे", "eggs"], ["अंडा", "egg"], ["अंडी", "eggs"], ["दाना", "feed"], ["खाद्य", "feed"], ["चारा", "feed"], ["शेड", "shed"],
  ["टीकाकरण", "vaccination"], ["लसीकरण", "vaccination"], ["टीका", "vaccine"], ["बर्ड फ्लू", "bird flu"],
  ["मृत्यु दर", "mortality"], ["मरतुक", "mortality"], ["ठेका", "contract"], ["करार", "contract"], ["अनुदान", "subsidy"],
  ["सब्सिडी", "subsidy"], ["सबसिडी", "subsidy"], ["कर्ज", "loan"], ["ऋण", "loan"], ["गर्मी", "heat"], ["उष्णता", "heat"],
  ["तापमान", "temperature"], ["रोग", "disease"], ["लागत", "cost"], ["खर्च", "cost"], ["जिला", "district"], ["जिल्हा", "district"],
  ["मौसम", "weather"], ["हवामान", "climate"], ["सरकार", "government"], ["पानी", "water"], ["पाणी", "water"],
  // Not a bare "लिटर", which is also a litre of water.
  ["डीप लिटर", "deep litter"], ["डीप-लिटर", "deep litter"], ["बिछावन", "litter"], ["जगह", "space"], ["जागा", "space"],
];

function withEnglishFarmingTerms(text) {
  return FARMING_TERMS.reduce((out, [local, english]) => out.split(local).join(` ${english} `), text).replace(/\s+/g, " ").trim();
}

const isFollowUp = (turns) =>
  turns[turns.length - 1].content.split(/\s+/).length < 6 && turns.slice(0, -1).some((turn) => turn.role === "user");

/**
 * What to search for, in English. The documents are in English, so a Hindi or Marathi question is translated
 * first. A short follow-up ("And gerbera?") is rewritten into a full question, because searching it together
 * with the earlier question finds the earlier topic instead. Both use the small "helper" lane; if it fails,
 * the plain retrieval query is searched (embeddings still work across languages, just less precisely).
 * Returns { query, standalone }: standalone is the rewritten follow-up, or null.
 */
async function searchText(turns) {
  const fallback = retrievalQuery(turns);
  const followUp = isFollowUp(turns);
  if (!followUp && !hasIndicScript(fallback)) return { query: fallback, standalone: null };

  const question = withEnglishFarmingTerms(turns[turns.length - 1].content);
  const previous = [...turns.slice(0, -1)].reverse().find((turn) => turn.role === "user");
  try {
    const english = await generateText(
      followUp
        ? {
            system: "Rewrite the follow-up as one complete, standalone question in English about poultry farming in India, using the earlier question only for context. Reply with the question only.",
            prompt: `Earlier question: ${withEnglishFarmingTerms(previous.content)}\nFollow-up: ${question}`,
            maxTokens: 60,
          }
        : {
            system: "Translate the user's message into English for a search about poultry farming in India. Reply with the translation only, no notes. Keep any English words as they are.",
            prompt: question,
            maxTokens: 80,
          }
    );
    const text = english.trim();
    if (!text || hasIndicScript(text)) return { query: fallback, standalone: null };
    return { query: text, standalone: followUp ? text : null };
  } catch {
    return { query: fallback, standalone: null };
  }
}

module.exports = { retrieve, promptTurns, retrievalQuery, withEnglishFarmingTerms, searchText };
