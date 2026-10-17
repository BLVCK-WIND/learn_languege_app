import { describe, it, expect, test } from 'vitest';
import {
  interleaveCards,
  DEFAULT_INTERLEAVE_RATIO,
} from '@/lib/srs/interleaving';

describe('Interleaving Algorithm (Task 2b.5)', () => {
  it('interleaves 2 Words : 1 Mistake in perfect ratio', () => {
    const words = ['W1', 'W2', 'W3', 'W4'];
    const mistakes = ['M1', 'M2'];
    const result = interleaveCards(words, mistakes);

    expect(result).toEqual(['W1', 'W2', 'M1', 'W3', 'W4', 'M2']);
  });

  it('appends remaining words when mistakes run out early', () => {
    const words = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
    const mistakes = ['M1'];
    const result = interleaveCards(words, mistakes);

    expect(result).toEqual(['W1', 'W2', 'M1', 'W3', 'W4', 'W5', 'W6']);
  });

  it('appends remaining mistakes when words run out early', () => {
    const words = ['W1'];
    const mistakes = ['M1', 'M2', 'M3'];
    const result = interleaveCards(words, mistakes);

    expect(result).toEqual(['W1', 'M1', 'M2', 'M3']);
  });

  it('returns all words when mistakes list is empty', () => {
    const words = ['W1', 'W2', 'W3'];
    const mistakes: string[] = [];
    const result = interleaveCards(words, mistakes);

    expect(result).toEqual(['W1', 'W2', 'W3']);
  });

  it('returns all mistakes when words list is empty', () => {
    const words: string[] = [];
    const mistakes = ['M1', 'M2'];
    const result = interleaveCards(words, mistakes);

    expect(result).toEqual(['M1', 'M2']);
  });

  it('returns empty array when both lists are empty', () => {
    const result = interleaveCards([], []);
    expect(result).toEqual([]);
  });

  it('supports custom interleave ratio', () => {
    const words = ['W1', 'W2', 'W3'];
    const mistakes = ['M1', 'M2'];
    // 1 Word : 1 Mistake
    const result = interleaveCards(words, mistakes, { words: 1, mistakes: 1 });
    expect(result).toEqual(['W1', 'M1', 'W2', 'M2', 'W3']);
  });
});
