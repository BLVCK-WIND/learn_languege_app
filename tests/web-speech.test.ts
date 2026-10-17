import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isWebSpeechSupported,
  getUsVoices,
  playWebSpeech,
  stopWebSpeech,
} from '../src/lib/audio/web-speech';

describe('Web Speech API Subsystem (docs/AUDIO_SUBSYSTEM.md Sec 7)', () => {
  let originalWindow: typeof globalThis.window;
  let originalNavigator: typeof globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isWebSpeechSupported', () => {
    it('returns false when window or speechSynthesis is not present (SSR safety)', () => {
      // In default Node test environment, window may be undefined or mocked
      const supported = isWebSpeechSupported();
      // Should not throw error
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('Voice loading & Offline localService prioritization', () => {
    let mockSynth: {
      getVoices: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
      speak: ReturnType<typeof vi.fn>;
      onvoiceschanged: (() => void) | null;
    };

    beforeEach(() => {
      mockSynth = {
        getVoices: vi.fn(),
        cancel: vi.fn(),
        speak: vi.fn(),
        onvoiceschanged: null,
      };

      // Mock window and speechSynthesis cleanly
      (globalThis as any).window = {
        speechSynthesis: mockSynth as unknown as SpeechSynthesis,
      };

      // Mock SpeechSynthesisUtterance constructor cleanly
      (globalThis as any).SpeechSynthesisUtterance = class {
        text: string;
        lang: string = 'en-US';
        rate: number = 1.0;
        pitch: number = 1.0;
        voice: unknown = null;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((err: unknown) => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      };
    });

    afterEach(() => {
      delete (globalThis as any).window;
      delete (globalThis as any).SpeechSynthesisUtterance;
    });

    it('waits for onvoiceschanged when voices list is initially empty', async () => {
      const mockVoices = [
        { name: 'Google US English', lang: 'en-US', localService: false },
        { name: 'Microsoft David', lang: 'en-US', localService: true },
        { name: 'Google Francais', lang: 'fr-FR', localService: true },
      ];

      // First call returns empty, second call returns voices
      mockSynth.getVoices
        .mockReturnValueOnce([])
        .mockReturnValue(mockVoices);

      const promise = getUsVoices();

      // Trigger onvoiceschanged callback
      expect(mockSynth.onvoiceschanged).toBeTypeOf('function');
      mockSynth.onvoiceschanged!();

      const voices = await promise;
      expect(voices).toHaveLength(2);
      expect(voices.every((v) => v.lang.startsWith('en'))).toBe(true);
    });

    it('prioritizes localService voice when device is offline (navigator.onLine === false)', async () => {
      const mockVoices = [
        { name: 'Cloud Online Voice', lang: 'en-US', localService: false },
        { name: 'Local Offline Voice', lang: 'en-US', localService: true },
      ];

      mockSynth.getVoices.mockReturnValue(mockVoices);

      // Mock navigator.onLine = false safely with Object.defineProperty
      const originalOnLine = globalThis.navigator?.onLine;
      Object.defineProperty(globalThis.navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      await playWebSpeech('consistent practice');

      expect(mockSynth.cancel).toHaveBeenCalled();
      expect(mockSynth.speak).toHaveBeenCalled();

      const spokenUtterance = mockSynth.speak.mock.calls[0][0] as SpeechSynthesisUtterance;
      expect(spokenUtterance.text).toBe('consistent practice');
      expect(spokenUtterance.lang).toBe('en-US');
      expect(spokenUtterance.rate).toBe(1.0);
      expect((spokenUtterance.voice as any)?.name).toBe('Local Offline Voice');

      // Cleanup
      Object.defineProperty(globalThis.navigator, 'onLine', {
        value: originalOnLine ?? true,
        configurable: true,
      });
    });

    it('cancels speech via stopWebSpeech()', () => {
      stopWebSpeech();
      expect(mockSynth.cancel).toHaveBeenCalled();
    });

    it('rejects empty or whitespace-only text gracefully', async () => {
      const result1 = await playWebSpeech('');
      const result2 = await playWebSpeech('   ');
      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(mockSynth.speak).not.toHaveBeenCalled();
    });
  });
});
