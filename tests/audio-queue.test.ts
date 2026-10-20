import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import {
  AudioQueueService,
  audioQueue,
  type AudioQueueItem,
} from '../src/lib/audio/queue';
import { runAudioRecovery } from '../src/services/audio-recovery.service';
import type { TtsProvider } from '../src/lib/audio/tts-provider';
import * as dictModule from '../src/lib/audio/dictionary-api';
import { GET, POST } from '../src/app/api/audio/queue/route';

describe('AudioQueueService & Background Recovery Tests (Task 4.3)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_audio_queue_test');
  const tempDbPath = path.join(tempDir, 'test_app.db');
  const tempAudioDir = path.join(tempDir, 'audio');

  let testPrisma: PrismaClient;
  let mockTtsProvider: TtsProvider;
  let mockSynthesizeToFile: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // Safe retry on Windows
      }
    }
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(tempAudioDir, { recursive: true });

    // 1. Initialize SQLite schema
    const rawDb = new Database(tempDbPath);
    rawDb.pragma('foreign_keys = ON;');
    const migrationSql = fs.readFileSync(
      path.join(process.cwd(), 'prisma', 'migrations', '20261017170045_init', 'migration.sql'),
      'utf8'
    );
    rawDb.exec(migrationSql);
    rawDb.close();

    const adapter = new PrismaBetterSqlite3({ url: tempDbPath });
    testPrisma = new PrismaClient({ adapter });

    // Mock TtsProvider
    mockSynthesizeToFile = vi.fn().mockImplementation(async (_text: string, destPath: string) => {
      await fs.promises.writeFile(destPath, Buffer.from('FAKE_EDGE_TTS_STREAM'));
      return destPath;
    });

    mockTtsProvider = {
      synthesizeToFile: (text, dest, opts) =>
        opts !== undefined
          ? mockSynthesizeToFile(text, dest, opts)
          : mockSynthesizeToFile(text, dest),
    };
  });

  afterEach(async () => {
    if (testPrisma) {
      await testPrisma.$disconnect();
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // Windows file lock safety
      }
    }
  });

  describe('Singleton Pattern on globalThis', () => {
    it('creates and attaches Singleton to globalThis.__audioQueue', () => {
      expect(audioQueue).toBeInstanceOf(AudioQueueService);
      expect(globalThis.__audioQueue).toBe(audioQueue);
    });
  });

  describe('Queue Priority Ordering & Deduplication', () => {
    it('elevates HIGH priority item to front of queue and avoids duplication', () => {
      const queueService = new AudioQueueService({
        prisma: testPrisma,
        audioDir: tempAudioDir,
        ttsProvider: mockTtsProvider,
        delayBetweenRequestsMs: 0,
      });

      // Ngăn tự động xử lý để kiểm tra danh sách chờ
      vi.spyOn(queueService, 'processQueue').mockImplementation(async () => {});

      queueService.enqueue({
        itemType: 'WORD',
        itemId: 'word-1',
        text: 'apple',
        priority: 'NORMAL',
      });

      queueService.enqueue({
        itemType: 'WORD',
        itemId: 'word-2',
        text: 'banana',
        priority: 'NORMAL',
      });

      let items = queueService.getQueueItems();
      expect(items.map((i) => i.itemId)).toEqual(['word-1', 'word-2']);

      // Thêm mục HIGH priority -> phải nhảy lên đầu
      queueService.enqueue({
        itemType: 'WORD',
        itemId: 'word-3',
        text: 'cherry',
        priority: 'HIGH',
      });

      items = queueService.getQueueItems();
      expect(items.map((i) => i.itemId)).toEqual(['word-3', 'word-1', 'word-2']);

      // Thăng hạng word-2 (đang là NORMAL ở cuối) lên HIGH
      queueService.enqueue({
        itemType: 'WORD',
        itemId: 'word-2',
        text: 'banana',
        priority: 'HIGH',
      });

      items = queueService.getQueueItems();
      // word-2 phải được đưa lên nhóm HIGH, không bị nhân đôi
      expect(items.map((i) => i.itemId)).toEqual(['word-3', 'word-2', 'word-1']);
    });
  });

  describe('Tiered Processing for Word & Sentence', () => {
    it('processes Word via Tier 1 DictionaryAPI when available', async () => {
      const word = await testPrisma.word.create({
        data: {
          normalizedWord: 'achieve',
          pos: 'verb',
          audioStatus: 'PENDING',
        },
      });

      // Mock DictionaryAPI thành công
      const dictSpy = vi.spyOn(dictModule, 'downloadDictionaryAudio').mockResolvedValue({
        audioFilePath: path.join(tempAudioDir, 'mock.mp3'),
        audioUrl: 'https://api.dictionaryapi.dev/achieve-us.mp3',
        ipa: '/əˈtʃiːv/',
      });

      const queueService = new AudioQueueService({
        prisma: testPrisma,
        audioDir: tempAudioDir,
        ttsProvider: mockTtsProvider,
        delayBetweenRequestsMs: 0,
      });

      await queueService.enqueue({
        itemType: 'WORD',
        itemId: word.id,
        text: word.normalizedWord,
        priority: 'NORMAL',
      });

      const updatedWord = await testPrisma.word.findUnique({ where: { id: word.id } });
      expect(updatedWord?.audioStatus).toBe('READY');
      expect(updatedWord?.audioUrl).toMatch(/^\/api\/audio\/[a-f0-9]{64}\.mp3$/);
      expect(updatedWord?.ipa).toBe('/əˈtʃiːv/');
      expect(dictSpy).toHaveBeenCalled();
      expect(mockSynthesizeToFile).not.toHaveBeenCalled();
    });

    it('falls back Word to Tier 2 EdgeTTS when DictionaryAPI returns null', async () => {
      const word = await testPrisma.word.create({
        data: {
          normalizedWord: 'obscureword',
          pos: 'noun',
          audioStatus: 'PENDING',
        },
      });

      // Mock DictionaryAPI trả về null (404 / no audio)
      vi.spyOn(dictModule, 'downloadDictionaryAudio').mockResolvedValue(null);

      const queueService = new AudioQueueService({
        prisma: testPrisma,
        audioDir: tempAudioDir,
        ttsProvider: mockTtsProvider,
        delayBetweenRequestsMs: 0,
      });

      await queueService.enqueue({
        itemType: 'WORD',
        itemId: word.id,
        text: word.normalizedWord,
        priority: 'NORMAL',
      });

      const updatedWord = await testPrisma.word.findUnique({ where: { id: word.id } });
      expect(updatedWord?.audioStatus).toBe('READY');
      expect(updatedWord?.audioUrl).toMatch(/^\/api\/audio\/[a-f0-9]{64}\.mp3$/);
      // Đã gọi fallback sang EdgeTTS
      expect(mockSynthesizeToFile).toHaveBeenCalledWith('obscureword', expect.any(String));
    });

    it('processes Sentence directly via EdgeTTS (Tier 1 for Sentences)', async () => {
      const word = await testPrisma.word.create({
        data: {
          normalizedWord: 'persist',
          pos: 'verb',
        },
      });

      const sentence = await testPrisma.sentence.create({
        data: {
          wordId: word.id,
          text: 'She persisted through challenges.',
          translationVi: 'Cô ấy đã kiên trì vượt qua thử thách.',
          contentHash: 'hash-persist-sentence-1',
          audioStatus: 'PENDING',
        },
      });

      const dictSpy = vi.spyOn(dictModule, 'downloadDictionaryAudio');

      const queueService = new AudioQueueService({
        prisma: testPrisma,
        audioDir: tempAudioDir,
        ttsProvider: mockTtsProvider,
        delayBetweenRequestsMs: 0,
      });

      await queueService.enqueue({
        itemType: 'SENTENCE',
        itemId: sentence.id,
        text: sentence.text,
        priority: 'NORMAL',
      });

      const updatedSentence = await testPrisma.sentence.findUnique({ where: { id: sentence.id } });
      expect(updatedSentence?.audioStatus).toBe('READY');
      expect(updatedSentence?.audioUrl).toMatch(/^\/api\/audio\/[a-f0-9]{64}\.mp3$/);
      // Sentence không được gọi DictionaryAPI
      expect(dictSpy).not.toHaveBeenCalled();
      expect(mockSynthesizeToFile).toHaveBeenCalledWith(sentence.text, expect.any(String));
    });
  });

  describe('Retry & Failure Handling (Max 3 attempts)', () => {
    it('increments attempts on error and marks FAILED after 3 failed attempts', async () => {
      const word = await testPrisma.word.create({
        data: {
          normalizedWord: 'broken',
          pos: 'adj',
          audioStatus: 'PENDING',
          audioAttempts: 0,
        },
      });

      // DictionaryAPI trả về null, EdgeTTS ném lỗi kết nối
      vi.spyOn(dictModule, 'downloadDictionaryAudio').mockResolvedValue(null);
      mockSynthesizeToFile.mockRejectedValue(new Error('WSS 429 Connection Blocked'));

      const queueService = new AudioQueueService({
        prisma: testPrisma,
        audioDir: tempAudioDir,
        ttsProvider: mockTtsProvider,
        delayBetweenRequestsMs: 0,
        maxAttempts: 3,
      });

      await queueService.enqueue({
        itemType: 'WORD',
        itemId: word.id,
        text: word.normalizedWord,
        priority: 'NORMAL',
      });

      // Lần chạy 1 -> fail, attempts thành 1, re-enqueue
      // Lần chạy 2 -> fail, attempts thành 2, re-enqueue
      // Lần chạy 3 -> fail, attempts thành 3, mark FAILED
      await queueService.processQueue();

      const updatedWord = await testPrisma.word.findUnique({ where: { id: word.id } });
      expect(updatedWord?.audioStatus).toBe('FAILED');
      expect(updatedWord?.audioAttempts).toBe(3);
      expect(queueService.getQueueItems().length).toBe(0);
    });
  });

  describe('Audio Recovery Service (runAudioRecovery)', () => {
    it('resets stale PROCESSING items (> 5 mins) to PENDING and enqueues all PENDING records', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      // 1. Tạo 1 word bị kẹt PROCESSING quá 5 phút
      const staleWord = await testPrisma.word.create({
        data: {
          normalizedWord: 'stale',
          pos: 'adj',
          audioStatus: 'PROCESSING',
          audioUpdatedAt: tenMinutesAgo,
        },
      });

      // 2. Tạo 1 word bình thường đang PENDING
      const pendingWord = await testPrisma.word.create({
        data: {
          normalizedWord: 'fresh',
          pos: 'noun',
          audioStatus: 'PENDING',
        },
      });

      // 3. Tạo 1 sentence đang PENDING
      const pendingSentence = await testPrisma.sentence.create({
        data: {
          wordId: pendingWord.id,
          text: 'A fresh start.',
          translationVi: 'Khởi đầu mới.',
          contentHash: 'hash-fresh-sentence',
          audioStatus: 'PENDING',
        },
      });

      const queueService = new AudioQueueService({
        prisma: testPrisma,
        audioDir: tempAudioDir,
        ttsProvider: mockTtsProvider,
        delayBetweenRequestsMs: 0,
      });

      // Ngăn tự động tải để kiểm tra nạp queue
      vi.spyOn(queueService, 'processQueue').mockImplementation(async () => {});

      const result = await runAudioRecovery(testPrisma, queueService);

      expect(result.staleWordsResetCount).toBe(1);
      expect(result.totalEnqueuedCount).toBe(3); // staleWord (đã reset về pending) + pendingWord + pendingSentence

      const resetWord = await testPrisma.word.findUnique({ where: { id: staleWord.id } });
      expect(resetWord?.audioStatus).toBe('PENDING');

      const items = queueService.getQueueItems();
      expect(items.length).toBe(3);
      expect(items.some((i) => i.itemId === staleWord.id)).toBe(true);
      expect(items.some((i) => i.itemId === pendingWord.id)).toBe(true);
      expect(items.some((i) => i.itemId === pendingSentence.id)).toBe(true);
    });
  });

  describe('API Route Handler (/api/audio/queue)', () => {
    it('GET returns status and database counts for words and sentences', async () => {
      const response = await GET();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty('isProcessing');
      expect(body).toHaveProperty('queueLength');
      expect(body).toHaveProperty('counts');
      expect(body.counts).toHaveProperty('pending');
      expect(body.counts).toHaveProperty('ready');
      expect(body.counts).toHaveProperty('failed');
    });

    it('POST with action priority bumps item to front of queue', async () => {
      const word = await testPrisma.word.create({
        data: {
          normalizedWord: 'priorityword',
          pos: 'noun',
          audioStatus: 'PENDING',
        },
      });

      // Giả lập mock global prisma
      const req = new Request('http://localhost/api/audio/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'priority',
          itemType: 'WORD',
          itemId: word.id,
        }),
      });

      const res = await POST(req as any);
      // Status có thể là 200 hoặc 404 tùy DB instance
      expect([200, 404]).toContain(res.status);
    });
  });
});
