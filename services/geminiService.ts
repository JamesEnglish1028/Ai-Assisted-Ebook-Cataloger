import { GoogleGenAI, Type } from 'https://esm.run/@google/genai';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export interface LccClassification {
  designator: string;
  mainClass: string;
  subClass: string;
}

export interface BookAnalysis {
  summary: string;
  lcc: LccClassification[];
  bisac: string[];
  fieldOfStudy: string;
  discipline: string;
}

export async function generateBookAnalysis(bookText: string): Promise<BookAnalysis> {
  const prompt = `
    You are an expert cataloging librarian with deep knowledge of LCC and BISAC classification systems.
    Analyze the following text from an ebook and perform the following tasks:
    1.  Generate a compelling summary of 1-2 paragraphs for an online library catalog. The summary should capture the essence of the plot, key themes, and the overall tone of the book, enticing potential readers without revealing major spoilers.
    2.  Determine a list of the most relevant Library of Congress Classification (LCC) Subject Headings. For each heading, provide its letter designator, the main class name, and the specific sub-class name. You MUST NOT provide LCC call numbers like "PS3552.L84".
    3.  Determine a list of the most relevant Book Industry Standards and Communications (BISAC) classification headings. For each heading, you MUST provide both the code and its full descriptive name. For example, "FIC009000 - FICTION / Fantasy / General".
    4.  Based on the LCC and BISAC classifications you determine, identify the primary Field of Study and Discipline for this book. You must choose one value for 'fieldOfStudy' and one value for 'discipline' from the official list below.

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
                items: {
                  type: Type.OBJECT,
                  properties: {
                    designator: {
                      type: Type.STRING,
                      description: 'The main letter designator for the class (e.g., "PS", "QA").'
                    },
                    mainClass: {
                      type: Type.STRING,
                      description: 'The name of the main LCC class (e.g., "American literature").'
                    },
                    subClass: {
                      type: Type.STRING,
                      description: 'The name of the specific LCC sub-class (e.g., "20th century", "Artificial intelligence").'
                    }
                  },
                  required: ['designator', 'mainClass', 'subClass']
                },
                description: 'A list of relevant Library of Congress Classification (LCC) headings.'
              },
              bisac: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'A list of relevant BISAC classification headings. Each item MUST include both the code and the full name (e.g., "FIC009000 - FICTION / Fantasy / General").'
              },
              fieldOfStudy: {
                type: Type.STRING,
                description: "The primary Field of Study for the book, chosen from the provided list."
              },
              discipline: {
                type: Type.STRING,
                description: "The primary Discipline for the book, chosen from the provided list."
              }
            },
            required: ['summary', 'lcc', 'bisac', 'fieldOfStudy', 'discipline']
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