import {
  buildOpenLibraryContext,
  getOpenLibraryEnrichmentMode,
  mergeOpenLibraryMetadata,
} from '../server/services/openLibraryService';

const makeJsonResponse = (payload: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response);

describe('Open Library enrichment service', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPEN_LIBRARY_ENRICHMENT_MODE;
    delete process.env.ENABLE_OPEN_LIBRARY_ENRICHMENT;
    delete process.env.OPEN_LIBRARY_MCP_URL;
    delete process.env.OPEN_LIBRARY_TIMEOUT_MS;
    delete process.env.OPEN_LIBRARY_MAX_RESULTS;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('returns off mode when enrichment is disabled', () => {
    process.env.ENABLE_OPEN_LIBRARY_ENRICHMENT = 'false';
    expect(getOpenLibraryEnrichmentMode()).toBe('off');
  });

  it('defaults to shadow mode when enabled and no mode is provided', () => {
    process.env.ENABLE_OPEN_LIBRARY_ENRICHMENT = 'true';
    expect(getOpenLibraryEnrichmentMode()).toBe('shadow');
  });

  it('uses identifier lookup first and returns identifier match context', async () => {
    process.env.ENABLE_OPEN_LIBRARY_ENRICHMENT = 'true';
    process.env.OPEN_LIBRARY_ENRICHMENT_MODE = 'shadow';
    process.env.OPEN_LIBRARY_MCP_URL = 'http://localhost:3003/mcp';

    const fetchMock = jest.fn().mockResolvedValue(
      makeJsonResponse({
        result: {
          structuredContent: {
            title: 'The Hobbit',
            authors: ['J.R.R. Tolkien'],
            isbn_13: ['9780261103344'],
            publishers: ['Allen & Unwin'],
          },
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const context = await buildOpenLibraryContext({
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      identifier: '978-0-261-10334-4',
    });

    expect(context).not.toBeNull();
    expect(context?.matchType).toBe('identifier');
    expect(context?.book?.title).toBe('The Hobbit');
    expect(context?.book?.isbn13?.[0]).toBe('9780261103344');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(requestBody.params.name).toBe('get_book_by_id');
  });

  it('falls back to title lookup when identifier yields no match', async () => {
    process.env.ENABLE_OPEN_LIBRARY_ENRICHMENT = 'true';
    process.env.OPEN_LIBRARY_ENRICHMENT_MODE = 'shadow';
    process.env.OPEN_LIBRARY_MCP_URL = 'http://localhost:3003/mcp';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(makeJsonResponse({ result: { structuredContent: {} } }))
      .mockResolvedValueOnce(
        makeJsonResponse({
          result: {
            structuredContent: {
              result: {
                title: 'Dune',
                authors: ['Frank Herbert'],
              },
            },
          },
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const context = await buildOpenLibraryContext({
      title: 'Dune',
      author: 'Frank Herbert',
      identifier: '9780441172719',
    });

    expect(context).not.toBeNull();
    expect(context?.matchType).toBe('title');
    expect(context?.book?.title).toBe('Dune');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    const second = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(first.params.name).toBe('get_book_by_id');
    expect(second.params.name).toBe('get_book_by_title');
  });

  it('applies Open Library metadata only in apply mode', () => {
    const base = {
      title: '',
      author: '',
      publisher: '',
    } as Record<string, unknown>;

    const mergedShadow = mergeOpenLibraryMetadata(base, {
      provider: 'open-library-mcp',
      enabled: true,
      mode: 'shadow',
      matchType: 'identifier',
      confidence: 0.95,
      warnings: [],
      book: {
        title: 'Book From OL',
        authors: ['Author From OL'],
        publishers: ['Publisher From OL'],
        publishDate: '1999',
        numberOfPages: 320,
        isbn13: ['9781234567890'],
      },
    });
    expect(mergedShadow.title).toBe('');

    const mergedApply = mergeOpenLibraryMetadata(base, {
      provider: 'open-library-mcp',
      enabled: true,
      mode: 'apply',
      matchType: 'identifier',
      confidence: 0.95,
      warnings: [],
      book: {
        title: 'Book From OL',
        authors: ['Author From OL'],
        publishers: ['Publisher From OL'],
        publishDate: '1999',
        numberOfPages: 320,
        isbn13: ['9781234567890'],
      },
    });

    expect(mergedApply.title).toBe('Book From OL');
    expect(mergedApply.author).toBe('Author From OL');
    expect(mergedApply.publisher).toBe('Publisher From OL');
    expect(mergedApply.publicationDate).toBe('1999');
    expect(mergedApply.pageCount).toEqual({ value: 320, type: 'actual' });
    expect(mergedApply.identifier).toEqual({ value: '9781234567890', source: 'metadata' });
  });
});
