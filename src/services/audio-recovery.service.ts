import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/prisma';
import { audioQueue as defaultQueue, type AudioQueueService } from '../lib/audio/queue';

export const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000; // 5 phút theo docs/AUDIO_SUBSYSTEM.md Mục 5.3

export interface AudioRecoveryResult {
  staleWordsResetCount: number;
  staleSentencesResetCount: number;
  enqueuedWordsCount: number;
  enqueuedSentencesCount: number;
  totalEnqueuedCount: number;
}

/**
 * Quét phục hồi âm thanh khi khởi động ứng dụng
 * Căn cứ đặc tả docs/AUDIO_SUBSYSTEM.md Mục 5.3
 * 1. Quét các bản ghi bị kẹt ở trạng thái PROCESSING quá 5 phút và đặt lại thành PENDING
 * 2. Nạp lại toàn bộ các bản ghi PENDING (chưa bị xóa mềm) vào audioQueue
 */
export async function runAudioRecovery(
  prisma: PrismaClient = defaultPrisma,
  queue: AudioQueueService = defaultQueue
): Promise<AudioRecoveryResult> {
  const staleThresholdDate = new Date(Date.now() - STALE_PROCESSING_THRESHOLD_MS);
  const now = new Date();

  // 1. Quét các bản ghi kẹt ở PROCESSING quá 5 phút -> đặt lại thành PENDING
  const staleWordsResult = await prisma.word.updateMany({
    where: {
      audioStatus: 'PROCESSING',
      audioUpdatedAt: { lt: staleThresholdDate },
      deletedAt: null,
    },
    data: {
      audioStatus: 'PENDING',
      audioUpdatedAt: now,
    },
  });

  const staleSentencesResult = await prisma.sentence.updateMany({
    where: {
      audioStatus: 'PROCESSING',
      audioUpdatedAt: { lt: staleThresholdDate },
      deletedAt: null,
    },
    data: {
      audioStatus: 'PENDING',
      audioUpdatedAt: now,
    },
  });

  // 2. Tìm tất cả các bản ghi có audioStatus === 'PENDING'
  const pendingWords = await prisma.word.findMany({
    where: {
      audioStatus: 'PENDING',
      deletedAt: null,
    },
    select: {
      id: true,
      normalizedWord: true,
      audioAttempts: true,
    },
  });

  const pendingSentences = await prisma.sentence.findMany({
    where: {
      audioStatus: 'PENDING',
      deletedAt: null,
    },
    select: {
      id: true,
      text: true,
      audioAttempts: true,
    },
  });

  // 3. Đẩy toàn bộ vào audioQueue để tải ngầm
  for (const w of pendingWords) {
    queue.enqueue({
      itemType: 'WORD',
      itemId: w.id,
      text: w.normalizedWord,
      priority: 'NORMAL',
      attempts: w.audioAttempts,
    });
  }

  for (const s of pendingSentences) {
    queue.enqueue({
      itemType: 'SENTENCE',
      itemId: s.id,
      text: s.text,
      priority: 'NORMAL',
      attempts: s.audioAttempts,
    });
  }

  return {
    staleWordsResetCount: staleWordsResult.count,
    staleSentencesResetCount: staleSentencesResult.count,
    enqueuedWordsCount: pendingWords.length,
    enqueuedSentencesCount: pendingSentences.length,
    totalEnqueuedCount: pendingWords.length + pendingSentences.length,
  };
}
