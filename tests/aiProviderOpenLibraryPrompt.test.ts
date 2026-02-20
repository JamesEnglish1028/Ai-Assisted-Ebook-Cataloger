import { generateBookAnalysisWithProvider } from '../server/services/aiProviderService';

describe('AI provider prompt integration for Open Library', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-key' };
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('injects Open Library context into OpenAI prompt payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Test summary',
                lcc: [],
                bisac: [],
                lcsh: [],
                fieldOfStudy: 'Humanities',
                discipline: 'Languages & Literature',
              }),
            },
          },
        ],
      }),
      text: async () => '',
    } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await generateBookAnalysisWithProvider(
      'Sample text content',
      { provider: 'openai', model: 'gpt-4.1-mini' },
      {
        openLibraryContext: {
          provider: 'open-library-mcp',
          enabled: true,
          mode: 'shadow',
          matchType: 'identifier',
          confidence: 0.95,
          warnings: [],
          book: {
            title: 'Open Library Book',
            authors: ['Open Library Author'],
            publishDate: '2001',
          },
        },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    const userMessage = requestBody.messages.find((m: any) => m.role === 'user')?.content as string;
    expect(userMessage).toContain('Open Library bibliographic candidate');
    expect(userMessage).toContain('"matchType":"identifier"');
    expect(userMessage).toContain('"title":"Open Library Book"');
  });
});
