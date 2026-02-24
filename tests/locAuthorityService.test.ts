import {
  buildLocAuthorityContext,
  getLocAuthorityMode,
} from '../server/services/locAuthorityService';

const makeJsonResponse = (payload: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response);

describe('LOC authority service', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.LOC_AUTHORITY_MODE;
    delete process.env.RENDER;
    delete process.env.ENABLE_LOC_AUTHORITY_ENRICHMENT;
    delete process.env.LOC_AUTHORITY_MCP_URL;
    delete process.env.LOC_DIRECT_SEARCH_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('defaults to direct mode on Render', () => {
    process.env.RENDER = 'true';
    expect(getLocAuthorityMode()).toBe('direct');
  });

  it('uses explicit mcp mode when configured', () => {
    process.env.RENDER = 'true';
    process.env.LOC_AUTHORITY_MODE = 'mcp';
    expect(getLocAuthorityMode()).toBe('mcp');
  });

  it('builds candidates with direct mode from LoC search results', async () => {
    process.env.ENABLE_LOC_AUTHORITY_ENRICHMENT = 'true';
    process.env.LOC_AUTHORITY_MODE = 'direct';
    process.env.LOC_DIRECT_SEARCH_URL = 'https://www.loc.gov/search/';

    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        makeJsonResponse({
          results: [
            {
              title: 'The Adventures of Sherlock Holmes',
              url: 'https://www.loc.gov/item/123',
              lccn: ['2003556443'],
              subject_headings: [
                'Detective and mystery stories, English',
                'Holmes, Sherlock (Fictitious character) -- Fiction',
              ],
              contributors: ['Doyle, Arthur Conan, 1859-1930'],
            },
          ],
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const context = await buildLocAuthorityContext({
      title: 'The Adventures of Sherlock Holmes',
      author: 'Arthur Conan Doyle',
      identifier: '9781643150918',
    });

    expect(context).not.toBeNull();
    expect(context?.provider).toBe('loc-gov-direct');
    expect(context?.lcshCandidates.length).toBeGreaterThan(0);
    expect(context?.nameCandidates.length).toBeGreaterThan(0);
    expect(context?.nameCandidates.some((candidate) => candidate.label === 'Arthur Conan Doyle')).toBe(true);
    expect(context?.itemLink?.itemId).toBe('123');
    expect(context?.itemLink?.itemUrl).toBe('https://www.loc.gov/item/123');
    expect(context?.recordLinks?.lccn).toBe('2003556443');
    expect(context?.recordLinks?.marcXmlUrl).toBe('https://lccn.loc.gov/2003556443/marcxml');
    expect(context?.recordLinks?.modsUrl).toBe('https://lccn.loc.gov/2003556443/mods');
    expect(context?.recordLinks?.bibframe2Url).toBe('https://lccn.loc.gov/2003556443/bibframe2');
    expect(context?.warnings.length).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain('https://www.loc.gov/search/');
    expect(firstUrl).toContain('fo=json');
  });

  it('prioritizes identifier query before title/author fallback', async () => {
    process.env.ENABLE_LOC_AUTHORITY_ENRICHMENT = 'true';
    process.env.LOC_AUTHORITY_MODE = 'direct';
    process.env.LOC_DIRECT_SEARCH_URL = 'https://www.loc.gov/search/';

    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        makeJsonResponse({
          results: [
            {
              title: 'The Adventures of Sherlock Holmes',
              url: 'https://www.loc.gov/item/999',
              subject_headings: ['Detective and mystery stories, English'],
              contributors: ['Doyle, Arthur Conan, 1859-1930'],
            },
          ],
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const context = await buildLocAuthorityContext({
      title: 'The Adventures of Sherlock Holmes',
      author: 'Arthur Conan Doyle',
      identifier: '9781643150918',
    });

    expect(context?.lcshCandidates.length).toBeGreaterThan(0);
    const calledUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calledUrls[0]).toContain('q=isbn%3A9781643150918');
    const containsTitleSearch = calledUrls.some((url) => url.includes('q=The+Adventures+of+Sherlock+Holmes'));
    expect(containsTitleSearch).toBe(false);
  });

  it('retries once when direct lookup aborts', async () => {
    process.env.ENABLE_LOC_AUTHORITY_ENRICHMENT = 'true';
    process.env.LOC_AUTHORITY_MODE = 'direct';
    process.env.LOC_DIRECT_SEARCH_URL = 'https://www.loc.gov/search/';

    const abortError = new Error('This operation was aborted');
    (abortError as any).name = 'AbortError';

    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValue(
        makeJsonResponse({
          results: [
            {
              title: 'The Adventures of Sherlock Holmes',
              url: 'https://www.loc.gov/item/777',
              subject_headings: ['Detective and mystery stories, English'],
              contributors: ['Doyle, Arthur Conan, 1859-1930'],
            },
          ],
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const context = await buildLocAuthorityContext({
      title: 'The Adventures of Sherlock Holmes',
      author: 'Arthur Conan Doyle',
    });

    expect(fetchMock).toHaveBeenCalled();
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    const secondUrl = String(fetchMock.mock.calls[1][0]);
    expect(firstUrl).toBe(secondUrl);
    expect(firstUrl).toContain('q=The+Adventures+of+Sherlock+Holmes');
    expect(context?.lcshCandidates.length).toBeGreaterThan(0);
    expect(context?.warnings.length).toBe(0);
  });

  it('normalizes direct LOC names in last-first format', async () => {
    process.env.ENABLE_LOC_AUTHORITY_ENRICHMENT = 'true';
    process.env.LOC_AUTHORITY_MODE = 'direct';
    process.env.LOC_DIRECT_SEARCH_URL = 'https://www.loc.gov/search/';

    const fetchMock = jest.fn().mockResolvedValue(
      makeJsonResponse({
        results: [
          {
            title: 'A Study in Scarlet',
            url: 'https://www.loc.gov/item/111',
            subject_headings: ['Detective and mystery stories, English'],
            contributors: ['Doyle, Arthur Conan, 1859-1930'],
            contributor_names: ['Conan Doyle, Arthur, 1859-1930'],
          },
        ],
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const context = await buildLocAuthorityContext({
      title: 'A Study in Scarlet',
      author: 'Arthur Conan Doyle',
    });

    const labels = context?.nameCandidates.map((candidate) => candidate.label) || [];
    expect(labels).toContain('Arthur Conan Doyle');
    expect(labels).not.toContain('Doyle, Arthur Conan, 1859-1930');
  });

  it('returns LOC item link even when no LCCN is present', async () => {
    process.env.ENABLE_LOC_AUTHORITY_ENRICHMENT = 'true';
    process.env.LOC_AUTHORITY_MODE = 'direct';
    process.env.LOC_DIRECT_SEARCH_URL = 'https://www.loc.gov/search/';

    const fetchMock = jest.fn().mockResolvedValue(
      makeJsonResponse({
        results: [
          {
            title: 'The Adventures of Sherlock Holmes',
            url: 'https://www.loc.gov/item/55555/',
            subject_headings: ['Detective and mystery stories, English'],
            contributors: ['Doyle, Arthur Conan, 1859-1930'],
          },
        ],
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const context = await buildLocAuthorityContext({
      title: 'The Adventures of Sherlock Holmes',
      author: 'Arthur Conan Doyle',
    });

    expect(context?.itemLink?.itemId).toBe('55555');
    expect(context?.itemLink?.itemUrl).toBe('https://www.loc.gov/item/55555/');
    expect(context?.recordLinks).toBeUndefined();
  });
});
