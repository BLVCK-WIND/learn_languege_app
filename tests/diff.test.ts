import { describe, it, expect, test } from 'vitest';
import {
  tokenizeSentence,
  computeLcsDiff,
  compareMistakeSentence,
} from '@/lib/diff';

describe('Word-level Diff Utility (Task 2b.1)', () => {
  describe('tokenizeSentence', () => {
    it('tokenizes words, punctuation, and whitespace properly', () => {
      const tokens = tokenizeSentence("I don't like apples, but he does.");
      expect(tokens).toEqual([
        'I', ' ', "don't", ' ', 'like', ' ', 'apples', ',', ' ', 'but', ' ', 'he', ' ', 'does', '.'
      ]);
    });

    it('handles empty string safely', () => {
      expect(tokenizeSentence('')).toEqual([]);
    });

    it('preserves hyphens in compound words', () => {
      const tokens = tokenizeSentence('state-of-the-art model.');
      expect(tokens).toContain('state-of-the-art');
      expect(tokens).toContain('.');
    });
  });

  describe('compareMistakeSentence - Table-driven Matrix', () => {
    const testCases = [
      {
        name: 'Exact 100% match with correct case and punctuation',
        userInput: 'She has been living here for five years.',
        target: 'She has been living here for five years.',
        expectedExact: true,
        hasUserErrors: false,
        hasTargetMissing: false,
      },
      {
        name: 'Capitalization error at sentence start',
        userInput: 'she has been living here.',
        target: 'She has been living here.',
        expectedExact: false,
        hasUserErrors: true,
        hasTargetMissing: true,
      },
      {
        name: 'Missing terminal punctuation (period)',
        userInput: 'I am preparing for IELTS',
        target: 'I am preparing for IELTS.',
        expectedExact: false,
        hasUserErrors: false,
        hasTargetMissing: true,
      },
      {
        name: 'Subject-verb agreement error (grammar)',
        userInput: 'He have two cars.',
        target: 'He has two cars.',
        expectedExact: false,
        hasUserErrors: true,
        hasTargetMissing: true,
      },
      {
        name: 'Missing word in sentence',
        userInput: 'I look forward seeing you.',
        target: 'I look forward to seeing you.',
        expectedExact: false,
        hasUserErrors: false,
        hasTargetMissing: true,
      },
      {
        name: 'Extra word in sentence',
        userInput: 'He discussed about the problem.',
        target: 'He discussed the problem.',
        expectedExact: false,
        hasUserErrors: true,
        hasTargetMissing: false,
      },
      {
        name: 'Empty user input (user clicked skip / gave up)',
        userInput: '',
        target: 'Learning English requires patience.',
        expectedExact: false,
        hasUserErrors: false,
        hasTargetMissing: true,
      },
      {
        name: 'Leading and trailing whitespace ignored in exact match',
        userInput: '   The weather is nice today.   ',
        target: 'The weather is nice today.',
        expectedExact: true,
        hasUserErrors: false,
        hasTargetMissing: false,
      },
    ];

    test.each(testCases)(
      '$name',
      ({ userInput, target, expectedExact, hasUserErrors, hasTargetMissing }) => {
        const result = compareMistakeSentence(userInput, target);
        expect(result.isExactMatch).toBe(expectedExact);

        const foundUserErrors = result.userChunks.some((c) => c.isError);
        expect(foundUserErrors).toBe(hasUserErrors);

        const foundTargetMissing = result.targetChunks.some((c) => c.isMissingOrChanged);
        expect(foundTargetMissing).toBe(hasTargetMissing);
      }
    );
  });

  describe('Diff Highlights Inspection', () => {
    it('pinpoints capitalization difference', () => {
      const result = compareMistakeSentence('apple', 'Apple');
      expect(result.isExactMatch).toBe(false);
      expect(result.userChunks[0]).toEqual({ value: 'apple', isError: true });
      expect(result.targetChunks[0]).toEqual({ value: 'Apple', isMissingOrChanged: true });
    });

    it('pinpoints missing punctuation', () => {
      const result = compareMistakeSentence('Hello world', 'Hello world!');
      expect(result.isExactMatch).toBe(false);
      // 'Hello world' matched
      expect(result.targetChunks[result.targetChunks.length - 1]).toEqual({
        value: '!',
        isMissingOrChanged: true,
      });
    });

    it('correctly reconstructs original text from chunks', () => {
      const input = 'I has went to school.';
      const target = 'I have gone to school.';
      const result = compareMistakeSentence(input, target);

      const reconstructedUser = result.userChunks.map((c) => c.value).join('');
      const reconstructedTarget = result.targetChunks.map((c) => c.value).join('');

      expect(reconstructedUser).toBe(input);
      expect(reconstructedTarget).toBe(target);
    });
  });
});
