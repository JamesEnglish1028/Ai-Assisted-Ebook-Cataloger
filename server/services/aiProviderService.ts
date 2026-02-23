import { BookAnalysis, generateBookAnalysis as generateGeminiBookAnalysis } from './geminiService';
import type { LocAuthorityContext } from './locAuthorityService';
import type { OpenLibraryContext } from './openLibraryService';
import type { HardcoverContext } from './hardcoverService';

export type AIProvider = 'google' | 'openai' | 'anthropic';

export interface AISelection {
  provider: AIProvider;
  model: string;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-3-5-haiku-latest',
};

interface BookAnalysisOptions {
  locAuthorityContext?: LocAuthorityContext | null;
  openLibraryContext?: OpenLibraryContext | null;
  hardcoverContext?: HardcoverContext | null;
}

const buildPrompt = (bookText: string, options?: BookAnalysisOptions) => {
  const lcshCandidates = options?.locAuthorityContext?.lcshCandidates?.slice(0, 10) || [];
  const nameCandidates = options?.locAuthorityContext?.nameCandidates?.slice(0, 6) || [];
  const authorityPromptBlock = lcshCandidates.length > 0 || nameCandidates.length > 0
    ? `
Library of Congress authority candidates (from cataloger-mcp):
${JSON.stringify({
  lcshCandidates: lcshCandidates.map((candidate) => ({
    heading: candidate.heading,
    uri: candidate.uri || null,
  })),
  nameCandidates: nameCandidates.map((candidate) => ({
    label: candidate.label,
    uri: candidate.uri || null,
  })),
})}

Instructions for authority use:
- Prefer authority-backed LCSH headings when they are relevant to the text.
- Keep authorityAlignment.usedAuthorityHeadings limited to headings you actually used in lcsh.
- Keep authorityAlignment.usedNameAuthorities limited to names that materially influenced classification.
`
    : '';
  const openLibraryPromptBlock = options?.openLibraryContext?.book
    ? `
Open Library bibliographic candidate (from mcp-open-library):
${JSON.stringify({
  matchType: options.openLibraryContext.matchType,
  confidence: options.openLibraryContext.confidence,
  book: options.openLibraryContext.book,
})}

Instructions for Open Library use:
- Use Open Library evidence to disambiguate title/author/publisher/date context when relevant.
- Prefer file-extracted metadata when it conflicts with high-confidence content evidence from the uploaded book text.
- In authorityAlignment.notes, mention if Open Library evidence affected classification decisions.
`
    : '';
  const hardcoverPromptBlock = options?.hardcoverContext?.book
    ? `
Hardcover bibliographic candidate:
${JSON.stringify({
  matchType: options.hardcoverContext.matchType,
  confidence: options.hardcoverContext.confidence,
  book: options.hardcoverContext.book,
})}

Instructions for Hardcover use:
- Use Hardcover evidence to disambiguate title/author/publisher/date and series context when relevant.
- Treat series and series position as bibliographic hints; prefer file text/content evidence if conflicting.
- In authorityAlignment.notes, mention if Hardcover evidence affected classification decisions.
`
    : '';

  return `
You are an expert librarian with deep knowledge of MARC records cataloging and book classifications using LCC, LCSH, and BISAC classification systems.
Analyze the following text from an ebook and perform the following tasks:
1.  Generate a compelling 1 paragraphs book summary for an online library catalog. The summary should capture the essence of the plot, key themes, and the overall tone of the book, enticing potential readers without revealing major spoilers.
2.  Determine a list of the most relevant Library of Congress Classification (LCC) Subject Headings. For each heading, provide its letter designator, the main class name, and the specific sub-class name. You MUST NOT provide LCC call numbers like "PS3552.L84".
3.  Determine a list of the most relevant Library of Congress Subject Headings (LCSH). Each heading should be a single string with the main heading and any subdivisions separated by a double hyphen (e.g., "Fantasy fiction -- History and criticism").
4.  Determine a list of the most relevant Book Industry Standards and Communications (BISAC) classification headings. For each heading, you MUST provide both the code and its full descriptive name. For example, "FIC009000 - FICTION / Fantasy / General".
5.  Based on the LCC and BISAC classifications you determine, identify the primary Field of Study and Discipline for this book. You must choose one value for 'fieldOfStudy' and one value for 'discipline' from the official list below.

Official List for Classification:
---
Field of Study: Humanities
Discipline: Performing Arts, Visual Arts, History, Languages & Literature, Law, Philosophy, Religious Studies, Divinity & Theology

Field of Study: Social Science
Discipline: Anthropology, Archeology, Economics, Geography, Linguistics, Political Science, Psychology, Sociology

Field of Study: Natural Science
Discipline: Biology, Chemistry, Earth Science, Astronomy, Physics

Field of Study: Formal Science
Discipline: Computer Science, Mathematics, Applied Mathematics

Field of Study: Applied Science
Discipline: Agriculture, Architecture and Design, Business, Education, Engineering and Technology, Environmental Studies and Forestry, Family and Consumer Science, Human physical performance and reaction, Journalism, Media Studies and Communication, Law, Library and Museum studies, Medicine and Health, Military Science, Public Administration, Public Policy, Social Work, Transportation
---

Return the result as a single JSON object.
${authorityPromptBlock}
${openLibraryPromptBlock}
${hardcoverPromptBlock}

Here is the ebook text:
---
${bookText}
---
`;
};

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    lcc: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          designator: { type: 'string' },
          mainClass: { type: 'string' },
          subClass: { type: 'string' },
        },
        required: ['designator', 'mainClass', 'subClass'],
        additionalProperties: false,
      },
    },
    bisac: { type: 'array', items: { type: 'string' } },
    lcsh: { type: 'array', items: { type: 'string' } },
    fieldOfStudy: { type: 'string' },
    discipline: { type: 'string' },
    authorityAlignment: {
      type: 'object',
      properties: {
        usedAuthorityHeadings: { type: 'array', items: { type: 'string' } },
        usedNameAuthorities: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['usedAuthorityHeadings', 'usedNameAuthorities'],
      additionalProperties: false,
    },
  },
  required: ['summary', 'lcc', 'bisac', 'lcsh', 'fieldOfStudy', 'discipline'],
  additionalProperties: false,
} as const;

const normalizeProvider = (provider?: string): AIProvider => {
  const value = (provider || '').trim().toLowerCase();
  if (value === 'google' || value === 'gemini') return 'google';
  if (value === 'openai') return 'openai';
  if (value === 'anthropic' || value === 'claude') return 'anthropic';
  return 'google';
};

const extractJsonObject = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
};

const parseAnalysis = (raw: string): BookAnalysis => {
  const parsed = JSON.parse(extractJsonObject(raw));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.summary !== 'string') {
    throw new Error('Model returned invalid JSON analysis payload.');
  }
  return parsed as BookAnalysis;
};

const getRequiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable not set.`);
  }
  return value;
};

const generateWithOpenAI = async (
  bookText: string,
  model: string,
  options?: BookAnalysisOptions,
): Promise<BookAnalysis> => {
  const apiKey = getRequiredEnv('OPENAI_API_KEY');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content: 'You are a precise cataloging assistant. Return only JSON matching the schema.',
        },
        { role: 'user', content: buildPrompt(bookText, options) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'book_analysis',
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${detail}`);
  }

  const payload = await response.json() as any;
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI API returned an empty analysis response.');
  }

  return parseAnalysis(content);
};

const generateWithAnthropic = async (
  bookText: string,
  model: string,
  options?: BookAnalysisOptions,
): Promise<BookAnalysis> => {
  const apiKey = getRequiredEnv('ANTHROPIC_API_KEY');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2200,
      temperature: 0.5,
      system: 'You are a precise cataloging assistant. Return only valid JSON and no markdown.',
      messages: [
        {
          role: 'user',
          content: buildPrompt(bookText, options),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${detail}`);
  }

  const payload = await response.json() as any;
  const textParts = Array.isArray(payload?.content)
    ? payload.content
      .filter((item: any) => item?.type === 'text' && typeof item?.text === 'string')
      .map((item: any) => item.text)
    : [];

  const content = textParts.join('\n').trim();
  if (!content) {
    throw new Error('Anthropic API returned an empty analysis response.');
  }

  return parseAnalysis(content);
};

export const resolveAISelection = (
  providerInput?: string,
  modelInput?: string
): AISelection => {
  const provider = normalizeProvider(providerInput);
  const model = modelInput && modelInput.trim().length > 0
    ? modelInput.trim()
    : DEFAULT_MODELS[provider];

  return { provider, model };
};

export const generateBookAnalysisWithProvider = async (
  bookText: string,
  selection: AISelection,
  options?: BookAnalysisOptions,
): Promise<BookAnalysis> => {
  if (selection.provider === 'google') {
    return generateGeminiBookAnalysis(bookText, {
      model: selection.model,
      locAuthorityContext: options?.locAuthorityContext,
      openLibraryContext: options?.openLibraryContext,
    });
  }
  if (selection.provider === 'openai') {
    return generateWithOpenAI(bookText, selection.model, options);
  }
  return generateWithAnthropic(bookText, selection.model, options);
};
