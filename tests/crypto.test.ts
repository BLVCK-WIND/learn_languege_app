import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  sha256,
  hashPayload,
  hashSentence,
  hashMistake,
} from '../src/lib/crypto/hash';

describe('Text Normalization & SHA-256 Hashing (docs/DATABASE_SCHEMA.md Section 3)', () => {
  describe('normalizeText', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeText('   hello world   ')).toBe('hello world');
    });

    it('collapses multiple spaces, tabs, and newlines to a single space', () => {
      expect(normalizeText('hello \t\n  world   again')).toBe('hello world again');
    });

    it('preserves uppercase, lowercase, and punctuation', () => {
      const original = 'She said: "Hello, World! Did you achieve IELTS 6.5?"';
      expect(normalizeText(original)).toBe(original);
    });

    it('normalizes Unicode into NFC precomposed form', () => {
      // Decomposed 'e' + combining acute accent (\u0065\u0301)
      const decomposed = 'caf\u0065\u0301';
      // Precomposed 'é' (\u00e9)
      const precomposed = 'caf\u00e9';

      expect(decomposed).not.toBe(precomposed); // Raw strings are different before NFC
      expect(normalizeText(decomposed)).toBe(precomposed); // Normalized matches NFC
    });

    it('handles empty or blank string gracefully', () => {
      expect(normalizeText('')).toBe('');
      expect(normalizeText('   ')).toBe('');
    });
  });

  describe('sha256', () => {
    it('produces a 64-character lowercase hex string matching standard SHA-256', () => {
      // Standard known SHA-256 vector for empty string
      const emptyHash = sha256('');
      expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(emptyHash).toHaveLength(64);
    });
  });

  describe('hashPayload', () => {
    it('hashes raw JSON payloads consistently', () => {
      const payload = JSON.stringify({ session: 1, words: ['achieve'] });
      const hash1 = hashPayload(payload);
      const hash2 = hashPayload(payload);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe('hashSentence', () => {
    it('produces identical hash for same sentence with varying whitespace', () => {
      const h1 = hashSentence('   This is   a test sentence.  ');
      const h2 = hashSentence('This is a test sentence.');
      expect(h1).toBe(h2);
    });

    it('produces different hash when casing differs (preserves capitalization error context)', () => {
      const h1 = hashSentence('This is a test sentence.');
      const h2 = hashSentence('this is a test sentence.');
      expect(h1).not.toBe(h2);
    });
  });

  describe('hashMistake', () => {
    it('produces identical hash for identical mistake pairs regardless of surrounding whitespace', () => {
      const h1 = hashMistake('  he go to school  ', '  he goes to school  ');
      const h2 = hashMistake('he go to school', 'he goes to school');
      expect(h1).toBe(h2);
    });

    it('preserves capitalization differences in mistake hashing', () => {
      const h1 = hashMistake('i love english', 'I love English');
      const h2 = hashMistake('I love english', 'I love English');
      expect(h1).not.toBe(h2);
    });

    it('produces different hash when wrong or correct differs', () => {
      const h1 = hashMistake('he go to school', 'he goes to school');
      const h2 = hashMistake('she go to school', 'she goes to school');
      expect(h1).not.toBe(h2);
    });
  });
});
