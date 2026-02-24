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
    process.env.LOC_DIRECT_SEARCH_URL = 'https://www.loc.gov/books/';

    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        makeJsonResponse({
          results: [
            {
              title: 'The Adventures of Sherlock Holmes',
              url: 'https://www.loc.gov/item/123',
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
    expect(context?.warnings.length).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
    const firstUrl = String(fetchMock.mock.calls[0][0]);
    expect(firstUrl).toContain('https://www.loc.gov/books/');
    expect(firstUrl).toContain('fo=json');
  });
});
