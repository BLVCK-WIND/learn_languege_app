import { describe, it, expect, test } from 'vitest';
import {
  createClozeSentence,
  determineWordCardMode,
  type WordCardMode,
} from '@/lib/cloze';

describe('Cloze Deletion & Word Modes (Task 2b.2)', () => {
  describe('createClozeSentence', () => {
    const clozeTestCases = [
      {
        name: 'Standard exact match inside sentence',
        sentence: 'I am achieving high scores in IELTS.',
        targetForm: 'achieving',
        expectedSuccess: true,
        expectedCloze: 'I am [...] high scores in IELTS.',
        expectedMatched: 'achieving',
      },
      {
        name: 'Case-insensitive match at sentence beginning',
        sentence: 'Achieving band 6.5 requires consistent daily practice.',
        targetForm: 'achieving',
        expectedSuccess: true,
        expectedCloze: '[...] band 6.5 requires consistent daily practice.',
        expectedMatched: 'Achieving',
      },
      {
        name: 'Prevents replacing substring inside another word',
        sentence: 'He drove a scar-colored sports car on the road.',
        targetForm: 'car',
        expectedSuccess: true,
        expectedCloze: 'He drove a scar-colored sports [...] on the road.',
        expectedMatched: 'car',
      },
      {
        name: 'Target form adjacent to punctuation',
        sentence: 'His determination is remarkable; he will achieve.',
        targetForm: 'achieve',
        expectedSuccess: true,
        expectedCloze: 'His determination is remarkable; he will [...].',
        expectedMatched: 'achieve',
      },
      {
        name: 'Fails gracefully when targetForm is not found in sentence',
        sentence: 'This sentence does not contain the word.',
        targetForm: 'extraordinary',
        expectedSuccess: false,
        expectedCloze: 'This sentence does not contain the word.',
        expectedMatched: null,
      },
      {
        name: 'Fails gracefully when targetForm is null',
        sentence: 'A complete sentence.',
        targetForm: null,
        expectedSuccess: false,
        expectedCloze: 'A complete sentence.',
        expectedMatched: null,
      },
      {
        name: 'Fails gracefully when targetForm is empty string',
        sentence: 'A complete sentence.',
        targetForm: '   ',
        expectedSuccess: false,
        expectedCloze: 'A complete sentence.',
        expectedMatched: null,
      },
    ];

    test.each(clozeTestCases)(
      '$name',
      ({ sentence, targetForm, expectedSuccess, expectedCloze, expectedMatched }) => {
        const result = createClozeSentence(sentence, targetForm);
        expect(result.success).toBe(expectedSuccess);
        expect(result.clozeText).toBe(expectedCloze);
        expect(result.matchedForm).toBe(expectedMatched);
      }
    );
  });

  describe('determineWordCardMode - Mode Selection & Graceful Fallback', () => {
    const modeTestCases: {
      name: string;
      repetitions: number;
      sentenceText?: string | null;
      targetForm?: string | null;
      expectedMode: WordCardMode;
      expectedFallback: boolean;
    }[] = [
      {
        name: 'repetitions = 0 selects RECOGNITION (Word -> Meaning)',
        repetitions: 0,
        sentenceText: 'He decided to achieve his dreams.',
        targetForm: 'achieve',
        expectedMode: 'RECOGNITION',
        expectedFallback: false,
      },
      {
        name: 'repetitions = 1 selects RECALL (Meaning -> Word)',
        repetitions: 1,
        sentenceText: 'He decided to achieve his dreams.',
        targetForm: 'achieve',
        expectedMode: 'RECALL',
        expectedFallback: false,
      },
      {
        name: 'repetitions = 2 with valid cloze selects CLOZE',
        repetitions: 2,
        sentenceText: 'He decided to achieve his dreams.',
        targetForm: 'achieve',
        expectedMode: 'CLOZE',
        expectedFallback: false,
      },
      {
        name: 'repetitions = 2 with missing targetForm falls back to RECOGNITION',
        repetitions: 2,
        sentenceText: 'He decided to achieve his dreams.',
        targetForm: null,
        expectedMode: 'RECOGNITION',
        expectedFallback: true,
      },
      {
        name: 'repetitions = 3 with targetForm not in sentence falls back to RECALL',
        repetitions: 3,
        sentenceText: 'A different sentence altogether.',
        targetForm: 'achieve',
        expectedMode: 'RECALL',
        expectedFallback: true,
      },
      {
        name: 'repetitions = 4 with no example sentence falls back to RECOGNITION',
        repetitions: 4,
        sentenceText: null,
        targetForm: null,
        expectedMode: 'RECOGNITION',
        expectedFallback: true,
      },
    ];

    test.each(modeTestCases)(
      '$name',
      ({ repetitions, sentenceText, targetForm, expectedMode, expectedFallback }) => {
        const result = determineWordCardMode({ repetitions, sentenceText, targetForm });
        expect(result.mode).toBe(expectedMode);
        expect(result.isFallback).toBe(expectedFallback);
      }
    );
  });
});
