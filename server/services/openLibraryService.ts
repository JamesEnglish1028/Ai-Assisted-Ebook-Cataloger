export type OpenLibraryEnrichmentMode = 'off' | 'shadow' | 'apply';

export interface OpenLibraryInput {
  title?: string;
  author?: string;
  identifier?: string;
}

export interface OpenLibraryNormalizedBook {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publishers?: string[];
  publishDate?: string;
  numberOfPages?: number;
  isbn10?: string[];
  isbn13?: string[];
  lccn?: string[];
  oclc?: string[];
  olid?: string[];
  coverUrl?: string;
  workKey?: string;
  editionKey?: string;
}

export interface OpenLibraryContext {
  provider: 'open-library-mcp';
  enabled: boolean;
  mode: Exclude<OpenLibraryEnrichmentMode, 'off'>;
  matchType: 'identifier' | 'title' | 'none';
  confidence: number;
  book: OpenLibraryNormalizedBook | null;
  warnings: string[];
}

interface McpTextContent {
  type?: string;
  text?: string;
}

interface McpResultEnvelope {
  content?: McpTextContent[];
  structuredContent?: unknown;
}

const ENABLE_FLAG = 'ENABLE_OPEN_LIBRARY_ENRICHMENT';
const MODE_KEY = 'OPEN_LIBRARY_ENRICHMENT_MODE';
const MCP_URL_KEY = 'OPEN_LIBRARY_MCP_URL';
const TIMEOUT_MS_KEY = 'OPEN_LIBRARY_TIMEOUT_MS';
const MAX_RESULTS_KEY = 'OPEN_LIBRARY_MAX_RESULTS';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const parseBooleanEnv = (value: string | undefined): boolean => {
  if (!value) return false;
  return TRUE_VALUES.has(value.trim().toLowerCase());
};

const parseIntegerEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMode = (value: string | undefined): OpenLibraryEnrichmentMode => {
  const v = (value || '').trim().toLowerCase();
  if (v === 'shadow' || v === 'apply') return v;
  return 'off';
};

export const getOpenLibraryEnrichmentMode = (): OpenLibraryEnrichmentMode => {
  if (!parseBooleanEnv(process.env[ENABLE_FLAG])) return 'off';
  const mode = normalizeMode(process.env[MODE_KEY]);
  return mode === 'off' ? 'shadow' : mode;
};

export const getOpenLibraryFeatureCacheKey = (): string => {
  const mode = getOpenLibraryEnrichmentMode();
  const endpoint = (process.env[MCP_URL_KEY] || '').trim() || 'unset';
  const maxResults = parseIntegerEnv(process.env[MAX_RESULTS_KEY], 5);
  return `openlib:${mode}:${endpoint}:${maxResults}`;
};

const sanitizeIdentifier = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const cleaned = value.replace(/[-\s]/g, '').trim();
  return cleaned.length >= 8 ? cleaned : undefined;
};

const extractJsonFromContent = (content: McpTextContent[] | undefined): unknown => {
  if (!Array.isArray(content)) return null;
  const textParts = content
    .filter((item) => item?.type === 'text' && typeof item?.text === 'string')
    .map((item) => item.text as string);

  if (textParts.length === 0) return null;
  const joined = textParts.join('\n').trim();
  if (!joined) return null;

  try {
    return JSON.parse(joined);
  } catch {
    return joined;
  }
};

const callMcpTool = async (
  mcpUrl: string,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `openlib-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`MCP call failed for ${toolName} (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as { error?: { message?: string }; result?: McpResultEnvelope };
    if (payload.error) {
      throw new Error(payload.error.message || `MCP returned error for ${toolName}`);
    }

    const structured = payload.result?.structuredContent;
    if (structured !== undefined) return structured;
    return extractJsonFromContent(payload.result?.content);
  } finally {
    clearTimeout(timeoutId);
  }
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const out = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => !!entry);
    return out.length ? out : undefined;
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return undefined;
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

const normalizeBookRecord = (payload: unknown): OpenLibraryNormalizedBook | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  const rawAuthors = record.authors;
  const authors = Array.isArray(rawAuthors)
    ? rawAuthors
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const e = entry as Record<string, unknown>;
          return pickFirstString(e.name, e.author, e.value);
        }
        return '';
      })
      .filter((entry): entry is string => !!entry)
    : asStringArray(rawAuthors);

  const cover = record.cover;
  const coverUrl = typeof cover === 'string'
    ? cover
    : cover && typeof cover === 'object'
      ? pickFirstString((cover as Record<string, unknown>).large, (cover as Record<string, unknown>).medium, (cover as Record<string, unknown>).small)
      : undefined;

  const book: OpenLibraryNormalizedBook = {
    title: pickFirstString(record.title, record.name),
    subtitle: pickFirstString(record.subtitle),
    authors,
    publishers: asStringArray(record.publishers),
    publishDate: pickFirstString(record.publish_date, record.publishDate, record.first_publish_year),
    numberOfPages: pickFirstNumber(record.number_of_pages, record.numberOfPages, record.page_count),
    isbn10: asStringArray(record.isbn_10),
    isbn13: asStringArray(record.isbn_13),
    lccn: asStringArray(record.lccn),
    oclc: asStringArray(record.oclc_numbers || record.oclc),
    olid: asStringArray(record.key ? [String(record.key)] : record.olid),
    coverUrl,
    workKey: pickFirstString(record.work_key, record.workKey),
    editionKey: pickFirstString(record.edition_key, record.editionKey, record.key),
  };

  const hasUsefulData = Boolean(
    book.title ||
    (book.authors && book.authors.length > 0) ||
    (book.isbn13 && book.isbn13.length > 0) ||
    (book.isbn10 && book.isbn10.length > 0),
  );

  return hasUsefulData ? book : null;
};

const extractBookFromPayload = (payload: unknown): OpenLibraryNormalizedBook | null => {
  const direct = normalizeBookRecord(payload);
  if (direct) return direct;

  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  const candidates: unknown[] = [];
  if (record.book) candidates.push(record.book);
  if (Array.isArray(record.books)) candidates.push(...record.books);
  if (Array.isArray(record.results)) candidates.push(...record.results);
  if (record.result) candidates.push(record.result);
  if (record.docs && Array.isArray(record.docs)) candidates.push(...record.docs);

  for (const candidate of candidates) {
    const normalized = normalizeBookRecord(candidate);
    if (normalized) return normalized;
  }

  return null;
};

export const buildOpenLibraryContext = async (
  input: OpenLibraryInput,
): Promise<OpenLibraryContext | null> => {
  const mode = getOpenLibraryEnrichmentMode();
  if (mode === 'off') return null;

  const mcpUrl = (process.env[MCP_URL_KEY] || '').trim();
  const timeoutMs = Math.max(500, parseIntegerEnv(process.env[TIMEOUT_MS_KEY], 3500));
  const maxResults = Math.max(1, Math.min(10, parseIntegerEnv(process.env[MAX_RESULTS_KEY], 5)));
  const warnings: string[] = [];

  if (!mcpUrl) {
    return {
      provider: 'open-library-mcp',
      enabled: true,
      mode,
      matchType: 'none',
      confidence: 0,
      book: null,
      warnings: [`${MCP_URL_KEY} is not set; skipping Open Library enrichment.`],
    };
  }

  const identifier = sanitizeIdentifier(input.identifier);
  if (identifier) {
    try {
      const payload = await callMcpTool(
        mcpUrl,
        'get_book_by_id',
        {
          id: identifier,
          identifier,
          isbn: identifier,
          max_results: maxResults,
          maxResults,
        },
        timeoutMs,
      );
      const book = extractBookFromPayload(payload);
      if (book) {
        return {
          provider: 'open-library-mcp',
          enabled: true,
          mode,
          matchType: 'identifier',
          confidence: 0.95,
          book,
          warnings,
        };
      }
      warnings.push(`No Open Library identifier match for ${identifier}.`);
    } catch (error: any) {
      warnings.push(`get_book_by_id failed for "${identifier}": ${error?.message || 'unknown error'}`);
    }
  }

  const title = (input.title || '').trim();
  if (!title) {
    return {
      provider: 'open-library-mcp',
      enabled: true,
      mode,
      matchType: 'none',
      confidence: 0,
      book: null,
      warnings,
    };
  }

  try {
    const payload = await callMcpTool(
      mcpUrl,
      'get_book_by_title',
      {
        title,
        query: title,
        author: input.author,
        max_results: maxResults,
        maxResults,
      },
      timeoutMs,
    );
    const book = extractBookFromPayload(payload);
    return {
      provider: 'open-library-mcp',
      enabled: true,
      mode,
      matchType: book ? 'title' : 'none',
      confidence: book ? 0.7 : 0,
      book,
      warnings,
    };
  } catch (error: any) {
    warnings.push(`get_book_by_title failed for "${title}": ${error?.message || 'unknown error'}`);
    return {
      provider: 'open-library-mcp',
      enabled: true,
      mode,
      matchType: 'none',
      confidence: 0,
      book: null,
      warnings,
    };
  }
};

export const mergeOpenLibraryMetadata = (
  current: Record<string, unknown>,
  context: OpenLibraryContext | null,
): Record<string, unknown> => {
  if (!context || context.mode !== 'apply' || !context.book) {
    return { ...current };
  }

  const next = { ...current };
  const book = context.book;

  if (!next.title && book.title) next.title = book.title;
  if (!next.author && book.authors?.length) next.author = book.authors[0];
  if (!next.publisher && book.publishers?.length) next.publisher = book.publishers[0];
  if (!next.publicationDate && book.publishDate) next.publicationDate = book.publishDate;
  if (!next.pageCount && typeof book.numberOfPages === 'number') {
    next.pageCount = {
      value: book.numberOfPages,
      type: 'actual',
    };
  }

  const existingIdentifier = next.identifier as Record<string, unknown> | undefined;
  if (!existingIdentifier?.value) {
    const preferred = book.isbn13?.[0] || book.isbn10?.[0] || book.lccn?.[0] || book.oclc?.[0] || book.olid?.[0];
    if (preferred) {
      next.identifier = {
        value: preferred,
        source: 'metadata',
      };
    }
  }

  return next;
};
