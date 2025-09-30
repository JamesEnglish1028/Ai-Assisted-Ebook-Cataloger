import { GoogleGenAI, Type } from 'https://esm.run/@google/genai';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export interface BookAnalysis {
  summary: string;
  lcc: string[];
  bisac: string[];
}

export async function generateBookAnalysis(bookText: string): Promise<BookAnalysis> {
  const prompt = `
    You are an expert cataloging librarian with deep knowledge of LCC and BISAC classification systems.
    Analyze the following text from an ebook and perform the following tasks:
    1.  Generate a compelling summary of 1-2 paragraphs for an online library catalog. The summary should capture the essence of the plot, key themes, and the overall tone of the book, enticing potential readers without revealing major spoilers.
    2.  Determine a list of the most relevant Library of Congress Classification (LCC) Subject Headings. It is critical that you provide the full descriptive names of the disciplines and sub-disciplines. For example, "American literature--20th century" or "Computer science--Artificial intelligence". You MUST NOT provide LCC call numbers like "PS3552.L84".
    3.  Determine a list of the most relevant Book Industry Standards and Communications (BISAC) classification headings. For each heading, you MUST provide both the code and its full descriptive name. For example, "FIC009000 - FICTION / Fantasy / General".

    Return the result as a single JSON object.

    Here is the ebook text:
    ---
    ${bookText}
    ---
  `;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.5,
          topP: 0.95,
          topK: 64,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'The 1-2 paragraph summary for the library catalog.'
              },
              lcc: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'A list of relevant Library of Congress Classification (LCC) Subject Headings. Each item MUST be the full descriptive name (e.g., "American literature--20th century") and NOT a call number (e.g., "PS3552.L84").'
              },
              bisac: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'A list of relevant BISAC classification headings. Each item MUST include both the code and the full name (e.g., "FIC009000 - FICTION / Fantasy / General").'
              }
            },
            required: ['summary', 'lcc', 'bisac']
          }
        }
    });

    const analysisResult = JSON.parse(response.text);
    if (!analysisResult || !analysisResult.summary) {
      throw new Error("The API returned an invalid analysis. Please try again.");
    }
    return analysisResult;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to get a response from the AI model. Please check your API key and network connection.");
  }
}