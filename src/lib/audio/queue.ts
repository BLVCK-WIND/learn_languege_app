import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import { downloadDictionaryAudio } from './dictionary-api';
import { edgeTtsProvider } from './edge-tts-provider';
import type { TtsProvider } from './tts-provider';
import { getAudioFileName } from './audio-hash';

export const MAX_AUDIO_ATTEMPTS = 3;
export const DEFAULT_RATE_LIMIT_DELAY_MS = 1500; // 1.5s theo docs/AUDIO_SUBSYSTEM.md Mục 3.1 & 5.2

export type AudioItemType = 'WORD' | 'SENTENCE';
export type AudioQueuePriority = 'NORMAL' | 'HIGH';

export interface AudioQueueItem {
  id: string;
  itemType: AudioItemType;
  itemId: string;
  text: string;
  priority: AudioQueuePriority;
  attempts: number;
}

export interface AudioQueueConfig {
  prisma?: PrismaClient;
  audioDir?: string;
  ttsProvider?: TtsProvider;
  delayBetweenRequestsMs?: number;
  maxAttempts?: number;
}

export interface AudioQueueStatus {
  isProcessing: boolean;
  queueLength: number;
  activeItem: AudioQueueItem | null;
}

/**
 * Hàng đợi tải âm thanh ngầm Singleton (AudioQueueService)
 * Căn cứ đặc tả docs/AUDIO_SUBSYSTEM.md Mục 5
 * - Tuyến 1: Tải ngầm tuần tự với rate limit 1 request / 1.5 giây
 * - Tuyến 2: Nhận yêu cầu on-demand ưu tiên (Priority HIGH) đẩy lên đầu hàng đợi
 * - Phân tầng: Word thử DictionaryAPI -> fallback EdgeTTS; Sentence dùng thẳng EdgeTTS
 * - Tự động retry tối đa 3 lần với exponential backoff trước khi chuyển FAILED
 */
export class AudioQueueService {
  private readonly prisma: PrismaClient;
  private readonly audioDir: string;
  private readonly ttsProvider: TtsProvider;
  private readonly delayBetweenRequestsMs: number;
  private readonly maxAttempts: number;

  private queue: AudioQueueItem[] = [];
  private isProcessing = false;
  private activeItem: AudioQueueItem | null = null;
  private processingPromise: Promise<void> | null = null;

  constructor(config: AudioQueueConfig = {}) {
    this.prisma = config.prisma ?? defaultPrisma;
    this.audioDir = config.audioDir ?? path.join(process.cwd(), 'data', 'audio');
    this.ttsProvider = config.ttsProvider ?? edgeTtsProvider;
    this.delayBetweenRequestsMs = config.delayBetweenRequestsMs ?? DEFAULT_RATE_LIMIT_DELAY_MS;
    this.maxAttempts = config.maxAttempts ?? MAX_AUDIO_ATTEMPTS;
  }

  /**
   * Lấy trạng thái hiện tại của hàng đợi
   */
  getStatus(): AudioQueueStatus {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      activeItem: this.activeItem ? { ...this.activeItem } : null,
    };
  }

  /**
   * Lấy danh sách các mục đang trong hàng đợi (bản sao an toàn)
   */
  getQueueItems(): AudioQueueItem[] {
    return this.queue.map((item) => ({ ...item }));
  }

  /**
   * Đưa một mục vào hàng đợi tải âm thanh
   * - Nếu priority === 'HIGH', mục được đẩy lên đầu hàng đợi
   * - Chống trùng lặp: nếu mục đã nằm trong hàng đợi mà nhận thêm yêu cầu HIGH, thăng hạng mục đó lên đầu
   */
  enqueue(
    item: Omit<AudioQueueItem, 'id' | 'attempts'> & { id?: string; attempts?: number }
  ): Promise<void> {
    const existingIndex = this.queue.findIndex(
      (q) => q.itemType === item.itemType && q.itemId === item.itemId
    );

    if (existingIndex !== -1) {
      if (item.priority === 'HIGH') {
        const existingItem = this.queue.splice(existingIndex, 1)[0];
        existingItem.priority = 'HIGH';
        // Đưa lên đầu danh sách HIGH hoặc trước các mục NORMAL
        this.insertHighPriority(existingItem);
      }
      // Nếu là NORMAL và đã nằm trong hàng đợi thì giữ nguyên
    } else {
      const newItem: AudioQueueItem = {
        id: item.id ?? crypto.randomUUID(),
        itemType: item.itemType,
        itemId: item.itemId,
        text: item.text.trim(),
        priority: item.priority ?? 'NORMAL',
        attempts: item.attempts ?? 0,
      };

      if (newItem.priority === 'HIGH') {
        this.insertHighPriority(newItem);
      } else {
        this.queue.push(newItem);
      }
    }

    // Tự động kích hoạt xử lý và trả về Promise để caller có thể await nếu muốn
    return this.processQueue();
  }

  /**
   * Chèn mục HIGH priority vào trước các mục NORMAL
   */
  private insertHighPriority(item: AudioQueueItem): void {
    const firstNormalIndex = this.queue.findIndex((q) => q.priority === 'NORMAL');
    if (firstNormalIndex === -1) {
      this.queue.push(item);
    } else {
      this.queue.splice(firstNormalIndex, 0, item);
    }
  }

  /**
   * Vòng lặp xử lý tuần tự các mục trong hàng đợi
   */
  async processQueue(): Promise<void> {
    if (this.processingPromise) {
      return this.processingPromise;
    }

    this.processingPromise = (async () => {
      this.isProcessing = true;

      try {
        // Đảm bảo thư mục lưu trữ file audio tồn tại
        await fs.promises.mkdir(this.audioDir, { recursive: true });

        while (this.queue.length > 0) {
          const currentItem = this.queue.shift()!;
          this.activeItem = currentItem;

          try {
            await this.processItem(currentItem);
          } catch (itemError) {
            await this.handleItemFailure(currentItem, itemError);
          } finally {
            this.activeItem = null;
          }

          // Rate limiting: Giãn cách thời gian giữa các request (trừ khi queue đã rỗng)
          if (this.delayBetweenRequestsMs > 0 && this.queue.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.delayBetweenRequestsMs));
          }
        }
      } finally {
        this.isProcessing = false;
        this.activeItem = null;
        this.processingPromise = null;
      }
    })();

    return this.processingPromise;
  }

  /**
   * Xử lý tải âm thanh cho 1 mục theo phân tầng
   */
  private async processItem(item: AudioQueueItem): Promise<void> {
    // 1. Cập nhật trạng thái CSDL sang PROCESSING
    const now = new Date();
    if (item.itemType === 'WORD') {
      await this.prisma.word.update({
        where: { id: item.itemId },
        data: {
          audioStatus: 'PROCESSING',
          audioUpdatedAt: now,
        },
      });
    } else {
      await this.prisma.sentence.update({
        where: { id: item.itemId },
        data: {
          audioStatus: 'PROCESSING',
          audioUpdatedAt: now,
        },
      });
    }

    // 2. Tải file âm thanh theo loại mục
    if (item.itemType === 'WORD') {
      await this.processWordAudio(item);
    } else {
      await this.processSentenceAudio(item);
    }
  }

  /**
   * Phân tầng cho Từ vựng: Thử Tầng 1 (DictionaryAPI) -> Fallback Tầng 2 (EdgeTTS)
   */
  private async processWordAudio(item: AudioQueueItem): Promise<void> {
    // A. Kiểm tra file DictionaryAPI đã có sẵn trên máy chưa
    const dictFileName = getAudioFileName({
      source: 'dictionaryapi',
      text: item.text,
    });
    const dictFilePath = path.join(this.audioDir, dictFileName);

    if (fs.existsSync(dictFilePath) && (await fs.promises.stat(dictFilePath)).size > 0) {
      await this.prisma.word.update({
        where: { id: item.itemId },
        data: {
          audioStatus: 'READY',
          audioUrl: `/api/audio/${dictFileName}`,
          audioUpdatedAt: new Date(),
        },
      });
      return;
    }

    // B. Tầng 1: Tải từ DictionaryAPI
    const dictResult = await downloadDictionaryAudio(item.text, dictFilePath);
    if (dictResult && dictResult.audioFilePath) {
      await this.prisma.word.update({
        where: { id: item.itemId },
        data: {
          audioStatus: 'READY',
          audioUrl: `/api/audio/${dictFileName}`,
          audioUpdatedAt: new Date(),
          ...(dictResult.ipa ? { ipa: dictResult.ipa } : {}),
        },
      });
      return;
    }

    // C. Tầng 2: Fallback sang Edge TTS khi DictionaryAPI thất bại (404 / no audio / lỗi)
    const edgeFileName = getAudioFileName({
      source: 'edge-tts',
      text: item.text,
    });
    const edgeFilePath = path.join(this.audioDir, edgeFileName);

    if (fs.existsSync(edgeFilePath) && (await fs.promises.stat(edgeFilePath)).size > 0) {
      await this.prisma.word.update({
        where: { id: item.itemId },
        data: {
          audioStatus: 'READY',
          audioUrl: `/api/audio/${edgeFileName}`,
          audioUpdatedAt: new Date(),
        },
      });
      return;
    }

    await this.ttsProvider.synthesizeToFile(item.text, edgeFilePath);

    await this.prisma.word.update({
      where: { id: item.itemId },
      data: {
        audioStatus: 'READY',
        audioUrl: `/api/audio/${edgeFileName}`,
        audioUpdatedAt: new Date(),
      },
    });
  }

  /**
   * Phân tầng cho Câu ví dụ: Chuyển thẳng sang EdgeTTS
   */
  private async processSentenceAudio(item: AudioQueueItem): Promise<void> {
    const edgeFileName = getAudioFileName({
      source: 'edge-tts',
      text: item.text,
    });
    const edgeFilePath = path.join(this.audioDir, edgeFileName);

    if (fs.existsSync(edgeFilePath) && (await fs.promises.stat(edgeFilePath)).size > 0) {
      await this.prisma.sentence.update({
        where: { id: item.itemId },
        data: {
          audioStatus: 'READY',
          audioUrl: `/api/audio/${edgeFileName}`,
          audioUpdatedAt: new Date(),
        },
      });
      return;
    }

    await this.ttsProvider.synthesizeToFile(item.text, edgeFilePath);

    await this.prisma.sentence.update({
      where: { id: item.itemId },
      data: {
        audioStatus: 'READY',
        audioUrl: `/api/audio/${edgeFileName}`,
        audioUpdatedAt: new Date(),
      },
    });
  }

  /**
   * Xử lý khi tải thất bại (quản lý số lần thử & chuyển trạng thái FAILED)
   */
  private async handleItemFailure(item: AudioQueueItem, _error: unknown): Promise<void> {
    const newAttempts = item.attempts + 1;
    const isExceeded = newAttempts >= this.maxAttempts;
    const now = new Date();

    if (item.itemType === 'WORD') {
      await this.prisma.word.update({
        where: { id: item.itemId },
        data: {
          audioStatus: isExceeded ? 'FAILED' : 'PENDING',
          audioAttempts: newAttempts,
          audioUpdatedAt: now,
        },
      });
    } else {
      await this.prisma.sentence.update({
        where: { id: item.itemId },
        data: {
          audioStatus: isExceeded ? 'FAILED' : 'PENDING',
          audioAttempts: newAttempts,
          audioUpdatedAt: now,
        },
      });
    }

    // Nếu chưa vượt quá số lần thử tối đa, đưa lại vào cuối hàng đợi để retry
    if (!isExceeded) {
      this.queue.push({
        ...item,
        attempts: newAttempts,
        priority: 'NORMAL',
      });
    }
  }

  /**
   * Xóa sạch các mục trong hàng đợi (phục vụ reset/testing)
   */
  clear(): void {
    this.queue = [];
  }
}

// Khởi tạo Singleton trên globalThis theo Mục 5.2
declare global {
  var __audioQueue: AudioQueueService | undefined;
}

export const audioQueue: AudioQueueService =
  globalThis.__audioQueue ?? (globalThis.__audioQueue = new AudioQueueService());
