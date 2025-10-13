/**
 * A refined heuristic-based function to count syllables in an English word.
 * It's not perfect but provides a reasonable approximation for readability formulas.
 * @param word The word to count syllables for.
 * @returns An estimated number of syllables.
 */
function countSyllables(word: string): number {
  if (!word) return 0;

  // 1. Clean the word: lowercase, remove non-alphabetic characters.
  word = word.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (word.length === 0) return 0;

  // 2. Short words are almost always one syllable.
  if (word.length <= 3) return 1;

  // 3. Apply regex rules for common suffixes and vowel patterns.
  // Remove common suffixes that are not typically separate syllables (e.g., -es, -ed).
  // Also removes silent 'e' at the end of a word (e.g., 'skate' -> 'skat').
  // This rule is designed to not remove 'e' from consonant-'l'-'e' endings like in 'able'.
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  
  // 'y' at the start of a word is treated as a consonant.
  word = word.replace(/^y/, '');

  // 4. Count the number of vowel groups. A consecutive group of vowels is counted as one syllable.
  // This is more accurate than counting individual vowels or using flawed di/tri-graph logic.
  const vowelGroups = word.match(/[aeiouy]+/g);

  // 5. A word must have at least one syllable.
  return vowelGroups ? Math.max(1, vowelGroups.length) : 1;
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
  if (roundedScore < 5) {
    level = 'Early Elementary School';
  } else if (roundedScore < 9) {
    level = 'Middle School';
  } else if (roundedScore < 13) {
    level = 'High School';
  } else if (roundedScore < 17) {
    level = 'College';
  } else {
    level = 'Graduate / Professional';
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
  // A "complex" word in Gunning Fog is defined as a word with 3 or more syllables.
  const complexWordCount = words.filter(word => countSyllables(word) >= 3).length;

  // Prevent division by zero
  if (wordCount === 0 || sentenceCount === 0) {
    return { score: 0, level: 'N/A' };
  }

  // Gunning Fog Index = 0.4 * ((words / sentences) + 100 * (complexWords / words))
  const score = 0.4 * ((wordCount / sentenceCount) + 100 * (complexWordCount / wordCount));
  const roundedScore = Math.max(0, score);
  
  let level: string;
  if (roundedScore >= 18) {
    level = 'Post-graduate / Professional';
  } else if (roundedScore >= 17) {
    level = 'College Graduate';
  } else if (roundedScore >= 13) {
    level = 'College';
  } else if (roundedScore >= 12) {
    level = 'High School Senior';
  } else if (roundedScore >= 9) {
    level = 'High School';
  } else if (roundedScore >= 8) {
    level = '8th Grade';
  } else if (roundedScore >= 7) {
    level = '7th Grade';
  } else if (roundedScore >= 6) {
    level = '6th Grade';
  } else {
    level = 'Elementary School';
  }

  return {
    score: roundedScore,
    level,
  };
}
