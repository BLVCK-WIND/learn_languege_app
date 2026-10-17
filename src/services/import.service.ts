import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import {
  SUPPORTED_SCHEMA_VERSION,
  MistakeCategoryEnum,
  MISTAKE_CATEGORY_LABELS,
  DailySessionPayloadFirstPassSchema,
  DailySessionPayloadStrictSchema,
  type DryRunOptions,
  type ImportCommitOptions,
  type DryRunReport,
  type ImportResult,
  type ImportService,
} from '@/types/import';
import { hashPayload, hashSentence, hashMistake, normalizeText } from '@/lib/crypto/hash';
import { getStudyDate } from '@/lib/study-day';

/**
 * Phát hiện các trường lạ (Unknown Fields) không nằm trong quy chuẩn schema
 */
export function detectUnknownFields(
  raw: unknown
): Array<{ path: string; message: string }> {
  const warnings: Array<{ path: string; message: string }> = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return warnings;
  }

  const rootObj = raw as Record<string, unknown>;
  const knownRootKeys = new Set(['schemaVersion', 'session', 'words', 'mistakes']);
  for (const key of Object.keys(rootObj)) {
    if (!knownRootKeys.has(key)) {
      warnings.push({
        path: `/${key}`,
        message: `Trường '${key}' không nằm trong quy chuẩn và đã được lược bỏ.`,
      });
    }
  }

  if (rootObj.session && typeof rootObj.session === 'object' && !Array.isArray(rootObj.session)) {
    const sessionObj = rootObj.session as Record<string, unknown>;
    const knownSessionKeys = new Set(['week', 'day', 'seq', 'studiedAt', 'checkpoint']);
    for (const key of Object.keys(sessionObj)) {
      if (!knownSessionKeys.has(key)) {
        warnings.push({
          path: `/session/${key}`,
          message: `Trường '${key}' tại session không nằm trong quy chuẩn và đã được lược bỏ.`,
        });
      }
    }
  }

  if (Array.isArray(rootObj.words)) {
    const knownWordKeys = new Set(['word', 'pos', 'ipa', 'meanings', 'sentences']);
    const knownSentenceKeys = new Set(['text', 'translationVi', 'targetForm']);

    rootObj.words.forEach((wordItem, wordIdx) => {
      if (wordItem && typeof wordItem === 'object' && !Array.isArray(wordItem)) {
        const wordObj = wordItem as Record<string, unknown>;
        for (const key of Object.keys(wordObj)) {
          if (!knownWordKeys.has(key)) {
            warnings.push({
              path: `/words/${wordIdx}/${key}`,
              message: `Trường '${key}' tại words[${wordIdx}] không nằm trong quy chuẩn và đã được lược bỏ.`,
            });
          }
        }

        if (Array.isArray(wordObj.sentences)) {
          wordObj.sentences.forEach((sentItem, sentIdx) => {
            if (sentItem && typeof sentItem === 'object' && !Array.isArray(sentItem)) {
              const sentObj = sentItem as Record<string, unknown>;
              for (const key of Object.keys(sentObj)) {
                if (!knownSentenceKeys.has(key)) {
                  warnings.push({
                    path: `/words/${wordIdx}/sentences/${sentIdx}/${key}`,
                    message: `Trường '${key}' tại câu ví dụ không nằm trong quy chuẩn và đã được lược bỏ.`,
                  });
                }
              }
            }
          });
        }
      }
    });
  }

  if (Array.isArray(rootObj.mistakes)) {
    const knownMistakeKeys = new Set([
      'wrong',
      'correct',
      'category',
      'subCategory',
      'explanationVi',
    ]);
    rootObj.mistakes.forEach((mistakeItem, mistakeIdx) => {
      if (mistakeItem && typeof mistakeItem === 'object' && !Array.isArray(mistakeItem)) {
        const mistakeObj = mistakeItem as Record<string, unknown>;
        for (const key of Object.keys(mistakeObj)) {
          if (!knownMistakeKeys.has(key)) {
            warnings.push({
              path: `/mistakes/${mistakeIdx}/${key}`,
              message: `Trường '${key}' tại mistakes[${mistakeIdx}] không nằm trong quy chuẩn và đã được lược bỏ.`,
            });
          }
        }
      }
    });
  }

  return warnings;
}

export class DefaultImportService implements ImportService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Bước 1: Tiếp nhận raw JSON, phát hiện mã lỗi lạ và tính diff so khớp CSDL
   */
  async dryRunImport(rawPayload: string, options?: DryRunOptions): Promise<DryRunReport> {
    const warnings: Array<{ path: string; message: string }> = [];

    // 1. Safe JSON parsing
    let rawObj: unknown;
    try {
      rawObj = JSON.parse(rawPayload);
    } catch (err) {
      return {
        isValid: false,
        requiresUserAction: false,
        summary: {
          addedWordsCount: 0,
          mergedWordsCount: 0,
          newSentencesCount: 0,
          addedMistakesCount: 0,
          skippedMistakesCount: 0,
          reappearedMistakesCount: 0,
          warningCount: 0,
          errorCount: 1,
        },
        warnings: [],
        errors: [{ path: '/', message: `Cú pháp JSON không hợp lệ: ${(err as Error).message}` }],
        pendingMappings: [],
      };
    }

    // 2. Unknown fields detection
    const unknownWarnings = detectUnknownFields(rawObj);
    warnings.push(...unknownWarnings);

    // 3. First-pass Zod validation
    const parseResult = DailySessionPayloadFirstPassSchema.safeParse(rawObj);
    if (!parseResult.success) {
      const zodErrors = parseResult.error.issues.map((issue) => ({
        path: `/${issue.path.join('/')}`,
        message: issue.message,
      }));

      return {
        isValid: false,
        requiresUserAction: false,
        summary: {
          addedWordsCount: 0,
          mergedWordsCount: 0,
          newSentencesCount: 0,
          addedMistakesCount: 0,
          skippedMistakesCount: 0,
          reappearedMistakesCount: 0,
          warningCount: warnings.length,
          errorCount: zodErrors.length,
        },
        warnings,
        errors: zodErrors,
        pendingMappings: [],
      };
    }

    const data = parseResult.data;
    const payloadHash = hashPayload(rawPayload);

    // 4. Outer Idempotency Barrier: Check rawPayload hash in ImportBatch
    const existingBatch = await this.prisma.importBatch.findUnique({
      where: { contentHash: payloadHash },
    });

    if (existingBatch && existingBatch.status === 'SUCCESS') {
      return {
        isValid: true,
        requiresUserAction: false,
        isSkipped: true,
        summary: {
          addedWordsCount: 0,
          mergedWordsCount: 0,
          newSentencesCount: 0,
          addedMistakesCount: 0,
          skippedMistakesCount: 0,
          reappearedMistakesCount: 0,
          warningCount: warnings.length + 1,
          errorCount: 0,
        },
        warnings: [
          ...warnings,
          {
            path: '/',
            message: 'Buổi học này đã được import đầy đủ trước đó (trùng khớp contentHash).',
          },
        ],
        pendingMappings: [],
      };
    }

    // 5. Check Session key conflict (week, day, seq)
    const targetSeq = options?.overrideSeq ?? data.session.seq;
    let sessionConflict: DryRunReport['sessionConflict'] | undefined;

    const existingSession = await this.prisma.session.findUnique({
      where: {
        week_day_seq: {
          week: data.session.week,
          day: data.session.day,
          seq: targetSeq,
        },
      },
    });

    if (existingSession) {
      const maxSeqSession = await this.prisma.session.findFirst({
        where: { week: data.session.week, day: data.session.day },
        orderBy: { seq: 'desc' },
      });
      const suggestedSeq = (maxSeqSession?.seq ?? targetSeq) + 1;
      sessionConflict = {
        existingSessionId: existingSession.id,
        suggestedSeq,
      };
      warnings.push({
        path: '/session/seq',
        message: `Xung đột khóa Session (Week ${data.session.week}, Day ${data.session.day}, Seq ${targetSeq}) đã tồn tại trong CSDL. Bạn có thể tăng seq lên ${suggestedSeq} hoặc chọn Gộp bổ sung (Merge).`,
      });
    }

    // 6. Whitelist check for Mistake Categories
    const pendingMappings: DryRunReport['pendingMappings'] = [];
    const validCategorySet = new Set(MistakeCategoryEnum.options);

    data.mistakes.forEach((m, idx) => {
      if (!validCategorySet.has(m.category as any)) {
        pendingMappings.push({
          itemIndex: idx,
          wrongText: m.wrong,
          unknownCategory: m.category,
          suggestedOptions: (
            Object.keys(MISTAKE_CATEGORY_LABELS) as Array<keyof typeof MISTAKE_CATEGORY_LABELS>
          ).map((code) => ({
            code,
            label: MISTAKE_CATEGORY_LABELS[code],
          })),
        });
      }
    });

    // 7. Deduplicate mistakes within the current payload
    const seenMistakeHashes = new Set<string>();
    let duplicateMistakesInPayload = 0;

    data.mistakes.forEach((m, idx) => {
      const mHash = hashMistake(m.wrong, m.correct);
      if (seenMistakeHashes.has(mHash)) {
        duplicateMistakesInPayload++;
        warnings.push({
          path: `/mistakes/${idx}`,
          message: `Lỗi sai lặp lại trong cùng file import đã được tự động gộp (DUPLICATE_MISTAKE_IN_PAYLOAD).`,
        });
      } else {
        seenMistakeHashes.add(mHash);
      }
    });

    // 8. DB Diff Calculation for Words & Sentences
    let addedWordsCount = 0;
    let mergedWordsCount = 0;
    let newSentencesCount = 0;

    for (const w of data.words) {
      const normalizedWord = w.word.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFC');
      const existingWord = await this.prisma.word.findUnique({
        where: {
          normalizedWord_pos: {
            normalizedWord,
            pos: w.pos,
          },
        },
        include: {
          sentences: true,
        },
      });

      if (!existingWord) {
        addedWordsCount++;
        newSentencesCount += w.sentences.length;
      } else {
        mergedWordsCount++;
        if (w.ipa && existingWord.ipa && w.ipa !== existingWord.ipa) {
          warnings.push({
            path: `/words/${w.word}/ipa`,
            message: `Cảnh báo lệch phiên âm IPA: Phiên bản mới '${w.ipa}' khác phiên bản cũ '${existingWord.ipa}'. Hệ thống sẽ giữ nguyên phiên âm cũ.`,
          });
        }

        const existingSentenceHashes = new Set(existingWord.sentences.map((s) => s.contentHash));
        for (const s of w.sentences) {
          const sentHash = hashSentence(s.text);
          if (!existingSentenceHashes.has(sentHash)) {
            newSentencesCount++;
          }
        }
      }
    }

    // 9. DB Diff Calculation for Mistakes
    let addedMistakesCount = 0;
    let reappearedMistakesCount = 0;

    for (const mHash of seenMistakeHashes) {
      const existingMistake = await this.prisma.mistake.findUnique({
        where: { contentHash: mHash },
      });

      if (!existingMistake) {
        addedMistakesCount++;
      } else {
        reappearedMistakesCount++;
      }
    }

    const requiresUserAction = pendingMappings.length > 0 || !!sessionConflict;

    return {
      isValid: true,
      requiresUserAction,
      sessionConflict,
      summary: {
        addedWordsCount,
        mergedWordsCount,
        newSentencesCount,
        addedMistakesCount,
        skippedMistakesCount: duplicateMistakesInPayload,
        reappearedMistakesCount,
        warningCount: warnings.length,
        errorCount: 0,
      },
      warnings,
      pendingMappings,
    };
  }

  /**
   * Bước 2: Commit nguyên tử toàn bộ buổi học vào CSDL trong 1 transaction duy nhất
   */
  async commitImport(rawPayload: string, options?: ImportCommitOptions): Promise<ImportResult> {
    const payloadHash = hashPayload(rawPayload);

    // 1. Outer Idempotency Barrier
    const existingBatch = await this.prisma.importBatch.findUnique({
      where: { contentHash: payloadHash },
      include: { sessions: true },
    });

    if (existingBatch && existingBatch.status === 'SUCCESS') {
      return {
        importBatchId: existingBatch.id,
        sessionId: existingBatch.sessions[0]?.id ?? '',
        status: 'SKIPPED',
        stats: {
          wordsCreated: 0,
          wordsMerged: 0,
          sentencesCreated: 0,
          mistakesCreated: 0,
          sessionItemsCreated: 0,
          reviewStatesCreated: 0,
        },
      };
    }

    // 2. Parse raw JSON and apply category mappings
    const rawObj = JSON.parse(rawPayload);
    const categoryMappings = options?.categoryMappings ?? {};

    if (Array.isArray(rawObj.mistakes)) {
      rawObj.mistakes.forEach((m: any) => {
        if (categoryMappings[m.category]) {
          const mappedTarget = categoryMappings[m.category];
          if (mappedTarget === 'other') {
            m.subCategory = m.category;
            m.category = 'other';
          } else {
            m.category = mappedTarget;
          }
        }
      });
    }

    // 3. Second-pass strict validation
    const validData = DailySessionPayloadStrictSchema.parse(rawObj);

    const targetSeq = options?.overrideSeq ?? validData.session.seq;
    const currentStudyDate = getStudyDate();

    // 4. Atomic transaction
    return await this.prisma.$transaction(async (tx) => {
      // Create ImportBatch
      const importBatch = await tx.importBatch.create({
        data: {
          sessionWeek: validData.session.week,
          sessionDay: validData.session.day,
          seq: targetSeq,
          contentHash: payloadHash,
          rawPayload,
          remappingJson: Object.keys(categoryMappings).length > 0 ? JSON.stringify(categoryMappings) : null,
          status: 'SUCCESS',
        },
      });

      // Handle Session
      let session = await tx.session.findUnique({
        where: {
          week_day_seq: {
            week: validData.session.week,
            day: validData.session.day,
            seq: targetSeq,
          },
        },
      });

      if (!session) {
        session = await tx.session.create({
          data: {
            importBatchId: importBatch.id,
            week: validData.session.week,
            day: validData.session.day,
            seq: targetSeq,
            checkpoint: validData.session.checkpoint,
            studiedAt: validData.session.studiedAt
              ? new Date(validData.session.studiedAt)
              : new Date(),
          },
        });
      }

      let wordsCreated = 0;
      let wordsMerged = 0;
      let sentencesCreated = 0;
      let mistakesCreated = 0;
      let sessionItemsCreated = 0;
      let reviewStatesCreated = 0;

      // Process Words
      for (const w of validData.words) {
        const normalizedWord = w.word.trim().replace(/\s+/g, ' ').toLowerCase().normalize('NFC');

        let wordRecord = await tx.word.findUnique({
          where: {
            normalizedWord_pos: {
              normalizedWord,
              pos: w.pos,
            },
          },
          include: {
            meanings: true,
            sentences: true,
          },
        });

        if (!wordRecord) {
          wordRecord = await tx.word.create({
            data: {
              normalizedWord,
              pos: w.pos,
              ipa: w.ipa ?? null,
              audioStatus: 'PENDING',
            },
            include: {
              meanings: true,
              sentences: true,
            },
          });
          wordsCreated++;

          // Create ReviewState for new Word
          await tx.reviewState.create({
            data: {
              itemType: 'WORD',
              itemId: wordRecord.id,
              interval: 0,
              easeFactor: 2.5,
              dueDate: currentStudyDate,
              repetitions: 0,
              lapseCount: 0,
              lastReviewedAt: null,
            },
          });
          reviewStatesCreated++;

          // Create SessionItem (INTRODUCED)
          await tx.sessionItem.create({
            data: {
              sessionId: session.id,
              itemType: 'WORD',
              itemId: wordRecord.id,
              role: 'INTRODUCED',
            },
          });
          sessionItemsCreated++;
        } else {
          wordsMerged++;

          // Update IPA if previously missing
          if (!wordRecord.ipa && w.ipa) {
            await tx.word.update({
              where: { id: wordRecord.id },
              data: { ipa: w.ipa },
            });
          }

          // Create SessionItem if not already recorded in this session
          const existingSessionItem = await tx.sessionItem.findUnique({
            where: {
              sessionId_itemType_itemId: {
                sessionId: session.id,
                itemType: 'WORD',
                itemId: wordRecord.id,
              },
            },
          });

          if (!existingSessionItem) {
            await tx.sessionItem.create({
              data: {
                sessionId: session.id,
                itemType: 'WORD',
                itemId: wordRecord.id,
                role: 'REAPPEARED',
              },
            });
            sessionItemsCreated++;
          }
        }

        // Merge meanings
        for (const meaning of w.meanings) {
          const normMeaning = normalizeText(meaning);
          const hasMeaning = wordRecord.meanings.some(
            (m) => normalizeText(m.meaningVi) === normMeaning
          );

          if (!hasMeaning) {
            const newMeaning = await tx.wordMeaning.create({
              data: {
                wordId: wordRecord.id,
                meaningVi: meaning.trim(),
              },
            });
            wordRecord.meanings.push(newMeaning);
          }
        }

        // Merge sentences
        for (const sentence of w.sentences) {
          const sentHash = hashSentence(sentence.text);
          const hasSentence = wordRecord.sentences.some((s) => s.contentHash === sentHash);

          if (!hasSentence) {
            const newSentence = await tx.sentence.create({
              data: {
                wordId: wordRecord.id,
                text: sentence.text.trim(),
                targetForm: sentence.targetForm?.trim() ?? null,
                translationVi: sentence.translationVi.trim(),
                contentHash: sentHash,
                audioStatus: 'PENDING',
              },
            });
            sentencesCreated++;
            wordRecord.sentences.push(newSentence);
          }
        }
      }

      // Process Mistakes (deduplicating inside payload)
      const processedMistakeHashes = new Set<string>();

      for (const m of validData.mistakes) {
        const mistakeHash = hashMistake(m.wrong, m.correct);
        if (processedMistakeHashes.has(mistakeHash)) {
          continue;
        }
        processedMistakeHashes.add(mistakeHash);

        let mistakeRecord = await tx.mistake.findUnique({
          where: { contentHash: mistakeHash },
        });

        if (!mistakeRecord) {
          mistakeRecord = await tx.mistake.create({
            data: {
              wrong: m.wrong.trim(),
              correct: m.correct.trim(),
              category: m.category,
              subCategory: m.subCategory?.trim() ?? null,
              explanationVi: m.explanationVi.trim(),
              contentHash: mistakeHash,
            },
          });
          mistakesCreated++;

          // Create ReviewState for new Mistake
          await tx.reviewState.create({
            data: {
              itemType: 'MISTAKE',
              itemId: mistakeRecord.id,
              interval: 0,
              easeFactor: 2.5,
              dueDate: currentStudyDate,
              repetitions: 0,
              lapseCount: 0,
              lastReviewedAt: null,
            },
          });
          reviewStatesCreated++;

          // Create SessionItem (INTRODUCED)
          await tx.sessionItem.create({
            data: {
              sessionId: session.id,
              itemType: 'MISTAKE',
              itemId: mistakeRecord.id,
              role: 'INTRODUCED',
            },
          });
          sessionItemsCreated++;
        } else {
          // Mistake already exists in DB -> record as REAPPEARED in this session
          const existingSessionItem = await tx.sessionItem.findUnique({
            where: {
              sessionId_itemType_itemId: {
                sessionId: session.id,
                itemType: 'MISTAKE',
                itemId: mistakeRecord.id,
              },
            },
          });

          if (!existingSessionItem) {
            await tx.sessionItem.create({
              data: {
                sessionId: session.id,
                itemType: 'MISTAKE',
                itemId: mistakeRecord.id,
                role: 'REAPPEARED',
              },
            });
            sessionItemsCreated++;
          }
        }
      }

      return {
        importBatchId: importBatch.id,
        sessionId: session.id,
        status: 'SUCCESS',
        stats: {
          wordsCreated,
          wordsMerged,
          sentencesCreated,
          mistakesCreated,
          sessionItemsCreated,
          reviewStatesCreated,
        },
      };
    });
  }
}

export const importService = new DefaultImportService();
