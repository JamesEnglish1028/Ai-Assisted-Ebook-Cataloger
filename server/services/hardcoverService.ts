export type HardcoverEnrichmentMode = 'off' | 'shadow' | 'apply';

export interface HardcoverInput {
  title?: string;
  author?: string;
  identifier?: string;
}

export interface HardcoverSeriesInfo {
  name?: string;
  position?: number;
}

export interface HardcoverNormalizedBook {
  hardcoverBookId?: number;
  hardcoverEditionId?: number;
  title?: string;
  description?: string;
  authors?: string[];
  publishers?: string[];
  publicationDate?: string;
  numberOfPages?: number;
  isbn10?: string[];
  isbn13?: string[];
  asin?: string;
  series?: HardcoverSeriesInfo | null;
  slug?: string;
}

export interface HardcoverContext {
  provider: 'hardcover';
  enabled: boolean;
  mode: Exclude<HardcoverEnrichmentMode, 'off'>;
  matchType: 'identifier' | 'title' | 'none';
  confidence: number;
  book: HardcoverNormalizedBook | null;
  warnings: string[];
}

export interface HardcoverContributionCandidate {
  confidence: number;
  lookup: {
    provider: 'hardcover';
    matchType: 'identifier' | 'title' | 'none';
    hardcoverBookId?: number;
    hardcoverEditionId?: number;
  };
  payload: {
    title?: string;
    authors?: string[];
    publisher?: string;
    publicationDate?: string;
    identifier?: string;
    pageCount?: number;
    series?: {
      name?: string;
      position?: number;
    };
    description?: string;
    summary?: string;
    lcsh?: string[];
    bisac?: string[];
  };
}

const ENABLE_FLAG = 'ENABLE_HARDCOVER_ENRICHMENT';
const MODE_KEY = 'HARDCOVER_ENRICHMENT_MODE';
const API_URL_KEY = 'HARDCOVER_API_URL';
const API_TOKEN_KEY = 'HARDCOVER_API_TOKEN';
const TIMEOUT_MS_KEY = 'HARDCOVER_TIMEOUT_MS';
const MAX_RESULTS_KEY = 'HARDCOVER_MAX_RESULTS';

const DEFAULT_API_URL = 'https://api.hardcover.app/v1/graphql';
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

interface GraphQLError {
  message?: string;
}

interface GraphQLResponse<TData> {
  data?: TData;
  errors?: GraphQLError[];
}

interface EditionLookupRecord {
  id?: number;
  title?: string;
  pages?: number;
  release_date?: string;
  asin?: string;
  isbn_10?: string;
  isbn_13?: string;
  publisher?: {
    name?: string;
  } | null;
  book?: {
    id?: number;
    title?: string;
    description?: string;
    slug?: string;
    cached_contributors?: unknown;
  } | null;
}

interface SearchBookRecord {
  id?: number;
  title?: string;
}

interface BookDetailRecord {
  id?: number;
  title?: string;
  description?: string;
  slug?: string;
  cached_contributors?: unknown;
}

interface BookSeriesRecord {
  position?: number;
  series?: {
    name?: string;
  } | null;
}

interface BookEditionRecord {
  isbn_10?: string;
  isbn_13?: string;
  asin?: string;
  pages?: number;
  release_date?: string;
  publisher?: {
    name?: string;
  } | null;
}

const parseBooleanEnv = (value: string | undefined): boolean => {
  if (!value) return false;
  return TRUE_VALUES.has(value.trim().toLowerCase());
};

const parseIntegerEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMode = (value: string | undefined): HardcoverEnrichmentMode => {
  const v = (value || '').trim().toLowerCase();
  if (v === 'shadow' || v === 'apply') return v;
  return 'off';
};

const sanitizeIdentifier = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const cleaned = value.replace(/[-\s]/g, '').trim();
  return cleaned.length >= 8 ? cleaned : undefined;
};

const pickFirstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

const pickFirstNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const out = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => !!entry);
    return out.length > 0 ? out : undefined;
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return undefined;
};

const extractAuthors = (cachedContributors: unknown): string[] | undefined => {
  if (!Array.isArray(cachedContributors)) return undefined;
  const names = cachedContributors
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return '';
      const record = entry as Record<string, unknown>;
      return pickFirstString(
        record.author_name,
        record.name,
        (record.author as Record<string, unknown> | undefined)?.name,
      ) || '';
    })
    .filter((name): name is string => !!name);

  const deduped = Array.from(new Set(names));
  return deduped.length > 0 ? deduped : undefined;
};

const callGraphQL = async <TData>(
  apiUrl: string,
  apiToken: string,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<TData> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: apiToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Hardcover GraphQL request failed (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as GraphQLResponse<TData>;
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(payload.errors.map((err) => err.message || 'unknown error').join('; '));
    }
    if (!payload.data) {
      throw new Error('Hardcover GraphQL returned no data.');
    }
    return payload.data;
  } finally {
    clearTimeout(timeoutId);
  }
};

const IDENTIFIER_LOOKUP_QUERY = `
query HardcoverEditionLookup($identifier: String!, $limit: Int!) {
  editions(
    where: {
      _or: [
        { isbn_13: { _eq: $identifier } }
        { isbn_10: { _eq: $identifier } }
        { asin: { _eq: $identifier } }
      ]
    }
    limit: $limit
  ) {
    id
    title
    pages
    release_date
    asin
    isbn_10
    isbn_13
    publisher {
      name
    }
    book {
      id
      title
      description
      slug
      cached_contributors
    }
  }
}
`;

const TITLE_LOOKUP_QUERY = `
query HardcoverBookSearch($query: String!, $limit: Int!) {
  books(where: { title: { _ilike: $query } }, limit: $limit) {
    id
    title
  }
}
`;

const BOOK_DETAIL_QUERY = `
query HardcoverBookDetail($bookId: Int!, $limit: Int!) {
  books(where: { id: { _eq: $bookId } }, limit: 1) {
    id
    title
    description
    slug
    cached_contributors
  }
  editions(where: { book_id: { _eq: $bookId } }, limit: $limit) {
    isbn_10
    isbn_13
    asin
    pages
    release_date
    publisher {
      name
    }
  }
  book_series(where: { book_id: { _eq: $bookId } }, limit: 3) {
    position
    series {
      name
    }
  }
}
`;

const normalizeFromEditionRecord = (
  edition: EditionLookupRecord,
  series: HardcoverSeriesInfo | null,
): HardcoverNormalizedBook | null => {
  const bookRecord = edition.book || {};
  const normalized: HardcoverNormalizedBook = {
    hardcoverBookId: typeof bookRecord.id === 'number' ? bookRecord.id : undefined,
    hardcoverEditionId: typeof edition.id === 'number' ? edition.id : undefined,
    title: pickFirstString(bookRecord.title, edition.title),
    description: pickFirstString(bookRecord.description),
    authors: extractAuthors(bookRecord.cached_contributors),
    publishers: asStringArray(edition.publisher?.name),
    publicationDate: pickFirstString(edition.release_date),
    numberOfPages: pickFirstNumber(edition.pages),
    isbn10: asStringArray(edition.isbn_10),
    isbn13: asStringArray(edition.isbn_13),
    asin: pickFirstString(edition.asin),
    series,
    slug: pickFirstString(bookRecord.slug),
  };

  const hasUsefulData = Boolean(
    normalized.title ||
      (normalized.authors && normalized.authors.length > 0) ||
      normalized.hardcoverBookId,
  );
  return hasUsefulData ? normalized : null;
};

const normalizeFromBookDetails = (
  book: BookDetailRecord | undefined,
  editions: BookEditionRecord[] | undefined,
  seriesRows: BookSeriesRecord[] | undefined,
): HardcoverNormalizedBook | null => {
  if (!book) return null;
  const firstEdition = editions && editions.length > 0 ? editions[0] : undefined;
  const firstSeries = seriesRows && seriesRows.length > 0 ? seriesRows[0] : undefined;
  const series: HardcoverSeriesInfo | null = firstSeries?.series?.name
    ? {
        name: firstSeries.series.name,
        position: pickFirstNumber(firstSeries.position),
      }
    : null;

  const normalized: HardcoverNormalizedBook = {
    hardcoverBookId: typeof book.id === 'number' ? book.id : undefined,
    title: pickFirstString(book.title),
    description: pickFirstString(book.description),
    authors: extractAuthors(book.cached_contributors),
    publishers: asStringArray(firstEdition?.publisher?.name),
    publicationDate: pickFirstString(firstEdition?.release_date),
    numberOfPages: pickFirstNumber(firstEdition?.pages),
    isbn10: asStringArray(firstEdition?.isbn_10),
    isbn13: asStringArray(firstEdition?.isbn_13),
    asin: pickFirstString(firstEdition?.asin),
    series,
    slug: pickFirstString(book.slug),
  };

  const hasUsefulData = Boolean(
    normalized.title ||
      (normalized.authors && normalized.authors.length > 0) ||
      normalized.hardcoverBookId,
  );
  return hasUsefulData ? normalized : null;
};

const matchesRequestedAuthor = (book: HardcoverNormalizedBook, requestedAuthor?: string): boolean => {
  if (!requestedAuthor || !book.authors || book.authors.length === 0) return true;
  const requested = requestedAuthor.toLowerCase().trim();
  return book.authors.some((author) => author.toLowerCase().includes(requested) || requested.includes(author.toLowerCase()));
};

export const getHardcoverEnrichmentMode = (): HardcoverEnrichmentMode => {
  if (!parseBooleanEnv(process.env[ENABLE_FLAG])) return 'off';
  const mode = normalizeMode(process.env[MODE_KEY]);
  return mode === 'off' ? 'shadow' : mode;
};

export const getHardcoverFeatureCacheKey = (): string => {
  const mode = getHardcoverEnrichmentMode();
  const endpoint = (process.env[API_URL_KEY] || '').trim() || DEFAULT_API_URL;
  const maxResults = parseIntegerEnv(process.env[MAX_RESULTS_KEY], 5);
  return `hardcover:${mode}:${endpoint}:${maxResults}`;
};

export const buildHardcoverContext = async (
  input: HardcoverInput,
): Promise<HardcoverContext | null> => {
  const mode = getHardcoverEnrichmentMode();
  if (mode === 'off') return null;

  const apiUrl = (process.env[API_URL_KEY] || DEFAULT_API_URL).trim();
  const apiToken = (process.env[API_TOKEN_KEY] || '').trim();
  const timeoutMs = Math.max(500, parseIntegerEnv(process.env[TIMEOUT_MS_KEY], 3500));
  const maxResults = Math.max(1, Math.min(10, parseIntegerEnv(process.env[MAX_RESULTS_KEY], 5)));
  const warnings: string[] = [];

  if (!apiToken) {
    return {
      provider: 'hardcover',
      enabled: true,
      mode,
      matchType: 'none',
      confidence: 0,
      book: null,
      warnings: [`${API_TOKEN_KEY} is not set; skipping Hardcover enrichment.`],
    };
  }

  const identifier = sanitizeIdentifier(input.identifier);
  if (identifier) {
    try {
      const payload = await callGraphQL<{ editions?: EditionLookupRecord[] }>(
        apiUrl,
        apiToken,
        IDENTIFIER_LOOKUP_QUERY,
        { identifier, limit: maxResults },
        timeoutMs,
      );
      const firstEdition = payload.editions?.[0];
      if (firstEdition) {
        const bookId = firstEdition.book?.id;
        let series: HardcoverSeriesInfo | null = null;
        if (typeof bookId === 'number') {
          try {
            const details = await callGraphQL<{ book_series?: BookSeriesRecord[] }>(
              apiUrl,
              apiToken,
              `query HardcoverSeriesByBook($bookId: Int!) {
                book_series(where: { book_id: { _eq: $bookId } }, limit: 3) {
                  position
                  series { name }
                }
              }`,
              { bookId },
              timeoutMs,
            );
            const firstSeries = details.book_series?.[0];
            if (firstSeries?.series?.name) {
              series = {
                name: firstSeries.series.name,
                position: pickFirstNumber(firstSeries.position),
              };
            }
          } catch (seriesError: any) {
            warnings.push(`Hardcover series lookup failed for book ${bookId}: ${seriesError?.message || 'unknown error'}`);
          }
        }

        const book = normalizeFromEditionRecord(firstEdition, series);
        if (book) {
          return {
            provider: 'hardcover',
            enabled: true,
            mode,
            matchType: 'identifier',
            confidence: 0.95,
            book,
            warnings,
          };
        }
      }
      warnings.push(`No Hardcover identifier match for ${identifier}.`);
    } catch (error: any) {
      warnings.push(`Hardcover identifier lookup failed for "${identifier}": ${error?.message || 'unknown error'}`);
    }
  }

  const title = (input.title || '').trim();
  if (!title) {
    return {
      provider: 'hardcover',
      enabled: true,
      mode,
      matchType: 'none',
      confidence: 0,
      book: null,
      warnings,
    };
  }

  try {
    const payload = await callGraphQL<{ books?: SearchBookRecord[] }>(
      apiUrl,
      apiToken,
      TITLE_LOOKUP_QUERY,
      { query: `%${title}%`, limit: maxResults },
      timeoutMs,
    );

    const candidateBooks = payload.books || [];
    for (const candidate of candidateBooks) {
      if (typeof candidate.id !== 'number') continue;
      const detailPayload = await callGraphQL<{
        books?: BookDetailRecord[];
        editions?: BookEditionRecord[];
        book_series?: BookSeriesRecord[];
      }>(
        apiUrl,
        apiToken,
        BOOK_DETAIL_QUERY,
        { bookId: candidate.id, limit: maxResults },
        timeoutMs,
      );
      const normalized = normalizeFromBookDetails(
        detailPayload.books?.[0],
        detailPayload.editions,
        detailPayload.book_series,
      );
      if (normalized && matchesRequestedAuthor(normalized, input.author)) {
        return {
          provider: 'hardcover',
          enabled: true,
          mode,
          matchType: 'title',
          confidence: 0.72,
          book: normalized,
          warnings,
        };
      }
    }

    return {
      provider: 'hardcover',
      enabled: true,
      mode,
      matchType: 'none',
      confidence: 0,
      book: null,
      warnings,
    };
  } catch (error: any) {
    warnings.push(`Hardcover title lookup failed for "${title}": ${error?.message || 'unknown error'}`);
    return {
      provider: 'hardcover',
      enabled: true,
      mode,
      matchType: 'none',
      confidence: 0,
      book: null,
      warnings,
    };
  }
};

export const mergeHardcoverMetadata = (
  current: Record<string, unknown>,
  context: HardcoverContext | null,
): Record<string, unknown> => {
  if (!context || context.mode !== 'apply' || !context.book) {
    return { ...current };
  }

  const next = { ...current };
  const book = context.book;

  if (!next.title && book.title) next.title = book.title;
  if (!next.author && book.authors?.length) next.author = book.authors[0];
  if (!next.publisher && book.publishers?.length) next.publisher = book.publishers[0];
  if (!next.publicationDate && book.publicationDate) next.publicationDate = book.publicationDate;
  if (!next.pageCount && typeof book.numberOfPages === 'number') {
    next.pageCount = {
      value: book.numberOfPages,
      type: 'actual',
    };
  }

  if (typeof next.series !== 'string' && book.series?.name) next.series = book.series.name;
  if (next.seriesPosition === undefined && typeof book.series?.position === 'number') {
    next.seriesPosition = book.series.position;
  }

  const existingIdentifier = next.identifier as Record<string, unknown> | undefined;
  if (!existingIdentifier?.value) {
    const preferred = book.isbn13?.[0] || book.isbn10?.[0] || book.asin;
    if (preferred) {
      next.identifier = {
        value: preferred,
        source: 'metadata',
      };
    }
  }

  return next;
};

export const buildHardcoverContributionCandidate = (
  metadata: Record<string, unknown>,
  summary: string | undefined,
  context: HardcoverContext | null,
): HardcoverContributionCandidate | null => {
  if (!context?.book) return null;

  const identifierValue =
    typeof (metadata.identifier as Record<string, unknown> | undefined)?.value === 'string'
      ? ((metadata.identifier as Record<string, unknown>).value as string)
      : undefined;
  const pageCountRecord = metadata.pageCount as Record<string, unknown> | undefined;
  const pageCount =
    typeof pageCountRecord?.value === 'number'
      ? pageCountRecord.value
      : typeof context.book.numberOfPages === 'number'
        ? context.book.numberOfPages
        : undefined;
  const seriesName = typeof metadata.series === 'string' ? metadata.series : context.book.series?.name;
  const seriesPosition =
    typeof metadata.seriesPosition === 'number'
      ? metadata.seriesPosition
      : context.book.series?.position;

  return {
    confidence: context.confidence,
    lookup: {
      provider: 'hardcover',
      matchType: context.matchType,
      hardcoverBookId: context.book.hardcoverBookId,
      hardcoverEditionId: context.book.hardcoverEditionId,
    },
    payload: {
      title: typeof metadata.title === 'string' ? metadata.title : context.book.title,
      authors:
        typeof metadata.author === 'string' && metadata.author.trim()
          ? metadata.author.split(',').map((author) => author.trim()).filter((author) => !!author)
          : context.book.authors,
      publisher:
        typeof metadata.publisher === 'string'
          ? metadata.publisher
          : context.book.publishers?.[0],
      publicationDate:
        typeof metadata.publicationDate === 'string'
          ? metadata.publicationDate
          : context.book.publicationDate,
      identifier: identifierValue || context.book.isbn13?.[0] || context.book.isbn10?.[0] || context.book.asin,
      pageCount,
      series: {
        name: seriesName,
        position: seriesPosition,
      },
      description:
        typeof context.book.description === 'string' && context.book.description.trim()
          ? context.book.description
          : undefined,
      summary: typeof summary === 'string' && summary.trim() ? summary : undefined,
      lcsh: Array.isArray(metadata.lcsh) ? metadata.lcsh.filter((entry): entry is string => typeof entry === 'string') : undefined,
      bisac: Array.isArray(metadata.bisac) ? metadata.bisac.filter((entry): entry is string => typeof entry === 'string') : undefined,
    },
  };
};
