export interface LocAuthorityHeadingCandidate {
  heading: string;
  uri?: string;
  confidence?: number;
  query: string;
  tool: 'search_lcsh' | 'search_lcsh_keyword';
}

export interface LocAuthorityNameCandidate {
  label: string;
  uri?: string;
  confidence?: number;
  query: string;
  tool: 'search_name_authority';
}

export interface LocAuthorityContext {
  provider: 'cataloger-mcp' | 'loc-gov-direct';
  enabled: boolean;
  lcshCandidates: LocAuthorityHeadingCandidate[];
  nameCandidates: LocAuthorityNameCandidate[];
  warnings: string[];
}

export interface LocAuthorityInput {
  title?: string;
  author?: string;
  narrator?: string;
  subject?: string;
  keywords?: string;
  identifier?: string;
}

interface McpTextContent {
  type?: string;
  text?: string;
}

interface McpResultEnvelope {
  content?: McpTextContent[];
  structuredContent?: unknown;
}

const ENABLE_FLAG = 'ENABLE_LOC_AUTHORITY_ENRICHMENT';
const MODE_KEY = 'LOC_AUTHORITY_MODE';
const MCP_URL_KEY = 'LOC_AUTHORITY_MCP_URL';
const TIMEOUT_MS_KEY = 'LOC_AUTHORITY_TIMEOUT_MS';
const MAX_RESULTS_KEY = 'LOC_AUTHORITY_MAX_RESULTS';
const DIRECT_SEARCH_URL_KEY = 'LOC_DIRECT_SEARCH_URL';

export type LocAuthorityMode = 'mcp' | 'direct';

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

export const isLocAuthorityEnrichmentEnabled = (): boolean => {
  return parseBooleanEnv(process.env[ENABLE_FLAG]);
};

export const getLocAuthorityMode = (): LocAuthorityMode => {
  const configured = (process.env[MODE_KEY] || '').trim().toLowerCase();
  if (configured === 'mcp' || configured === 'direct') {
    return configured;
  }

  // Render deployments default to direct mode to avoid MCP stdio runtime dependencies.
  if (parseBooleanEnv(process.env.RENDER)) {
    return 'direct';
  }

  return 'mcp';
};

export const getLocAuthorityFeatureCacheKey = (): string => {
  const enabled = isLocAuthorityEnrichmentEnabled() ? '1' : '0';
  const mode = getLocAuthorityMode();
  const endpoint = (process.env[MCP_URL_KEY] || '').trim() || 'unset';
  const directBase = (process.env[DIRECT_SEARCH_URL_KEY] || '').trim() || 'https://www.loc.gov/books/';
  const maxResults = parseIntegerEnv(process.env[MAX_RESULTS_KEY], 5);
  return `locauth:${enabled}:${mode}:${endpoint}:${directBase}:${maxResults}`;
};

const sanitizeAndSplitList = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split(/[,;|]/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && item.length <= 120);
};

const buildSubjectQueries = (input: LocAuthorityInput): string[] => {
  const queries: string[] = [];
  if (input.subject?.trim()) queries.push(input.subject.trim());
  queries.push(...sanitizeAndSplitList(input.keywords));
  if (input.title?.trim()) queries.push(input.title.trim());

  const deduped = Array.from(
    new Map(queries.map((entry) => [entry.toLowerCase(), entry])).values(),
  );

  return deduped.slice(0, 4);
};

const buildNameQueries = (input: LocAuthorityInput): string[] => {
  const queries = [input.author, input.narrator]
    .map((entry) => (entry || '').trim())
    .filter((entry) => entry.length >= 2 && entry.length <= 120);

  return Array.from(new Map(queries.map((entry) => [entry.toLowerCase(), entry])).values()).slice(0, 3);
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

const normalizeHeadingCandidate = (
  raw: unknown,
  query: string,
  tool: 'search_lcsh' | 'search_lcsh_keyword',
): LocAuthorityHeadingCandidate | null => {
  if (typeof raw === 'string') {
    const heading = raw.trim();
    if (!heading) return null;
    return { heading, query, tool };
  }

  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const heading =
    (typeof record.heading === 'string' && record.heading.trim()) ||
    (typeof record.label === 'string' && record.label.trim()) ||
    (typeof record.title === 'string' && record.title.trim()) ||
    (typeof record.term === 'string' && record.term.trim()) ||
    (typeof record.name === 'string' && record.name.trim()) ||
    '';

  if (!heading) return null;

  const uriCandidate =
    (typeof record.uri === 'string' && record.uri.trim()) ||
    (typeof record.id === 'string' && record.id.trim()) ||
    (typeof record.url === 'string' && record.url.trim()) ||
    '';
  const uri = uriCandidate.startsWith('http') ? uriCandidate : undefined;

  const score = record.score ?? record.confidence ?? record.relevance;
  const confidence = typeof score === 'number' && Number.isFinite(score) ? score : undefined;

  return { heading, uri, confidence, query, tool };
};

const normalizeNameCandidate = (
  raw: unknown,
  query: string,
): LocAuthorityNameCandidate | null => {
  if (typeof raw === 'string') {
    const label = raw.trim();
    if (!label) return null;
    return { label, query, tool: 'search_name_authority' };
  }

  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const label =
    (typeof record.label === 'string' && record.label.trim()) ||
    (typeof record.name === 'string' && record.name.trim()) ||
    (typeof record.heading === 'string' && record.heading.trim()) ||
    '';

  if (!label) return null;

  const uriCandidate =
    (typeof record.uri === 'string' && record.uri.trim()) ||
    (typeof record.id === 'string' && record.id.trim()) ||
    (typeof record.url === 'string' && record.url.trim()) ||
    '';
  const uri = uriCandidate.startsWith('http') ? uriCandidate : undefined;

  const score = record.score ?? record.confidence ?? record.relevance;
  const confidence = typeof score === 'number' && Number.isFinite(score) ? score : undefined;

  return { label, uri, confidence, query, tool: 'search_name_authority' };
};

const dedupeHeadings = (
  candidates: LocAuthorityHeadingCandidate[],
): LocAuthorityHeadingCandidate[] => {
  const entries = new Map<string, LocAuthorityHeadingCandidate>();
  for (const candidate of candidates) {
    const key = candidate.heading.toLowerCase();
    if (!entries.has(key)) {
      entries.set(key, candidate);
    }
  }
  return Array.from(entries.values());
};

const dedupeNames = (candidates: LocAuthorityNameCandidate[]): LocAuthorityNameCandidate[] => {
  const entries = new Map<string, LocAuthorityNameCandidate>();
  for (const candidate of candidates) {
    const key = candidate.label.toLowerCase();
    if (!entries.has(key)) {
      entries.set(key, candidate);
    }
  }
  return Array.from(entries.values());
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
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `loc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
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

const normalizeArrayPayload = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  const candidates =
    (Array.isArray(record.results) && record.results) ||
    (Array.isArray(record.items) && record.items) ||
    (Array.isArray(record.matches) && record.matches) ||
    (Array.isArray(record.data) && record.data) ||
    [];
  return candidates;
};

const toUniqueArray = (items: string[]): string[] => {
  return Array.from(new Map(items.map((item) => [item.toLowerCase(), item])).values());
};

const toStringList = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          const text =
            (typeof record.heading === 'string' && record.heading) ||
            (typeof record.subject === 'string' && record.subject) ||
            (typeof record.name === 'string' && record.name) ||
            (typeof record.label === 'string' && record.label) ||
            '';
          return text.trim();
        }
        return '';
      })
      .filter((entry) => !!entry);
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
};

const sanitizeIdentifier = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const cleaned = value.replace(/[-\s]/g, '').trim();
  return cleaned.length >= 8 ? cleaned : undefined;
};

const normalizeLocUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return `https://www.loc.gov${trimmed}`;
  return trimmed;
};

const isLikelyLocItemUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('loc.gov')) return false;
    if (/\.pdf$/i.test(parsed.pathname)) return false;
    return parsed.pathname.includes('/item/');
  } catch {
    return false;
  }
};

const isHeadingNoise = (heading: string): boolean => {
  const normalized = heading.toLowerCase();
  return (
    normalized.includes('library of congress subject headings') ||
    normalized.includes('subject headings manual') ||
    normalized === 'lcsh' ||
    normalized === 'classification'
  );
};

const isNameNoise = (label: string): boolean => {
  const normalized = label.toLowerCase();
  return (
    normalized.includes('library of congress') ||
    normalized.includes('subject headings manual') ||
    normalized === 'lcsh'
  );
};

const buildLocSearchUrl = (baseUrl: string, query: string, maxResults: number): string => {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(normalizedBase);
  url.searchParams.set('fo', 'json');
  url.searchParams.set('q', query);
  url.searchParams.set('c', String(maxResults));
  url.searchParams.set('sp', '1');
  return url.toString();
};

const fetchJsonWithTimeout = async (url: string, timeoutMs: number): Promise<unknown> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`HTTP ${response.status}: ${detail}`);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`Expected JSON response but received content-type "${contentType || 'unknown'}"`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const extractLocItems = (payload: unknown): Record<string, unknown>[] => {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const rawResults = Array.isArray(record.results)
    ? record.results
    : Array.isArray(record.items)
      ? record.items
      : [];
  return rawResults.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
};

const mapLocItemsToCandidates = (
  items: Record<string, unknown>[],
  query: string,
): { headings: LocAuthorityHeadingCandidate[]; names: LocAuthorityNameCandidate[]; detailUrls: string[] } => {
  const headings: LocAuthorityHeadingCandidate[] = [];
  const names: LocAuthorityNameCandidate[] = [];
  const detailUrls: string[] = [];

  for (const item of items) {
    const itemUrl = normalizeLocUrl(typeof item.url === 'string' ? item.url : undefined);
    const isLikelyItem = isLikelyLocItemUrl(itemUrl);
    if (isLikelyItem && itemUrl) detailUrls.push(itemUrl);

    for (const heading of toStringList(item.subject_headings ?? item.subjects ?? item.subject)) {
      if (isHeadingNoise(heading)) continue;
      headings.push({
        heading,
        uri: itemUrl,
        query,
        tool: 'search_lcsh_keyword',
      });
    }

    const rawNames = [
      ...toStringList(item.contributors),
      ...toStringList(item.creator),
      ...toStringList(item.creators),
      ...toStringList(item.author),
      ...toStringList(item.authors),
      ...toStringList(item.name),
    ];
    for (const label of rawNames) {
      if (isNameNoise(label)) continue;
      names.push({
        label,
        uri: itemUrl,
        query,
        tool: 'search_name_authority',
      });
    }
  }

  return { headings, names, detailUrls: toUniqueArray(detailUrls).slice(0, 3) };
};

const buildViaMcp = async (
  input: LocAuthorityInput,
  timeoutMs: number,
  maxResults: number,
): Promise<LocAuthorityContext> => {
  const warnings: string[] = [];
  const mcpUrl = (process.env[MCP_URL_KEY] || '').trim();

  if (!mcpUrl) {
    return {
      provider: 'cataloger-mcp',
      enabled: true,
      lcshCandidates: [],
      nameCandidates: [],
      warnings: [`${MCP_URL_KEY} is not set; skipping LOC authority enrichment.`],
    };
  }

  const subjectQueries = buildSubjectQueries(input);
  const nameQueries = buildNameQueries(input);

  const headingCalls = subjectQueries.map(async (query) => {
    try {
      const payload = await callMcpTool(
        mcpUrl,
        'search_lcsh_keyword',
        { keyword: query, query, max_results: maxResults, maxResults },
        timeoutMs,
      );
      const items = normalizeArrayPayload(payload);
      return items
        .map((item) => normalizeHeadingCandidate(item, query, 'search_lcsh_keyword'))
        .filter((item): item is LocAuthorityHeadingCandidate => !!item);
    } catch (error: any) {
      warnings.push(`search_lcsh_keyword failed for "${query}": ${error?.message || 'unknown error'}`);
      return [];
    }
  });

  const nameCalls = nameQueries.map(async (query) => {
    try {
      const payload = await callMcpTool(
        mcpUrl,
        'search_name_authority',
        { query, name: query, max_results: maxResults, maxResults },
        timeoutMs,
      );
      const items = normalizeArrayPayload(payload);
      return items
        .map((item) => normalizeNameCandidate(item, query))
        .filter((item): item is LocAuthorityNameCandidate => !!item);
    } catch (error: any) {
      warnings.push(`search_name_authority failed for "${query}": ${error?.message || 'unknown error'}`);
      return [];
    }
  });

  const [headingResults, nameResults] = await Promise.all([
    Promise.all(headingCalls),
    Promise.all(nameCalls),
  ]);

  return {
    provider: 'cataloger-mcp',
    enabled: true,
    lcshCandidates: dedupeHeadings(headingResults.flat()).slice(0, 20),
    nameCandidates: dedupeNames(nameResults.flat()).slice(0, 10),
    warnings,
  };
};

const buildViaDirect = async (
  input: LocAuthorityInput,
  timeoutMs: number,
  maxResults: number,
): Promise<LocAuthorityContext> => {
  const warnings: string[] = [];
  const searchBaseUrl = (process.env[DIRECT_SEARCH_URL_KEY] || 'https://www.loc.gov/books/').trim();

  const headings: LocAuthorityHeadingCandidate[] = [];
  const names: LocAuthorityNameCandidate[] = [];
  const detailUrls = new Set<string>();

  const identifier = sanitizeIdentifier(input.identifier);
  const queryPlan = [
    ...(identifier ? [`isbn:${identifier}`] : []),
    ...buildSubjectQueries(input),
    ...buildNameQueries(input),
  ];
  const queries = toUniqueArray(queryPlan).slice(0, 6);

  for (const query of queries) {
    try {
      const searchPayload = await fetchJsonWithTimeout(
        buildLocSearchUrl(searchBaseUrl, query, maxResults),
        timeoutMs,
      );
      const items = extractLocItems(searchPayload);
      const mapped = mapLocItemsToCandidates(items, query);
      mapped.headings.forEach((candidate) => headings.push(candidate));
      mapped.names.forEach((candidate) => names.push(candidate));
      mapped.detailUrls.forEach((url) => detailUrls.add(url));
    } catch (error: any) {
      warnings.push(`direct LOC search failed for "${query}": ${error?.message || 'unknown error'}`);
    }
  }

  const detailTargets = Array.from(detailUrls).slice(0, 3);
  await Promise.all(
    detailTargets.map(async (detailUrl) => {
      try {
        const detailPayload = await fetchJsonWithTimeout(
          `${detailUrl}${detailUrl.includes('?') ? '&' : '?'}fo=json`,
          timeoutMs,
        );
        const detailItems = extractLocItems(detailPayload);
        const mapped = mapLocItemsToCandidates(detailItems, detailUrl);
        mapped.headings.forEach((candidate) => headings.push(candidate));
        mapped.names.forEach((candidate) => names.push(candidate));
      } catch (error: any) {
        warnings.push(`direct LOC detail lookup failed for "${detailUrl}": ${error?.message || 'unknown error'}`);
      }
    }),
  );

  return {
    provider: 'loc-gov-direct',
    enabled: true,
    lcshCandidates: dedupeHeadings(headings).slice(0, 20),
    nameCandidates: dedupeNames(names).slice(0, 10),
    warnings,
  };
};

export const buildLocAuthorityContext = async (
  input: LocAuthorityInput,
): Promise<LocAuthorityContext | null> => {
  if (!isLocAuthorityEnrichmentEnabled()) {
    return null;
  }

  const mode = getLocAuthorityMode();
  const timeoutMs = Math.max(500, parseIntegerEnv(process.env[TIMEOUT_MS_KEY], 3500));
  const maxResults = Math.max(1, Math.min(10, parseIntegerEnv(process.env[MAX_RESULTS_KEY], 5)));
  return mode === 'direct'
    ? buildViaDirect(input, timeoutMs, maxResults)
    : buildViaMcp(input, timeoutMs, maxResults);
};
