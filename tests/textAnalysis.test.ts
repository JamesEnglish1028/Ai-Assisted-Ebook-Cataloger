import { calculateFleschKincaid, calculateGunningFog } from '../server/services/textAnalysis';

describe('Text Analysis Service', () => {
  describe('calculateFleschKincaid', () => {
    it('should calculate reading level for simple text', () => {
      const simpleText = 'The cat sat on the mat. It was a sunny day.';
      const score = calculateFleschKincaid(simpleText);
      
      expect(score).toBeDefined();
      expect(score).not.toBeNull();
      expect(typeof score?.score).toBe('number');
      expect(score?.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle complex academic text', () => {
      const complexText = `
        The implementation of sophisticated algorithms requires comprehensive understanding 
        of computational complexity theory and mathematical optimization techniques. 
        These methodologies facilitate the development of efficient solutions.
      `;
      const score = calculateFleschKincaid(complexText);
      
      expect(score).toBeDefined();
      expect(score).not.toBeNull();
      expect(typeof score?.score).toBe('number');
      // Complex text should have a higher grade level
      expect(score?.score).toBeGreaterThan(10);
    });

    it('should handle empty or invalid text', () => {
      expect(calculateFleschKincaid('')).toBeNull();
      expect(calculateFleschKincaid('   ')).toBeNull();
      const numericScore = calculateFleschKincaid('123 456 789');
      expect(numericScore).not.toBeNull();
      expect(numericScore?.score).toBeGreaterThanOrEqual(0);
    });

    it('should handle text with no sentences', () => {
      const noSentenceText = 'word1 word2 word3 word4 word5';
      const score = calculateFleschKincaid(noSentenceText);
      expect(score).not.toBeNull();
      expect(score?.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateGunningFog', () => {
    it('should calculate fog index for simple text', () => {
      const simpleText = 'The cat sat on the mat. It was a sunny day.';
      const fogIndex = calculateGunningFog(simpleText);
      
      expect(fogIndex).toBeDefined();
      expect(fogIndex).not.toBeNull();
      expect(typeof fogIndex?.score).toBe('number');
      expect(fogIndex?.score).toBeGreaterThan(0);
    });

    it('should handle text with complex words', () => {
      const complexText = `
        The sophisticated implementation of computational algorithms necessitates 
        comprehensive understanding of theoretical foundations. Contemporary methodologies 
        facilitate optimization of performance characteristics.
      `;
      const fogIndex = calculateGunningFog(complexText);
      
      expect(fogIndex).toBeDefined();
      expect(fogIndex).not.toBeNull();
      expect(typeof fogIndex?.score).toBe('number');
      // Text with complex words should have higher fog index
      expect(fogIndex?.score).toBeGreaterThan(12);
    });

    it('should handle empty or invalid text', () => {
      expect(calculateGunningFog('')).toBeNull();
      expect(calculateGunningFog('   ')).toBeNull();
      const numericFog = calculateGunningFog('123 456 789');
      expect(numericFog).not.toBeNull();
      expect(numericFog?.score).toBeGreaterThanOrEqual(0);
    });

    it('should count complex words correctly', () => {
      // Text with known complex words (3+ syllables)
      const textWithComplexWords = 'Beautiful. Wonderful. Amazing. Incredible.';
      const fogIndex = calculateGunningFog(textWithComplexWords);
      
      expect(fogIndex).toBeDefined();
      expect(fogIndex?.score).toBeGreaterThan(8); // Should reflect complex words
    });
  });

  describe('Edge cases', () => {
    it('should handle very long text', () => {
      const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(1000);
      const fleschScore = calculateFleschKincaid(longText);
      const fogScore = calculateGunningFog(longText);
      
      expect(fleschScore).toBeDefined();
      expect(fogScore).toBeDefined();
      expect(typeof fleschScore?.score).toBe('number');
      expect(typeof fogScore?.score).toBe('number');
    });

    it('should handle text with special characters', () => {
      const specialText = 'Hello, world! This is a test... How are you? I\'m fine—thanks for asking.';
      const fleschScore = calculateFleschKincaid(specialText);
      const fogScore = calculateGunningFog(specialText);
      
      expect(fleschScore).toBeDefined();
      expect(fogScore).toBeDefined();
    });

    it('should handle single word sentences', () => {
      const singleWordText = 'Yes. No. Maybe. Certainly. Absolutely.';
      const fleschScore = calculateFleschKincaid(singleWordText);
      const fogScore = calculateGunningFog(singleWordText);
      
      expect(fleschScore).toBeDefined();
      expect(fogScore).toBeDefined();
    });
  });
});