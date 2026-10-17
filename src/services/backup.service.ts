import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import {
  BACKUP_SCHEMA_VERSION,
  FullDatabaseBackupSchema,
  type FullDatabaseBackupJSON,
  type BackupRestoreSummary,
} from '@/types/backup';

function parseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseRequiredDate(val: unknown, fallback: Date = new Date()): Date {
  return parseDate(val) || fallback;
}

export class DefaultBackupService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Xuất toàn bộ CSDL 11 bảng ra đối tượng JSON sao lưu toàn vẹn (Full Backup)
   * bảo toàn 100% CUID2 và các quan hệ đa hình.
   */
  async exportDatabaseToJson(now: Date = new Date()): Promise<FullDatabaseBackupJSON> {
    const [
      importBatches,
      studyQuotaConfigs,
      sessions,
      sessionItems,
      words,
      wordMeanings,
      sentences,
      mistakes,
      reviewStates,
      reviewLogs,
      reviewSessions,
    ] = await Promise.all([
      this.prisma.importBatch.findMany(),
      this.prisma.studyQuotaConfig.findMany(),
      this.prisma.session.findMany(),
      this.prisma.sessionItem.findMany(),
      this.prisma.word.findMany(),
      this.prisma.wordMeaning.findMany(),
      this.prisma.sentence.findMany(),
      this.prisma.mistake.findMany(),
      this.prisma.reviewState.findMany(),
      this.prisma.reviewLog.findMany(),
      this.prisma.reviewSession.findMany(),
    ]);

    return {
      version: BACKUP_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      data: {
        importBatches: importBatches as unknown as Array<Record<string, unknown>>,
        studyQuotaConfigs: studyQuotaConfigs as unknown as Array<Record<string, unknown>>,
        sessions: sessions as unknown as Array<Record<string, unknown>>,
        sessionItems: sessionItems as unknown as Array<Record<string, unknown>>,
        words: words as unknown as Array<Record<string, unknown>>,
        wordMeanings: wordMeanings as unknown as Array<Record<string, unknown>>,
        sentences: sentences as unknown as Array<Record<string, unknown>>,
        mistakes: mistakes as unknown as Array<Record<string, unknown>>,
        reviewStates: reviewStates as unknown as Array<Record<string, unknown>>,
        reviewLogs: reviewLogs as unknown as Array<Record<string, unknown>>,
        reviewSessions: reviewSessions as unknown as Array<Record<string, unknown>>,
      },
    };
  }

  /**
   * Khôi phục CSDL từ JSON trong duy nhất 1 transaction:
   * 1. Xóa sạch dữ liệu cũ theo đúng thứ tự khóa ngoại ngược
   * 2. Nạp lại dữ liệu nguyên vẹn bảo toàn CUID2 gốc
   */
  async restoreDatabaseFromJson(
    payload: string | unknown
  ): Promise<BackupRestoreSummary> {
    let parsedObj: unknown;
    if (typeof payload === 'string') {
      try {
        parsedObj = JSON.parse(payload);
      } catch (err) {
        throw new Error(
          `Chuỗi JSON sao lưu không hợp lệ: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      parsedObj = payload;
    }

    const validation = FullDatabaseBackupSchema.safeParse(parsedObj);
    if (!validation.success) {
      throw new Error(
        `Dữ liệu sao lưu không đúng quy chuẩn (Validation Error): ${validation.error.message}`
      );
    }

    const backup = validation.data;
    const { data } = backup;

    return this.prisma.$transaction(async (tx) => {
      // 1. Xóa sạch theo thứ tự quan hệ ngược
      await tx.reviewLog.deleteMany();
      await tx.reviewSession.deleteMany();
      await tx.reviewState.deleteMany();
      await tx.sessionItem.deleteMany();
      await tx.sentence.deleteMany();
      await tx.wordMeaning.deleteMany();
      await tx.word.deleteMany();
      await tx.mistake.deleteMany();
      await tx.session.deleteMany();
      await tx.importBatch.deleteMany();
      await tx.studyQuotaConfig.deleteMany();

      // 2. Chèn lại dữ liệu bảo toàn CUID2 gốc và chuyển đổi DateTime an toàn

      // StudyQuotaConfigs
      if (data.studyQuotaConfigs.length > 0) {
        await tx.studyQuotaConfig.createMany({
          data: data.studyQuotaConfigs.map((item: any) => ({
            id: String(item.id),
            maxNewWordsPerDay: Number(item.maxNewWordsPerDay ?? 10),
            maxNewMistakesPerDay: Number(item.maxNewMistakesPerDay ?? 5),
            maxReviewWordsPerDay: Number(item.maxReviewWordsPerDay ?? 50),
            maxReviewMistakesPerDay: Number(item.maxReviewMistakesPerDay ?? 30),
            updatedAt: parseRequiredDate(item.updatedAt),
          })),
        });
      }

      // ImportBatches
      if (data.importBatches.length > 0) {
        await tx.importBatch.createMany({
          data: data.importBatches.map((item: any) => ({
            id: String(item.id),
            sessionWeek: Number(item.sessionWeek),
            sessionDay: Number(item.sessionDay),
            seq: Number(item.seq),
            contentHash: String(item.contentHash),
            rawPayload: String(item.rawPayload),
            remappingJson: item.remappingJson ? String(item.remappingJson) : null,
            status: String(item.status),
            importedAt: parseRequiredDate(item.importedAt),
          })),
        });
      }

      // Sessions
      if (data.sessions.length > 0) {
        await tx.session.createMany({
          data: data.sessions.map((item: any) => ({
            id: String(item.id),
            importBatchId: item.importBatchId ? String(item.importBatchId) : null,
            week: Number(item.week),
            day: Number(item.day),
            seq: Number(item.seq ?? 1),
            checkpoint: String(item.checkpoint),
            studiedAt: parseRequiredDate(item.studiedAt),
            createdAt: parseRequiredDate(item.createdAt),
          })),
        });
      }

      // Words
      if (data.words.length > 0) {
        await tx.word.createMany({
          data: data.words.map((item: any) => ({
            id: String(item.id),
            normalizedWord: String(item.normalizedWord),
            pos: String(item.pos),
            ipa: item.ipa ? String(item.ipa) : null,
            audioUrl: item.audioUrl ? String(item.audioUrl) : null,
            audioStatus: String(item.audioStatus ?? 'PENDING'),
            audioUpdatedAt: parseDate(item.audioUpdatedAt),
            audioAttempts: Number(item.audioAttempts ?? 0),
            createdAt: parseRequiredDate(item.createdAt),
            updatedAt: parseRequiredDate(item.updatedAt),
            deletedAt: parseDate(item.deletedAt),
          })),
        });
      }

      // WordMeanings
      if (data.wordMeanings.length > 0) {
        await tx.wordMeaning.createMany({
          data: data.wordMeanings.map((item: any) => ({
            id: String(item.id),
            wordId: String(item.wordId),
            meaningVi: String(item.meaningVi),
            context: item.context ? String(item.context) : null,
            createdAt: parseRequiredDate(item.createdAt),
            deletedAt: parseDate(item.deletedAt),
          })),
        });
      }

      // Sentences
      if (data.sentences.length > 0) {
        await tx.sentence.createMany({
          data: data.sentences.map((item: any) => ({
            id: String(item.id),
            wordId: String(item.wordId),
            text: String(item.text),
            targetForm: item.targetForm ? String(item.targetForm) : null,
            translationVi: String(item.translationVi),
            audioUrl: item.audioUrl ? String(item.audioUrl) : null,
            audioStatus: String(item.audioStatus ?? 'PENDING'),
            audioUpdatedAt: parseDate(item.audioUpdatedAt),
            audioAttempts: Number(item.audioAttempts ?? 0),
            contentHash: String(item.contentHash),
            createdAt: parseRequiredDate(item.createdAt),
            deletedAt: parseDate(item.deletedAt),
          })),
        });
      }

      // Mistakes
      if (data.mistakes.length > 0) {
        await tx.mistake.createMany({
          data: data.mistakes.map((item: any) => ({
            id: String(item.id),
            wrong: String(item.wrong),
            correct: String(item.correct),
            category: String(item.category),
            subCategory: item.subCategory ? String(item.subCategory) : null,
            explanationVi: String(item.explanationVi),
            contentHash: String(item.contentHash),
            createdAt: parseRequiredDate(item.createdAt),
            updatedAt: parseRequiredDate(item.updatedAt),
            deletedAt: parseDate(item.deletedAt),
          })),
        });
      }

      // SessionItems
      if (data.sessionItems.length > 0) {
        await tx.sessionItem.createMany({
          data: data.sessionItems.map((item: any) => ({
            id: String(item.id),
            sessionId: String(item.sessionId),
            itemType: String(item.itemType),
            itemId: String(item.itemId),
            role: String(item.role),
            createdAt: parseRequiredDate(item.createdAt),
          })),
        });
      }

      // ReviewStates
      if (data.reviewStates.length > 0) {
        await tx.reviewState.createMany({
          data: data.reviewStates.map((item: any) => ({
            id: String(item.id),
            itemType: String(item.itemType),
            itemId: String(item.itemId),
            interval: Number(item.interval ?? 0),
            easeFactor: Number(item.easeFactor ?? 2.5),
            dueDate: String(item.dueDate),
            repetitions: Number(item.repetitions ?? 0),
            lapseCount: Number(item.lapseCount ?? 0),
            lastReviewedAt: parseDate(item.lastReviewedAt),
            createdAt: parseRequiredDate(item.createdAt),
            updatedAt: parseRequiredDate(item.updatedAt),
          })),
        });
      }

      // ReviewLogs
      if (data.reviewLogs.length > 0) {
        await tx.reviewLog.createMany({
          data: data.reviewLogs.map((item: any) => ({
            id: String(item.id),
            reviewStateId: String(item.reviewStateId),
            rating: String(item.rating),
            intervalBefore: Number(item.intervalBefore),
            intervalAfter: Number(item.intervalAfter),
            easeFactorBefore: Number(item.easeFactorBefore),
            easeFactorAfter: Number(item.easeFactorAfter),
            reviewDurationMs: Number(item.reviewDurationMs ?? 0),
            reviewedAt: parseRequiredDate(item.reviewedAt),
          })),
        });
      }

      // ReviewSessions
      if (data.reviewSessions.length > 0) {
        await tx.reviewSession.createMany({
          data: data.reviewSessions.map((item: any) => ({
            id: String(item.id),
            sessionDate: String(item.sessionDate),
            queueJson: String(item.queueJson),
            status: String(item.status),
            currentIndex: Number(item.currentIndex ?? 0),
            completedCount: Number(item.completedCount ?? 0),
            startedAt: parseRequiredDate(item.startedAt),
            updatedAt: parseRequiredDate(item.updatedAt),
          })),
        });
      }

      const totalRestored =
        data.importBatches.length +
        data.studyQuotaConfigs.length +
        data.sessions.length +
        data.sessionItems.length +
        data.words.length +
        data.wordMeanings.length +
        data.sentences.length +
        data.mistakes.length +
        data.reviewStates.length +
        data.reviewLogs.length +
        data.reviewSessions.length;

      return {
        importBatchesCount: data.importBatches.length,
        studyQuotaConfigsCount: data.studyQuotaConfigs.length,
        sessionsCount: data.sessions.length,
        sessionItemsCount: data.sessionItems.length,
        wordsCount: data.words.length,
        wordMeaningsCount: data.wordMeanings.length,
        sentencesCount: data.sentences.length,
        mistakesCount: data.mistakes.length,
        reviewStatesCount: data.reviewStates.length,
        reviewLogsCount: data.reviewLogs.length,
        reviewSessionsCount: data.reviewSessions.length,
        totalRecordsRestored: totalRestored,
      };
    });
  }
}

export const backupService = new DefaultBackupService();
