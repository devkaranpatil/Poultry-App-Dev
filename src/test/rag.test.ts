/** @vitest-environment node */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { chunkText, expandQueryTokens, fixDegreeSigns, focusPassage, splitQuestion, tokenize } = require('../../backend/services/rag/text');
const { createRetriever } = require('../../backend/services/rag/retriever');
const { createEmbeddingStore, hashText } = require('../../backend/services/rag/embeddingStore');
const { buildCorpus } = require('../../backend/services/rag/corpus');
const knowledge = require('../../backend/services/rag');
const { setAiClientForTesting } = require('../../backend/services/ai');

// A passage in the tests: only the fields each test cares about are filled in.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chunk = Record<string, any>;

const chunk = (id: string, text: string, extra: Chunk = {}): Chunk => ({
  id,
  docId: extra.docId ?? id,
  title: extra.title ?? id,
  section: '',
  text,
  priority: 1,
  tags: {},
  ...extra,
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-test-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
afterEach(() => {
  setAiClientForTesting(null);
  knowledge.useChunksForTesting(null);
  delete process.env.RAG_EMBEDDINGS_FILE;
});

describe('tokenising', () => {
  it('matches plurals and drops stopwords', () => {
    expect(tokenize('The tomatoes in the houses')).toEqual(tokenize('tomato house'));
    expect(tokenize('what is the cost')).toEqual(['cost']);
  });

  it('keeps Devanagari words', () => {
    expect(tokenize('शिमला मिर्च का तापमान')).toContain('तापमान');
  });
});

describe('chunking', () => {
  it('keeps decimal numbers whole instead of cutting the sentence at the point', () => {
    const text = 'Capsicum is rich in vitamins and minerals like Calcium (13.4 mg), Magnesium (14.9 mg) and Potassium (263.7 mg) per 100 g of fresh weight.';
    const joined = chunkText(`${text} ${text}`, { maxWords: 200 }).map((c: Chunk) => c.text).join(' ');
    expect(joined).toContain('(13.4 mg)');
    expect(joined).toContain('(263.7 mg)');
  });

  it('cuts long text into overlapping passages and remembers the heading', () => {
    const sentence = 'Water the crop with a drip line every second day in the morning hours.';
    const body = Array.from({ length: 60 }, () => sentence).join(' ');
    const chunks = chunkText(`Irrigation schedule\n\n${body}`, { maxWords: 100, overlapWords: 20 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].section).toBe('Irrigation schedule');
    expect(chunks.every((c: Chunk) => c.text.split(/\s+/).length <= 140)).toBe(true);
  });

  it('keeps a table whose cells are paragraphs of their own, under its heading', () => {
    const lighting = 'Broilers get light for 23 hours a day and one hour of darkness, so that they do not panic in a power cut.';
    const cells = ['Vaccination schedule', 'Age', 'Vaccine', 'Route', '14th day', 'IBD Vaccine', 'I/O or I/N', '21st day', 'RDV La Sota', 'Drinking water'];
    const sexing = 'Males grow faster than females and need more floor space, so they are reared separately from day-old to sale.';
    const chunks = chunkText([lighting, ...cells, 'Sex-separate rearing', sexing].join('\n\n'), { maxWords: 40, overlapWords: 0 });
    const table = chunks.find((c: Chunk) => c.text.includes('IBD Vaccine'));
    expect(table?.section).toBe('Vaccination schedule');
    expect(table?.text).toContain('Vaccination schedule: Age | Vaccine | Route | 14th day | IBD Vaccine | I/O or I/N | 21st day | RDV La Sota | Drinking water');
    // The heading of the text after the table stays a heading.
    expect(chunks.find((c: Chunk) => c.text.includes('Males grow faster'))?.section).toBe('Sex-separate rearing');
  });

  it('restores lost degree signs', () => {
    expect(fixDegreeSigns('day temperature of 25-300C and below 120C')).toBe('day temperature of 25-30 °C and below 12 °C');
    expect(fixDegreeSigns('about 100 plants')).toBe('about 100 plants');
    expect(fixDegreeSigns('90 to 950F for the first week and then reduce 50F every week')).toBe('90 to 95 °F for the first week and then reduce 5 °F every week');
  });

  it('shows the part of a long passage that answers the question, not just its start', () => {
    const leafMiner = 'Leaf miner larvae make serpentine mines in tomato leaves and the damage starts in the nursery. '.repeat(6);
    const whitefly = 'Whitefly transmits tomato leaf curl virus. Install yellow sticky traps at canopy level to monitor whitefly.';
    const shown = focusPassage(`${leafMiner}${whitefly}`, 'How do I control whitefly?', 300);
    expect(shown).toContain('yellow sticky traps');
    expect(shown.startsWith('…')).toBe(true);
    expect(shown.length).toBeLessThanOrEqual(300);
    expect(focusPassage('Short passage.', 'anything', 300)).toBe('Short passage.');
  });

  it('shows the sentence with the figure when the question asks how long', () => {
    const filler = 'Every shed should have its own equipment and its own workers, and visitors should stay outside. '.repeat(4);
    const passage = `Isolation and quarantine of new birds is necessary in a separate place. ${filler}New birds should be kept separate from old stock for at least 21 days before mixing.`;
    expect(focusPassage(passage, 'For how long should new birds be kept apart?', 200)).toContain('at least 21 days');
  });
});

describe('retrieval', () => {
  const passages = [
    chunk('capsicum', 'Capsicum needs a day temperature of 25 to 30 degrees and a night temperature of 18 to 20 degrees.'),
    chunk('tomato', 'Tomato prefers moderate temperature and well drained loamy soil with adequate organic matter.'),
    chunk('subsidy', 'Assistance of fifty percent of cost is given for greenhouse structures above the area limit.'),
    chunk('whitefly', 'Whitefly in polyhouse tomato is managed with yellow sticky traps and insect proof nets.'),
  ];

  it('ranks the passage that matches the words of the question first', () => {
    const retriever = createRetriever(passages);
    const hits = retriever.search('night temperature for capsicum', { k: 3 });
    expect(hits[0].chunk.id).toBe('capsicum');
  });

  it('finds a passage by meaning when no words match, once embeddings exist', () => {
    const retriever = createRetriever(passages);
    // Vectors stand in for an embedding model: the "subsidy" passage points the same way as the query.
    retriever.setVector(0, [1, 0, 0]);
    retriever.setVector(1, [0, 1, 0]);
    retriever.setVector(2, [0, 0, 1]);
    retriever.setVector(3, [0.5, 0.5, 0]);
    expect(retriever.search('सरकारी मदद कितनी मिलती है', { k: 3 })).toHaveLength(0); // no words match
    const hits = retriever.search('सरकारी मदद कितनी मिलती है', { queryVector: [0, 0, 1], k: 3 });
    expect(hits[0].chunk.id).toBe('subsidy');
  });

  it('keeps a strong keyword-only match in the results even when embeddings disagree', () => {
    const many = [
      chunk('exact', 'Whitefly control uses yellow sticky traps.'),
      ...Array.from({ length: 8 }, (_, i) => chunk(`noise${i}`, `Greenhouse irrigation note number ${i} about drip lines and fertigation.`)),
    ];
    const retriever = createRetriever(many);
    many.forEach((_, i) => retriever.setVector(i, i === 0 ? [0, 0, 1] : [1, i * 0.01, 0]));
    const hits = retriever.search('whitefly traps', { queryVector: [1, 0, 0], k: 3 });
    expect(hits.map((hit: Chunk) => hit.chunk.id)).toContain('exact');
  });

  it('favours passages about the project when they also match the question', () => {
    const climate = [
      chunk('pune', 'Climate of Pune district: hottest month May.', { tags: { district: 'Pune' } }),
      chunk('nashik', 'Climate of Nashik district: hottest month May.', { tags: { district: 'Nashik' } }),
    ];
    const retriever = createRetriever(climate);
    const hits = retriever.search('hottest month climate district', { k: 2, boosts: [{ tag: 'district', value: 'nashik', factor: 3 }] });
    expect(hits[0].chunk.id).toBe('nashik');
  });

  it('limits how many passages one document can contribute', () => {
    const same = Array.from({ length: 6 }, (_, i) => chunk(`d${i}`, `Polyhouse subsidy rule ${i} for protected cultivation.`, { docId: 'one-document' }));
    const hits = createRetriever(same).search('polyhouse subsidy', { k: 5, perDocument: 2 });
    expect(hits).toHaveLength(2);
  });

  it('prefers well-sourced passages through priority', () => {
    const items = [
      chunk('a', 'Cost norm for fan and pad structure.', { priority: 0.6 }),
      chunk('b', 'Cost norm for fan and pad structure.', { priority: 1.3 }),
    ];
    expect(createRetriever(items).search('fan and pad cost norm', { k: 2 })[0].chunk.id).toBe('b');
  });
});

describe('embedding cache', () => {
  it('stores vectors by text and returns them exactly', () => {
    const file = path.join(tmp, 'cache.json');
    const store = createEmbeddingStore({ file, model: 'model-a' });
    store.load();
    store.set(hashText('hello'), [0.25, -1.5, 3]);
    store.save();

    const reopened = createEmbeddingStore({ file, model: 'model-a' });
    expect(reopened.load()).toBe(1);
    expect([...reopened.get(hashText('hello'))]).toEqual([0.25, -1.5, 3]);
    expect(reopened.get(hashText('other'))).toBeNull();
  });

  it('ignores a cache made by a different embedding model', () => {
    const file = path.join(tmp, 'other-model.json');
    const first = createEmbeddingStore({ file, model: 'model-a' });
    first.set(hashText('hello'), [1, 2, 3]);
    first.save();
    expect(createEmbeddingStore({ file, model: 'model-b' }).load()).toBe(0);
  });
});

describe('knowledge base', () => {
  // Stands in for the embedding model: a bag-of-words vector over a small fixed vocabulary.
  const vocabulary = ['temperature', 'capsicum', 'subsidy', 'whitefly', 'rain', 'cost'];
  const embed = async (texts: string[]) =>
    texts.map((text) => Float32Array.from(vocabulary.map((word) => (text.toLowerCase().includes(word) ? 1 : 0.01))));

  it('is built from the official datasets and the planner itself', () => {
    const corpus = buildCorpus();
    const ids = new Set(corpus.documents.map((d: Chunk) => d.id));
    for (const id of [
      'dataset-nabard-unit-costs',
      'dataset-production-norms',
      'dataset-scheme-rules',
      'dataset-siting-rules',
      'dataset-district-climate',
      'planner-birds',
      'planner-cost-model',
      'planner-schemes',
      'planner-siting',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    // No polyhouse passages are left in the tables and the planner's data (the docs may mention the shared database).
    const generated = corpus.chunks.filter((c: Chunk) => c.kind !== 'document' && !c.docId.startsWith('planner-doc-'));
    expect(generated.some((c: Chunk) => /polyhouse|greenhouse/i.test(c.text))).toBe(false);
    const overview = corpus.chunks.find((c: Chunk) => c.docId === 'dataset-scheme-rules' && c.section === 'Subsidy overview');
    expect(overview?.text).toMatch(/no central capital subsidy/);
    const residential = corpus.chunks.find((c: Chunk) => c.docId === 'dataset-siting-rules' && /residential/i.test(c.text));
    expect(residential?.text).toMatch(/500 m/);
    const climate = corpus.chunks.filter((c: Chunk) => c.docId === 'dataset-district-climate');
    expect(climate.length).toBeGreaterThan(400);
    expect(climate[0].tags.district).toBeTruthy();
    expect(climate.some((c: Chunk) => /severe heat stress/.test(c.text))).toBe(true);
  });

  it('describes the planner rates straight from the norms, so they cannot drift', () => {
    const norms = require('../../shared/poultry-norms.json');
    const passages = buildCorpus().chunks.filter((c: Chunk) => c.docId === 'planner-cost-model');
    const shed = passages.find((c: Chunk) => c.section === 'shed (rs) per sqft');
    expect(shed?.text).toContain(`broiler ${norms.costs.shedInrPerSqft.broiler.value}`);
    expect(shed?.text).toContain('NABARD Unit Cost 2023-24');
    // Rates without a published source say so.
    const automatic = passages.find((c: Chunk) => c.section === 'equipment (rs) per bird');
    expect(automatic?.text).toMatch(/automatic 150 \(automatic feed and nipple lines\), the planner's own assumption/);
    const broiler = buildCorpus().chunks.find((c: Chunk) => c.docId === 'planner-birds' && c.tags.bird === 'broiler');
    expect(broiler?.text).toContain(`${norms.birdTypes.broiler.sqftPerBird['open-sided']} sq ft per bird in an open-sided shed`);
  });

  it('searches by keyword straight away and becomes hybrid once passages are embedded', async () => {
    process.env.RAG_EMBEDDINGS_FILE = path.join(tmp, 'index-cache.json');
    knowledge.useChunksForTesting([
      chunk('capsicum', 'Capsicum needs a warm day temperature.', { docId: 'crop' }),
      chunk('subsidy', 'The subsidy covers half of the cost.', { docId: 'rules' }),
      chunk('climate', 'Climate of Pune district temperature table.', { docId: 'dataset-district-climate' }),
    ]);

    setAiClientForTesting({
      embed,
      complete: async () => ({}),
      stream: async function* () {},
      status: () => ({ chatModel: 'm', embeddingModel: 'fake-embed' }),
    });

    const before = await knowledge.search('capsicum temperature', { k: 2 });
    expect(before.mode).toBe('keyword'); // nothing is embedded yet
    expect(before.passages[0].id).toBe('capsicum');

    await knowledge.warmEmbeddings();

    const state = knowledge.describe();
    expect(state.embeddings.status).toBe('ready');
    expect(state.embeddings.total).toBe(2); // the district climate passage is not embedded
    expect(state.mode).toBe('hybrid');

    const after = await knowledge.search('how much subsidy', { k: 2 });
    expect(after.mode).toBe('hybrid');
    expect(after.passages[0].id).toBe('subsidy');
    expect(fs.existsSync(process.env.RAG_EMBEDDINGS_FILE)).toBe(true);
  });

  it('falls back to keywords when the question cannot be embedded', async () => {
    process.env.RAG_EMBEDDINGS_FILE = path.join(tmp, 'fallback-cache.json');
    knowledge.useChunksForTesting([chunk('rain', 'Heavy rain needs good drainage around the polyhouse.', { docId: 'a' })]);
    let calls = 0;
    setAiClientForTesting({
      embed: async (texts: string[]) => {
        calls += 1;
        if (calls > 1) throw new Error('embedding model unavailable');
        return texts.map(() => Float32Array.from([1, 0]));
      },
      complete: async () => ({}),
      stream: async function* () {},
      status: () => ({ chatModel: 'm', embeddingModel: 'fake-embed-2' }),
    });
    await knowledge.warmEmbeddings();
    const result = await knowledge.search('heavy rain drainage', { k: 1 });
    expect(result.mode).toBe('keyword');
    expect(result.passages[0].id).toBe('rain');
  });

  it('reports the embedding model as unavailable when it is not installed', async () => {
    knowledge.useChunksForTesting([chunk('x', 'Some text about polyhouse structures and cost.', { docId: 'a' })]);
    setAiClientForTesting({ complete: async () => ({}), stream: async function* () {}, embed: undefined, status: () => ({ chatModel: 'm' }) });
    await knowledge.warmEmbeddings();
    expect(knowledge.describe().embeddings.status).toBe('unavailable');
  });
});

describe('question handling', () => {
  it('splits a compound question into its parts', () => {
    expect(splitQuestion('What is the maximum area per beneficiary and what is the cost norm for fan and pad?')).toEqual([
      'What is the maximum area per beneficiary',
      'what is the cost norm for fan and pad',
    ]);
    expect(splitQuestion('Temperature for capsicum? Humidity for tomato?')).toHaveLength(2);
  });

  it('does not split a single question, even one that contains "and"', () => {
    expect(splitQuestion('What is the cost norm for fan and pad?')).toEqual(['What is the cost norm for fan and pad?']);
  });

  it('adds the words documents use for the words people use', () => {
    const tokens = expandQueryTokens(tokenize('maximum subsidy for chicken shed'));
    for (const word of ['max', 'assistance', 'house', 'bird']) expect(tokens).toContain(tokenize(word)[0]);
  });
});

describe('reranking', () => {
  const documents = [
    chunk('wordy', 'Cost cost cost norm norm: the planner rates and the cost norm comparison for structures.', { docId: 'planner' }),
    chunk('answer', 'Fan and pad system cost norm is Rs 1400 per sq m.', { docId: 'norms' }),
    chunk('old', 'Fan and pad cost norm was Rs 1200 per sq m.', { docId: 'archive', status: 'older' }),
  ];
  const engineWith = (rerank: (query: string, texts: string[]) => Promise<number[]>) => ({
    complete: async () => ({}),
    stream: async function* () {},
    embed: undefined,
    rerank,
    status: () => ({ chatModel: 'm' }),
  });

  it('puts the passage that answers the question first, whatever the keyword order was', async () => {
    knowledge.useChunksForTesting(documents);
    setAiClientForTesting(engineWith(async (_query, texts) => texts.map((text) => (text.includes('Rs 1400') ? 0.95 : 0.1))));
    const result = await knowledge.search('fan and pad cost norm', { k: 2 });
    expect(result.reranked).toBe(true);
    expect(result.passages[0].id).toBe('answer');
    expect(result.passages.map((p: Chunk) => p.n)).toEqual([1, 2]);
  });

  it('halves the relevance of an older document so the current rule wins', async () => {
    knowledge.useChunksForTesting(documents);
    setAiClientForTesting(engineWith(async (_query, texts) => texts.map((text) => (text.includes('Rs 1200') ? 0.9 : text.includes('Rs 1400') ? 0.6 : 0.05))));
    const result = await knowledge.search('fan and pad cost norm', { k: 2 });
    expect(result.passages[0].id).toBe('answer'); // 0.6 beats 0.9 x 0.5
  });

  it("allows only one of the planner's own pages, so they cannot crowd out the crop guides", async () => {
    knowledge.useChunksForTesting([
      chunk('p1', 'Capsicum in the planner: yield 36-60 t/ha.', { docId: 'planner-crops', kind: 'planner' }),
      chunk('p2', 'Crops the planner suggests: capsicum, tomato.', { docId: 'planner-crops', kind: 'planner' }),
      chunk('guide', 'Capsicum needs a day temperature of 25-30 C.', { docId: 'guide' }),
    ]);
    setAiClientForTesting(engineWith(async (_query, texts) => texts.map((text) => (text.includes('planner') ? 0.9 : 0.5))));
    const result = await knowledge.search('capsicum temperature', { k: 3 });
    expect(result.passages.filter((p: Chunk) => p.kind === 'planner')).toHaveLength(1);
    expect(result.passages.map((p: Chunk) => p.id)).toContain('guide');
  });

  it('keeps the keyword order when the reranker fails', async () => {
    knowledge.useChunksForTesting(documents);
    setAiClientForTesting(
      engineWith(async () => {
        throw new Error('reranker crashed');
      })
    );
    const result = await knowledge.search('fan and pad cost norm', { k: 2 });
    expect(result.reranked).toBe(false);
    expect(result.passages.length).toBeGreaterThan(0);
  });
});

describe('document coverage', () => {
  it('counts a document as covered only when its text has real content', () => {
    const corpus = buildCorpus();
    const covered = new Set(corpus.documents.map((doc: { id: string }) => doc.id));
    expect(Array.isArray(corpus.unusable)).toBe(true);
    // An empty extraction is reported, never silently counted as coverage.
    for (const id of corpus.unusable) expect(covered.has(id)).toBe(false);
    for (const id of corpus.missing) expect(covered.has(id)).toBe(false);
  });

  it('tells the assistant which documents it cannot read', () => {
    const corpus = buildCorpus();
    if (corpus.unusable.length === 0) return;
    const gaps = corpus.chunks.filter((chunk: { docId: string }) => chunk.docId === 'knowledge-gaps');
    expect(gaps.some((chunk: { text: string }) => chunk.text.includes(corpus.unusable[0]))).toBe(true);
  });
});
