// This is a common approximation for syllable counting in English.
// It's not perfect but works for the Flesch-Kincaid formula's purpose.
function countSyllables(word: string): number {
  if (!word) return 0;
  word = word.toLowerCase().trim();
  if (word.length <= 3) return 1;
  // Common suffixes that are not syllables
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  // A lone 'y' at the start of a word is not a vowel
  word = word.replace(/^y/, '');
  // Find groups of vowels (a, e, i, o, u, y)
  const match = word.match(/[aeiouy]{1,2}/g);
  // A word must have at least one syllable
  return match ? Math.max(1, match.length) : 1;
}

function countWords(text: string): number {
    if (!text) return 0;
    // Split by any whitespace character
    return text.trim().split(/\s+/).length;
}

function countSentences(text: string): number {
    if (!text) return 0;
    // Count sentences ending in . ! ?
    // The filter(Boolean) handles cases where the text ends with a delimiter.
    const sentenceCount = text.split(/[.!?]+/).filter(Boolean).length;
    return sentenceCount > 0 ? sentenceCount : 1; // Avoid division by zero by assuming at least one sentence
}

interface ReadingLevel {
    score: number;
    level: string;
}

export function calculateFleschKincaid(text: string): ReadingLevel | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  const wordCount = countWords(text);
  const sentenceCount = countSentences(text);
  
  const words = text.trim().split(/\s+/);
  const syllableCount = words.reduce((acc, word) => acc + countSyllables(word), 0);
  
  // Prevent division by zero if text is very short or malformed
  if (wordCount === 0 || sentenceCount === 0) {
    return { score: 0, level: 'N/A' };
  }

  // Flesch-Kincaid Grade Level = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  const score = (0.39 * (wordCount / sentenceCount)) + (11.8 * (syllableCount / wordCount)) - 15.59;
  
  // The score cannot be negative.
  const roundedScore = Math.max(0, score); 

  let level: string;
  if (roundedScore <= 3) {
    level = 'Elementary School';
  } else if (roundedScore <= 9) {
    level = 'Middle School';
  } else if (roundedScore <= 12) {
    level = 'High School';
  } else {
    level = 'College / Advanced';
  }
  
  return {
    score: roundedScore,
    level,
  };
}


export function calculateGunningFog(text: string): ReadingLevel | null {
  if (!text || text.trim().length === 0) {
    return null;
  }

  const wordCount = countWords(text);
  const sentenceCount = countSentences(text);
  
  const words = text.trim().split(/\s+/);
  const complexWordCount = words.filter(word => countSyllables(word) >= 3).length;

  // Prevent division by zero
  if (wordCount === 0 || sentenceCount === 0) {
    return { score: 0, level: 'N/A' };
  }

  // Gunning Fog Index = 0.4 * ((words / sentences) + 100 * (complexWords / words))
  const score = 0.4 * ((wordCount / sentenceCount) + 100 * (complexWordCount / wordCount));
  const roundedScore = Math.max(0, score);
  
  let level: string;
  if (roundedScore >= 20) {
    level = 'Post-graduate plus';
  } else if (roundedScore >= 17) {
    level = 'Post-graduate';
  } else if (roundedScore >= 16) {
    level = 'College senior';
  } else if (roundedScore >= 13) {
    level = 'College';
  } else if (roundedScore >= 11) {
    level = 'High school';
  } else if (roundedScore >= 10) {
    level = 'High school sophomore';
  } else if (roundedScore >= 9) {
    level = 'High school freshman';
  } else if (roundedScore >= 8) {
    level = '8th grade';
  } else if (roundedScore >= 7) {
    level = '7th grade';
  } else if (roundedScore >= 6) {
    level = '6th grade';
  } else {
    level = 'Elementary School';
  }

  return {
    score: roundedScore,
    level,
  };
}
