import { z } from 'zod';

export const SUPPORTED_SCHEMA_VERSION = 1;

// 10 Part of Speech (POS) values
export const PosEnum = z.enum([
  'noun',
  'verb',
  'adj',
  'adv',
  'phrase',
  'preposition',
  'conjunction',
  'pronoun',
  'determiner',
  'interjection',
]);
export type PosType = z.infer<typeof PosEnum>;

// 13 Standard Mistake Category Codes (kebab-case)
export const MistakeCategoryEnum = z.enum([
  'plural-s',
  'subject-verb-agreement',
  'tense',
  'spelling',
  'article',
  'word-order',
  'preposition',
  'verb-pattern',
  'possessive',
  'sentence-structure',
  'capitalization-punctuation',
  'word-choice',
  'other',
]);
export type MistakeCategoryType = z.infer<typeof MistakeCategoryEnum>;

export const MISTAKE_CATEGORY_LABELS: Record<MistakeCategoryType, string> = {
  'plural-s': "Lỗi thiếu/thừa 's' số nhiều",
  'subject-verb-agreement': 'Hòa hợp chủ vị',
  tense: 'Sai thì động từ',
  spelling: 'Lỗi chính tả từ vựng',
  article: 'Mạo từ (a, an, the)',
  'word-order': 'Trật tự từ trong câu',
  preposition: 'Giới từ',
  'verb-pattern': 'Dạng của động từ',
  possessive: 'Lỗi sở hữu cách',
  'sentence-structure': 'Cấu trúc câu thiếu thành phần',
  'capitalization-punctuation': 'Viết hoa & Dấu câu',
  'word-choice': 'Dùng từ chưa chuẩn xác',
  other: 'Lỗi khác',
};

// Sentence Import Schema
export const SentenceImportSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Câu ví dụ không được để trống')
    .max(300, 'Câu ví dụ tối đa 300 ký tự'),
  translationVi: z
    .string()
    .trim()
    .min(1, 'Nghĩa tiếng Việt không được để trống')
    .max(300, 'Nghĩa tiếng Việt tối đa 300 ký tự'),
  targetForm: z.string().trim().min(1).max(100).optional(),
});
export type SentenceImport = z.infer<typeof SentenceImportSchema>;

// Word Import Schema
export const WordImportSchema = z.object({
  word: z
    .string()
    .trim()
    .min(1, 'Từ vựng không được để trống')
    .max(100, 'Từ vựng tối đa 100 ký tự'),
  pos: PosEnum,
  ipa: z.string().trim().max(100).optional(),
  meanings: z
    .array(z.string().trim().min(1).max(200, 'Mỗi nghĩa tối đa 200 ký tự'))
    .min(1, 'Phải có ít nhất 1 nghĩa')
    .max(10, 'Tối đa 10 nghĩa mỗi từ'),
  sentences: z
    .array(SentenceImportSchema)
    .min(1, 'Phải có ít nhất 1 câu ví dụ')
    .max(10, 'Tối đa 10 câu ví dụ mỗi từ'),
});
export type WordImport = z.infer<typeof WordImportSchema>;

// Mistake First-pass Schema (accepts free string category to discover unknown codes)
export const MistakeImportFirstPassSchema = z.object({
  wrong: z
    .string()
    .trim()
    .min(1, 'Câu sai không được để trống')
    .max(300, 'Câu sai tối đa 300 ký tự'),
  correct: z
    .string()
    .trim()
    .min(1, 'Câu đúng không được để trống')
    .max(300, 'Câu đúng tối đa 300 ký tự'),
  category: z.string().trim().min(1, 'Mã lỗi không được để trống').max(50),
  subCategory: z.string().trim().max(100).optional(),
  explanationVi: z
    .string()
    .trim()
    .min(1, 'Giải thích không được để trống')
    .max(500, 'Giải thích tối đa 500 ký tự'),
});
export type MistakeImportFirstPass = z.infer<typeof MistakeImportFirstPassSchema>;

// Mistake Strict Schema (Second-pass validation)
export const MistakeImportStrictSchema = z
  .object({
    wrong: z
      .string()
      .trim()
      .min(1, 'Câu sai không được để trống')
      .max(300, 'Câu sai tối đa 300 ký tự'),
    correct: z
      .string()
      .trim()
      .min(1, 'Câu đúng không được để trống')
      .max(300, 'Câu đúng tối đa 300 ký tự'),
    category: MistakeCategoryEnum,
    subCategory: z.string().trim().max(100).optional(),
    explanationVi: z
      .string()
      .trim()
      .min(1, 'Giải thích không được để trống')
      .max(500, 'Giải thích tối đa 500 ký tự'),
  })
  .refine(
    (data) => {
      if (data.category === 'other') {
        return !!data.subCategory && data.subCategory.trim().length > 0;
      }
      return true;
    },
    {
      message: "Khi mã danh mục lỗi là 'other', bắt buộc phải cung cấp 'subCategory'",
      path: ['subCategory'],
    }
  );
export type MistakeImportStrict = z.infer<typeof MistakeImportStrictSchema>;

// Session Context Schema
export const SessionContextSchema = z.object({
  week: z.number().int().min(1, 'Tuần học phải >= 1'),
  day: z.number().int().min(1).max(7, 'Ngày trong tuần từ 1 đến 7'),
  seq: z.number().int().min(1).default(1),
  studiedAt: z
    .string()
    .datetime({ message: 'Thời điểm studiedAt phải đúng định dạng ISO-8601 UTC' })
    .optional(),
  checkpoint: z
    .string()
    .trim()
    .min(1, 'Checkpoint không được để trống')
    .max(200, 'Checkpoint tối đa 200 ký tự'),
});
export type SessionContext = z.infer<typeof SessionContextSchema>;

// Daily Session Payload Schema (First-pass)
export const DailySessionPayloadFirstPassSchema = z.object({
  schemaVersion: z.literal(SUPPORTED_SCHEMA_VERSION, {
    error: `Phiên bản schemaVersion không được hỗ trợ. Ứng dụng hiện chỉ hỗ trợ phiên bản ${SUPPORTED_SCHEMA_VERSION}.`,
  }),
  session: SessionContextSchema,
  words: z.array(WordImportSchema).max(50, 'Mỗi buổi học tối đa 50 từ vựng'),
  mistakes: z.array(MistakeImportFirstPassSchema).max(50, 'Mỗi buổi học tối đa 50 câu sai'),
});
export type DailySessionPayloadFirstPass = z.infer<typeof DailySessionPayloadFirstPassSchema>;

// Daily Session Payload Schema (Strict)
export const DailySessionPayloadStrictSchema = z.object({
  schemaVersion: z.literal(SUPPORTED_SCHEMA_VERSION),
  session: SessionContextSchema,
  words: z.array(WordImportSchema).max(50),
  mistakes: z.array(MistakeImportStrictSchema).max(50),
});
export type DailySessionPayloadStrict = z.infer<typeof DailySessionPayloadStrictSchema>;

// DTO Interfaces
export interface DryRunOptions {
  overrideSeq?: number;
}

export interface ImportCommitOptions {
  categoryMappings?: Record<string, string>; // e.g. { "wrong-verb-form": "verb-pattern" }
  overrideSeq?: number;
  mergeMode?: 'APPEND' | 'NEW_SESSION';
}

export interface DryRunReport {
  isValid: boolean;
  requiresUserAction: boolean;
  isSkipped?: boolean;
  sessionConflict?: {
    existingSessionId: string;
    suggestedSeq: number;
  };
  summary: {
    addedWordsCount: number;
    mergedWordsCount: number;
    newSentencesCount: number;
    addedMistakesCount: number;
    skippedMistakesCount: number;
    reappearedMistakesCount: number;
    warningCount: number;
    errorCount: number;
  };
  warnings: Array<{ path: string; message: string }>;
  errors?: Array<{ path: string; message: string }>;
  pendingMappings: Array<{
    itemIndex: number;
    wrongText: string;
    unknownCategory: string;
    suggestedOptions: Array<{ code: string; label: string }>;
  }>;
}

export interface ImportResult {
  importBatchId: string;
  sessionId: string;
  status: 'SUCCESS' | 'SKIPPED';
  stats: {
    wordsCreated: number;
    wordsMerged: number;
    sentencesCreated: number;
    mistakesCreated: number;
    sessionItemsCreated: number;
    reviewStatesCreated: number;
  };
}

export interface ImportService {
  dryRunImport(rawPayload: string, options?: DryRunOptions): Promise<DryRunReport>;
  commitImport(rawPayload: string, options?: ImportCommitOptions): Promise<ImportResult>;
}
