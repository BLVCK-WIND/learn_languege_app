import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeAudioUrl,
  extractBestPhonetic,
  fetchDictionaryEntry,
  downloadDictionaryAudio,
  type DictionaryPhonetic,
} from '../src/lib/audio/dictionary-api';
import { getAudioFileName } from '../src/lib/audio/audio-hash';

describe('DictionaryAPI & Audio Hashing Tests (Task 4.2)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_dict_audio_test');
  const destFile = path.join(tempDir, 'subfolder', 'achieve.mp3');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Audio URL Sanitization', () => {
    it('handles empty, undefined, or invalid URLs safely', () => {
      expect(sanitizeAudioUrl(undefined)).toBeNull();
      expect(sanitizeAudioUrl(null)).toBeNull();
      expect(sanitizeAudioUrl('')).toBeNull();
      expect(sanitizeAudioUrl('   ')).toBeNull();
      expect(sanitizeAudioUrl('javascript:alert(1)')).toBeNull();
    });

    it('prepends https: to protocol-relative URLs', () => {
      expect(sanitizeAudioUrl('//ssl.gstatic.com/dictionary/static/sounds/20200429/hello--_gb_1.mp3')).toBe(
        'https://ssl.gstatic.com/dictionary/static/sounds/20200429/hello--_gb_1.mp3'
      );
    });

    it('preserves valid http and https URLs', () => {
      const url = 'https://api.dictionaryapi.dev/media/pronunciations/en/achieve-us.mp3';
      expect(sanitizeAudioUrl(url)).toBe(url);
    });
  });

  describe('extractBestPhonetic - US Pronunciation Priority', () => {
    it('prioritizes -us.mp3 over -au.mp3 and -uk.mp3', () => {
      const phonetics: DictionaryPhonetic[] = [
        {
          audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/hello-au.mp3',
          text: '/həˈləʊ/',
        },
        {
          audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/hello-uk.mp3',
          text: '/həˈləʊ/',
        },
        {
          audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/hello-us.mp3',
          text: '/həˈloʊ/',
        },
      ];

      const result = extractBestPhonetic(phonetics);
      expect(result.audioUrl).toBe('https://api.dictionaryapi.dev/media/pronunciations/en/hello-us.mp3');
      expect(result.ipa).toBe('/həˈloʊ/');
    });

    it('recognizes case-insensitive US URLs such as -US.mp3 and en-us', () => {
      const phonetics: DictionaryPhonetic[] = [
        {
          audio: 'https://example.com/en-us/pronunciation.mp3',
          text: '/test/',
        },
      ];

      const result = extractBestPhonetic(phonetics);
      expect(result.audioUrl).toBe('https://example.com/en-us/pronunciation.mp3');
      expect(result.ipa).toBe('/test/');
    });

    it('falls back to the first valid audio if no US audio is present', () => {
      const phonetics: DictionaryPhonetic[] = [
        {
          audio: '',
          text: '/no-audio/',
        },
        {
          audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/word-uk.mp3',
          text: '/wɜːd/',
        },
      ];

      const result = extractBestPhonetic(phonetics);
      expect(result.audioUrl).toBe('https://api.dictionaryapi.dev/media/pronunciations/en/word-uk.mp3');
      expect(result.ipa).toBe('/wɜːd/');
    });

    it('returns null audioUrl if no phonetic item contains audio', () => {
      const phonetics: DictionaryPhonetic[] = [
        { audio: '', text: '/test/' },
        { text: '/test2/' },
      ];

      const result = extractBestPhonetic(phonetics, '/top-level-ipa/');
      expect(result.audioUrl).toBeNull();
      expect(result.ipa).toBe('/top-level-ipa/');
    });
  });

  describe('Audio Hashing (docs/AUDIO_SUBSYSTEM.md Mục 6.1)', () => {
    it('produces distinct SHA-256 filenames for dictionaryapi vs edge-tts for identical word', () => {
      const dictFileName = getAudioFileName({
        source: 'dictionaryapi',
        text: 'achieve',
      });
      const edgeFileName = getAudioFileName({
        source: 'edge-tts',
        text: 'achieve',
      });

      expect(dictFileName).toMatch(/^[a-f0-9]{64}\.mp3$/);
      expect(edgeFileName).toMatch(/^[a-f0-9]{64}\.mp3$/);
      expect(dictFileName).not.toBe(edgeFileName);
    });

    it('normalizes whitespace in audio filename calculation', () => {
      const hash1 = getAudioFileName({ source: 'dictionaryapi', text: '  apple   tree  ' });
      const hash2 = getAudioFileName({ source: 'dictionaryapi', text: 'apple tree' });
      expect(hash1).toBe(hash2);
    });
  });

  describe('fetchDictionaryEntry', () => {
    it('returns parsed entries on HTTP 200', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            word: 'achieve',
            phonetics: [
              {
                audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/achieve-us.mp3',
                text: '/əˈtʃiːv/',
              },
            ],
          },
        ],
      } as unknown as Response);

      const result = await fetchDictionaryEntry('achieve', { fetchFn: mockFetch });
      expect(result).not.toBeNull();
      expect(result?.[0].word).toBe('achieve');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.dictionaryapi.dev/api/v2/entries/en/achieve',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.any(String),
          }),
        })
      );
    });

    it('returns null gracefully on HTTP 404 (word not found)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const result = await fetchDictionaryEntry('nonexistentwordxyz', { fetchFn: mockFetch });
      expect(result).toBeNull();
    });

    it('returns null on HTTP 530 / Cloudflare error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 530,
      } as unknown as Response);

      const result = await fetchDictionaryEntry('blockedword', { fetchFn: mockFetch });
      expect(result).toBeNull();
    });

    it('returns null on network timeout / abort error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('The operation was aborted'));

      const result = await fetchDictionaryEntry('timeoutword', { fetchFn: mockFetch });
      expect(result).toBeNull();
    });
  });

  describe('downloadDictionaryAudio (Atomic Write & Error Recovery)', () => {
    it('fetches US audio, writes to .tmp, and renames to final destination successfully', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('api/v2/entries')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                word: 'achieve',
                phonetics: [
                  {
                    audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/achieve-us.mp3',
                    text: '/əˈtʃiːv/',
                  },
                ],
              },
            ],
          };
        }
        if (url.endsWith('achieve-us.mp3')) {
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => new TextEncoder().encode('VALID_DICTIONARY_MP3_BYTES').buffer,
          };
        }
        return { ok: false, status: 404 };
      });

      const result = await downloadDictionaryAudio('achieve', destFile, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result).not.toBeNull();
      expect(result?.audioFilePath).toBe(destFile);
      expect(result?.audioUrl).toBe('https://api.dictionaryapi.dev/media/pronunciations/en/achieve-us.mp3');
      expect(result?.ipa).toBe('/əˈtʃiːv/');

      // File đích phải tồn tại và có dữ liệu chính xác
      expect(fs.existsSync(destFile)).toBe(true);
      const content = await fs.promises.readFile(destFile, 'utf-8');
      expect(content).toBe('VALID_DICTIONARY_MP3_BYTES');

      // Thư mục không còn chứa file .tmp nào
      const filesInDir = await fs.promises.readdir(path.dirname(destFile));
      const tmpFiles = filesInDir.filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles.length).toBe(0);
    });

    it('returns null when dictionary entry does not contain any audio URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            word: 'rareword',
            phonetics: [{ text: '/rare/' }],
          },
        ],
      } as unknown as Response);

      const result = await downloadDictionaryAudio('rareword', destFile, {
        fetchFn: mockFetch,
      });

      expect(result).toBeNull();
      expect(fs.existsSync(destFile)).toBe(false);
    });

    it('returns null and cleans up .tmp when audio binary stream download fails', async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('api/v2/entries')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                word: 'failaudio',
                phonetics: [
                  {
                    audio: 'https://api.dictionaryapi.dev/media/fail.mp3',
                    text: '/fail/',
                  },
                ],
              },
            ],
          };
        }
        // Giả lập lỗi khi tải binary file
        throw new Error('Connection reset by peer');
      });

      const result = await downloadDictionaryAudio('failaudio', destFile, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result).toBeNull();
      expect(fs.existsSync(destFile)).toBe(false);

      if (fs.existsSync(path.dirname(destFile))) {
        const filesInDir = await fs.promises.readdir(path.dirname(destFile));
        const tmpFiles = filesInDir.filter((f) => f.endsWith('.tmp'));
        expect(tmpFiles.length).toBe(0);
      }
    });

    it('overwrites destination file cleanly if destination already exists', async () => {
      await fs.promises.mkdir(path.dirname(destFile), { recursive: true });
      await fs.promises.writeFile(destFile, 'PREVIOUS_AUDIO_VERSION');

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('api/v2/entries')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              {
                word: 'replace',
                phonetics: [
                  {
                    audio: 'https://api.dictionaryapi.dev/media/replace-us.mp3',
                    text: '/rɪˈpleɪs/',
                  },
                ],
              },
            ],
          };
        }
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode('NEW_AUDIO_CONTENT').buffer,
        };
      });

      const result = await downloadDictionaryAudio('replace', destFile, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(result?.audioFilePath).toBe(destFile);
      const updated = await fs.promises.readFile(destFile, 'utf-8');
      expect(updated).toBe('NEW_AUDIO_CONTENT');
    });
  });
});
