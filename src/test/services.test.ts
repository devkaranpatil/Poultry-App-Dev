import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiRequestError,
  getAiStatus,
  requestAdvisorReport,
  streamChat,
} from '@/services/ai.service';
import { createConfiguration, deleteConfiguration, listConfigurations } from '@/services/configuration.service';
import { DEFAULT_CONFIG } from '@/types/farm';

const config = { ...DEFAULT_CONFIG, state: 'Maharashtra', district: 'Nagpur' };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

/** A Response whose body streams the given chunks. */
function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn();
  responses.forEach((response) => fn.mockResolvedValueOnce(response));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ai.service', () => {
  it('reports status and falls back to disabled on network failure', async () => {
    mockFetch(jsonResponse({ enabled: true, model: 'Qwen3-1.7B-Q8_0' }));
    expect(await getAiStatus()).toEqual({ enabled: true, model: 'Qwen3-1.7B-Q8_0' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await getAiStatus()).toEqual({ enabled: false, model: null });
  });

  it('sends the mapped config, locale and the planning assumptions with the token', async () => {
    const fetchMock = mockFetch(jsonResponse({ report: { summary: 'ok', verdict: 'viable' } }));
    const report = await requestAdvisorReport('tok', { config, locale: 'mr', assumptions: { saleInrPerKg: 110, subsidyInr: 0 } });

    expect(report.verdict).toBe('viable');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/ai/advisor');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body.locale).toBe('mr');
    expect(body.config.stateName).toBe('Maharashtra');
    expect(body.config).not.toHaveProperty('state');
    // The server works out every figure from the setup and these assumptions.
    expect(body.assumptions).toEqual({ saleInrPerKg: 110, subsidyInr: 0 });
    expect(body).not.toHaveProperty('financials');
  });

  it('maps server errors to typed codes', async () => {
    mockFetch(jsonResponse({ message: 'not set', code: 'AI_NOT_CONFIGURED' }, 503));
    await expect(requestAdvisorReport('tok', { config, locale: 'en' })).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });

    mockFetch(jsonResponse({ message: 'slow down' }, 429));
    await expect(requestAdvisorReport('tok', { config, locale: 'en' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(requestAdvisorReport('tok', { config, locale: 'en' })).rejects.toBeInstanceOf(AiRequestError);
  });

  it('streams chat text progressively', async () => {
    mockFetch(streamResponse(['Monitor ', 'roofs ', 'vent heat.']));
    const seen: string[] = [];
    const final = await streamChat('tok', { config, locale: 'en' }, [{ role: 'user', content: 'Roof?' }], (text) => seen.push(text));
    expect(final).toBe('Monitor roofs vent heat.');
    expect(seen).toEqual(['Monitor ', 'Monitor roofs ', 'Monitor roofs vent heat.']);
  });

  it('checks the sources trailer: drops broken items and never links a non-web URL', async () => {
    const trailer = JSON.stringify({
      sources: [
        { n: 1, title: 'Unit costs', publisher: 'NABARD', url: 'https://www.nabard.org/x.pdf', section: null, cited: true },
        { n: 2, title: 'Trap', publisher: 'x', url: 'javascript:alert(1)', section: null, cited: true },
        { title: 'no number' },
      ],
      unverified: ['50kg'],
    });
    mockFetch(streamResponse(['Answer [1].', `\n\n[[AI_SOURCES]]${trailer}`]));
    const received: Array<[Array<{ n: number; url: string | null }>, string[]]> = [];
    await streamChat('tok', { config, locale: 'en' }, [{ role: 'user', content: 'Q' }], () => undefined, undefined, (sources, unverified) =>
      received.push([sources, unverified])
    );
    const [sources, unverified] = received[received.length - 1];
    expect(sources.map((source) => source.n)).toEqual([1, 2]);
    expect(sources[1].url).toBeNull();
    expect(unverified).toEqual(['50kg']);
  });

  it('surfaces a mid-stream failure marker as an error, keeping the partial text', async () => {
    mockFetch(streamResponse(['Partial answer', '\n\n[[AI_STREAM_ERROR]]']));
    const seen: string[] = [];
    await expect(
      streamChat('tok', { config, locale: 'en' }, [{ role: 'user', content: 'Hi' }], (text) => seen.push(text))
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(seen[seen.length - 1]).toBe('Partial answer');
  });
});

describe('configuration.service', () => {
  it('saves with configType and normalises listed configs', async () => {
    const saved = { id: 'c1', name: 'North', configType: 'poultry', config, updatedAt: '2026-10-10T00:00:00Z' };
    const fetchMock = mockFetch(
      jsonResponse({ configuration: saved }, 201),
      jsonResponse({ configurations: [{ ...saved, config: { ...config, roofType: 'dome' } }] }),
      jsonResponse({ id: 'c1' })
    );

    const created = await createConfiguration('tok', { name: 'North', configType: 'poultry', config });
    expect(created.configType).toBe('poultry');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ name: 'North', configType: 'poultry' });

    const listed = await listConfigurations('tok');
    expect(listed[0].config).toMatchObject({ roofType: DEFAULT_CONFIG.roofType });

    await deleteConfiguration('tok', 'c 1');
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/configurations/c%201');
  });
});
