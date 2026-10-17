import { z } from 'zod';

export const BACKUP_SCHEMA_VERSION = 1;

export interface FullDatabaseBackupData {
  importBatches: Array<Record<string, unknown>>;
  studyQuotaConfigs: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  sessionItems: Array<Record<string, unknown>>;
  words: Array<Record<string, unknown>>;
  wordMeanings: Array<Record<string, unknown>>;
  sentences: Array<Record<string, unknown>>;
  mistakes: Array<Record<string, unknown>>;
  reviewStates: Array<Record<string, unknown>>;
  reviewLogs: Array<Record<string, unknown>>;
  reviewSessions: Array<Record<string, unknown>>;
}

export interface FullDatabaseBackupJSON {
  version: number;
  exportedAt: string;
  data: FullDatabaseBackupData;
}

export interface BackupRestoreSummary {
  importBatchesCount: number;
  studyQuotaConfigsCount: number;
  sessionsCount: number;
  sessionItemsCount: number;
  wordsCount: number;
  wordMeaningsCount: number;
  sentencesCount: number;
  mistakesCount: number;
  reviewStatesCount: number;
  reviewLogsCount: number;
  reviewSessionsCount: number;
  totalRecordsRestored: number;
}

export const FullDatabaseBackupSchema = z.object({
  version: z.number().int().min(1),
  exportedAt: z.string(),
  data: z.object({
    importBatches: z.array(z.record(z.string(), z.unknown())),
    studyQuotaConfigs: z.array(z.record(z.string(), z.unknown())),
    sessions: z.array(z.record(z.string(), z.unknown())),
    sessionItems: z.array(z.record(z.string(), z.unknown())),
    words: z.array(z.record(z.string(), z.unknown())),
    wordMeanings: z.array(z.record(z.string(), z.unknown())),
    sentences: z.array(z.record(z.string(), z.unknown())),
    mistakes: z.array(z.record(z.string(), z.unknown())),
    reviewStates: z.array(z.record(z.string(), z.unknown())),
    reviewLogs: z.array(z.record(z.string(), z.unknown())),
    reviewSessions: z.array(z.record(z.string(), z.unknown())),
  }),
});
