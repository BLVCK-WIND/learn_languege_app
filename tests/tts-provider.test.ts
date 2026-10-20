import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  EdgeTtsProvider,
  edgeTtsProvider,
  DEFAULT_EDGE_VOICE,
  DEFAULT_EDGE_LANG,
  DEFAULT_EDGE_TIMEOUT_MS,
  MAX_TTS_TEXT_LENGTH,
} from '../src/lib/audio/edge-tts-provider';

// Mock node-edge-tts để kiểm thử tất định, nhanh và an toàn
const mockConstructor = vi.fn();
const mockTtsPromise = vi.fn();

vi.mock('node-edge-tts', () => {
  return {
    EdgeTTS: class MockEdgeTTS {
      constructor(config?: any) {
        mockConstructor(config);
      }
      ttsPromise(text: string, filePath: string) {
        return mockTtsPromise(text, filePath);
      }
    },
  };
});

describe('EdgeTtsProvider Unit & Atomic Write Tests (Task 4.1)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_tts_test');
  const destFile = path.join(tempDir, 'subfolder', 'test_audio.mp3');

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Mock mặc định: ghi 1 file mp3 giả lập hợp lệ (> 0 bytes) vào đường dẫn tạm
    mockTtsPromise.mockImplementation(async (_text: string, tempFilePath: string) => {
      await fs.promises.writeFile(tempFilePath, Buffer.from('FAKE_MP3_AUDIO_STREAM_DATA'));
    });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Input Validation', () => {
    it('throws error when text is empty or only whitespace', async () => {
      const provider = new EdgeTtsProvider();

      await expect(provider.synthesizeToFile('', destFile)).rejects.toThrow(
        'Văn bản cần đọc không được để trống'
      );

      await expect(provider.synthesizeToFile('   \n  \t  ', destFile)).rejects.toThrow(
        'Văn bản cần đọc không được để trống'
      );
    });

    it('throws error when text exceeds 300 characters', async () => {
      const provider = new EdgeTtsProvider();
      const longText = 'a'.repeat(MAX_TTS_TEXT_LENGTH + 1);

      await expect(provider.synthesizeToFile(longText, destFile)).rejects.toThrow(
        `Văn bản vượt quá giới hạn tối đa ${MAX_TTS_TEXT_LENGTH} ký tự`
      );
    });

    it('throws error when destinationFilePath is empty', async () => {
      const provider = new EdgeTtsProvider();

      await expect(provider.synthesizeToFile('Hello world', '')).rejects.toThrow(
        'Đường dẫn file đích không được để trống'
      );
    });
  });

  describe('Configuration & Default Values', () => {
    it('passes required default options: en-US-AriaNeural and en-US', async () => {
      const provider = new EdgeTtsProvider();
      const result = await provider.synthesizeToFile('Test IELTS word', destFile);

      expect(result).toBe(destFile);
      expect(mockConstructor).toHaveBeenCalledWith({
        voice: DEFAULT_EDGE_VOICE,
        lang: DEFAULT_EDGE_LANG,
        rate: 'default',
        pitch: 'default',
        timeout: DEFAULT_EDGE_TIMEOUT_MS,
      });
    });

    it('allows overriding options such as rate, pitch, and voice', async () => {
      const provider = new EdgeTtsProvider();
      await provider.synthesizeToFile('Test options', destFile, {
        voice: 'en-US-GuyNeural',
        lang: 'en-US',
        rate: '+15%',
        pitch: '+2Hz',
        timeout: 5000,
      });

      expect(mockConstructor).toHaveBeenCalledWith({
        voice: 'en-US-GuyNeural',
        lang: 'en-US',
        rate: '+15%',
        pitch: '+2Hz',
        timeout: 5000,
      });
    });

    it('exports singleton edgeTtsProvider by default', () => {
      expect(edgeTtsProvider).toBeInstanceOf(EdgeTtsProvider);
    });
  });

  describe('Atomic File Write & Temp File Cleanup', () => {
    it('creates parent directories, writes to .tmp file, and renames to final .mp3', async () => {
      const provider = new EdgeTtsProvider();

      let capturedTempPath = '';
      mockTtsPromise.mockImplementation(async (_text: string, tempFilePath: string) => {
        capturedTempPath = tempFilePath;
        // Kiểm tra file tạm nằm cùng thư mục và có đuôi .tmp
        expect(tempFilePath.endsWith('.tmp')).toBe(true);
        expect(path.dirname(tempFilePath)).toBe(path.dirname(destFile));
        await fs.promises.writeFile(tempFilePath, Buffer.from('FAKE_MP3_STREAM'));
      });

      const returnedPath = await provider.synthesizeToFile('Vocabulary pronunciation', destFile);

      expect(returnedPath).toBe(destFile);
      // File đích phải tồn tại và có nội dung đúng
      expect(fs.existsSync(destFile)).toBe(true);
      const content = await fs.promises.readFile(destFile, 'utf-8');
      expect(content).toBe('FAKE_MP3_STREAM');

      // File tạm .tmp không được còn sót lại sau khi đổi tên thành công
      expect(fs.existsSync(capturedTempPath)).toBe(false);
    });

    it('cleans up .tmp file when ttsPromise throws an error (e.g., WebSocket failure / timeout)', async () => {
      const provider = new EdgeTtsProvider();

      let capturedTempPath = '';
      mockTtsPromise.mockImplementation(async (_text: string, tempFilePath: string) => {
        capturedTempPath = tempFilePath;
        // Giả lập ghi dở dang file tạm rồi gặp lỗi kết nối
        await fs.promises.writeFile(tempFilePath, Buffer.from('PARTIAL_CORRUPT_BYTES'));
        throw new Error('WebSocket connection closed prematurely 429');
      });

      await expect(
        provider.synthesizeToFile('Pronounce this', destFile)
      ).rejects.toThrow('WebSocket connection closed prematurely 429');

      // File đích không được tạo ra
      expect(fs.existsSync(destFile)).toBe(false);
      // File tạm .tmp phải được dọn dẹp sạch sẽ
      expect(fs.existsSync(capturedTempPath)).toBe(false);
    });

    it('rejects and cleans up temp file if generated file has 0 bytes', async () => {
      const provider = new EdgeTtsProvider();

      let capturedTempPath = '';
      mockTtsPromise.mockImplementation(async (_text: string, tempFilePath: string) => {
        capturedTempPath = tempFilePath;
        // Ghi file 0 byte
        await fs.promises.writeFile(tempFilePath, Buffer.alloc(0));
      });

      await expect(
        provider.synthesizeToFile('Silent word', destFile)
      ).rejects.toThrow('File âm thanh tạm sinh ra có kích thước 0 byte');

      expect(fs.existsSync(destFile)).toBe(false);
      expect(fs.existsSync(capturedTempPath)).toBe(false);
    });

    it('overwrites destination file cleanly if destination already exists (Windows safe)', async () => {
      const provider = new EdgeTtsProvider();
      await fs.promises.mkdir(path.dirname(destFile), { recursive: true });
      await fs.promises.writeFile(destFile, 'OLD_PREVIOUS_VERSION');

      mockTtsPromise.mockImplementation(async (_text: string, tempFilePath: string) => {
        await fs.promises.writeFile(tempFilePath, Buffer.from('NEW_SYNTHESIZED_VERSION'));
      });

      const result = await provider.synthesizeToFile('Updated word', destFile);

      expect(result).toBe(destFile);
      const updatedContent = await fs.promises.readFile(destFile, 'utf-8');
      expect(updatedContent).toBe('NEW_SYNTHESIZED_VERSION');
    });
  });
});
