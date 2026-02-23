import {
  buildHardcoverContext,
  getHardcoverEnrichmentMode,
  mergeHardcoverMetadata,
} from '../server/services/hardcoverService';

const makeJsonResponse = (payload: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response);

describe('Hardcover enrichment service', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.ENABLE_HARDCOVER_ENRICHMENT;
    delete process.env.HARDCOVER_ENRICHMENT_MODE;
    delete process.env.HARDCOVER_API_URL;
    delete process.env.HARDCOVER_API_TOKEN;
    delete process.env.HARDCOVER_TIMEOUT_MS;
    delete process.env.HARDCOVER_MAX_RESULTS;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('returns off mode when enrichment is disabled', () => {
    process.env.ENABLE_HARDCOVER_ENRICHMENT = 'false';
    expect(getHardcoverEnrichmentMode()).toBe('off');
  });

  it('defaults to shadow mode when enabled and no mode is provided', () => {
    process.env.ENABLE_HARDCOVER_ENRICHMENT = 'true';
    expect(getHardcoverEnrichmentMode()).toBe('shadow');
  });

  it('returns warning context when API token is missing', async () => {
    process.env.ENABLE_HARDCOVER_ENRICHMENT = 'true';
    const context = await buildHardcoverContext({ title: 'Dune' });
    expect(context).not.toBeNull();
    expect(context?.matchType).toBe('none');
    expect(context?.warnings?.[0]).toContain('HARDCOVER_API_TOKEN is not set');
  });

  it('uses identifier lookup first and captures series metadata', async () => {
    process.env.ENABLE_HARDCOVER_ENRICHMENT = 'true';
    process.env.HARDCOVER_ENRICHMENT_MODE = 'shadow';
    process.env.HARDCOVER_API_URL = 'https://api.hardcover.app/v1/graphql';
    process.env.HARDCOVER_API_TOKEN = 'test-token';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeJsonResponse({
          data: {
            editions: [
              {
                id: 100,
                title: 'The Fellowship of the Ring',
                pages: 423,
                release_date: '1954-07-29',
                isbn_13: '9780261103573',
                publisher: { name: 'Allen & Unwin' },
                book: {
                  id: 77,
                  title: 'The Fellowship of the Ring',
                  slug: 'the-fellowship-of-the-ring',
                  cached_contributors: [{ author_name: 'J.R.R. Tolkien' }],
                },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          data: {
            book_series: [
              {
                position: 1,
                series: { name: 'The Lord of the Rings' },
              },
            ],
          },
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const context = await buildHardcoverContext({
      title: 'The Fellowship of the Ring',
      author: 'J.R.R. Tolkien',
      identifier: '978-0-261-10357-3',
    });

    expect(context).not.toBeNull();
    expect(context?.matchType).toBe('identifier');
    expect(context?.book?.title).toBe('The Fellowship of the Ring');
    expect(context?.book?.series?.name).toBe('The Lord of the Rings');
    expect(context?.book?.series?.position).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(requestBody.query).toContain('query HardcoverEditionLookup');
  });

  it('applies Hardcover metadata only in apply mode', () => {
    const base = {
      title: '',
      author: '',
      publisher: '',
    } as Record<string, unknown>;

    const mergedShadow = mergeHardcoverMetadata(base, {
      provider: 'hardcover',
      enabled: true,
      mode: 'shadow',
      matchType: 'identifier',
      confidence: 0.95,
      warnings: [],
      book: {
        title: 'Book From HC',
        authors: ['Author From HC'],
        publishers: ['Publisher From HC'],
        publicationDate: '2005',
        numberOfPages: 450,
        isbn13: ['9781234567890'],
        series: { name: 'Series X', position: 2 },
      },
    });
    expect(mergedShadow.title).toBe('');

    const mergedApply = mergeHardcoverMetadata(base, {
      provider: 'hardcover',
      enabled: true,
      mode: 'apply',
      matchType: 'identifier',
      confidence: 0.95,
      warnings: [],
      book: {
        title: 'Book From HC',
        authors: ['Author From HC'],
        publishers: ['Publisher From HC'],
        publicationDate: '2005',
        numberOfPages: 450,
        isbn13: ['9781234567890'],
        series: { name: 'Series X', position: 2 },
      },
    });

    expect(mergedApply.title).toBe('Book From HC');
    expect(mergedApply.author).toBe('Author From HC');
    expect(mergedApply.publisher).toBe('Publisher From HC');
    expect(mergedApply.publicationDate).toBe('2005');
    expect(mergedApply.pageCount).toEqual({ value: 450, type: 'actual' });
    expect(mergedApply.identifier).toEqual({ value: '9781234567890', source: 'metadata' });
    expect(mergedApply.series).toBe('Series X');
    expect(mergedApply.seriesPosition).toBe(2);
  });
});
