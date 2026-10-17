import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import { calculateNextReview, type Rating } from '@/lib/srs/scheduler';
import {
  processSessionCard,
  type ReviewSessionData,
  type SessionItemState,
} from '@/lib/srs/session-machine';
import { getStudyDate } from '@/lib/study-day';
import { interleaveCards } from '@/lib/srs/interleaving';
import { DEFAULT_QUOTA_CONFIG } from '@/services/quota.service';
import type {
  DueCardDTO,
  DueCardsResponseData,
  SubmitReviewInput,
  EndSessionResponseData,
} from '@/types/review';

export class DefaultReviewService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Helper to fetch rich card content (Word / Mistake) for a list of items
   * and exclude soft-deleted items (where: { deletedAt: null }).
   */
  private async enrichCardItems(
    items: {
      id?: string;
      reviewStateId?: string;
      itemType: string;
      itemId: string;
      interval?: number;
      easeFactor?: number;
      repetitions?: number;
      lapseCount?: number;
      dueDate?: string;
      requeueCount?: number;
      hasLapsedInSession?: boolean;
    }[]
  ): Promise<DueCardDTO[]> {
    if (items.length === 0) return [];

    const stateIds = items
      .map((i) => i.reviewStateId || i.id)
      .filter((id): id is string => Boolean(id));

    const wordItemIds = items
      .filter((s) => s.itemType === 'WORD')
      .map((s) => s.itemId);

    const mistakeItemIds = items
      .filter((s) => s.itemType === 'MISTAKE')
      .map((s) => s.itemId);

    const [words, mistakes, reviewStates] = await Promise.all([
      wordItemIds.length > 0
        ? this.prisma.word.findMany({
            where: {
              id: { in: wordItemIds },
              deletedAt: null,
            },
            include: {
              meanings: {
                where: { deletedAt: null },
                select: { meaningVi: true },
              },
              sentences: {
                where: { deletedAt: null },
                select: {
                  text: true,
                  translationVi: true,
                  targetForm: true,
                },
                take: 1,
              },
            },
          })
        : [],
      mistakeItemIds.length > 0
        ? this.prisma.mistake.findMany({
            where: {
              id: { in: mistakeItemIds },
              deletedAt: null,
            },
            select: {
              id: true,
              wrong: true,
              correct: true,
              category: true,
              subCategory: true,
              explanationVi: true,
            },
          })
        : [],
      // Fetch latest ReviewState metadata if not provided
      stateIds.length > 0
        ? this.prisma.reviewState.findMany({
            where: { id: { in: stateIds } },
          })
        : [],
    ]);

    const wordMap = new Map(words.map((w) => [w.id, w]));
    const mistakeMap = new Map(mistakes.map((m) => [m.id, m]));
    const stateMap = new Map(reviewStates.map((s) => [s.id, s]));

    const cards: DueCardDTO[] = [];

    for (const item of items) {
      const stateId = item.reviewStateId || item.id;
      if (!stateId) continue;
      const state = stateMap.get(stateId);
      if (!state) continue;

      if (item.itemType === 'WORD') {
        const word = wordMap.get(item.itemId);
        if (!word) continue;

        cards.push({
          reviewStateId: stateId,
          itemType: 'WORD',
          itemId: word.id,
          interval: state.interval,
          easeFactor: state.easeFactor,
          repetitions: state.repetitions,
          lapseCount: state.lapseCount,
          dueDate: state.dueDate,
          requeueCount: item.requeueCount ?? 0,
          hasLapsedInSession: item.hasLapsedInSession ?? false,
          wordContent: {
            normalizedWord: word.normalizedWord,
            pos: word.pos,
            ipa: word.ipa,
            meanings: word.meanings.map((m) => m.meaningVi),
            exampleSentence: word.sentences[0] || null,
          },
        });
      } else if (item.itemType === 'MISTAKE') {
        const mistake = mistakeMap.get(item.itemId);
        if (!mistake) continue;

        cards.push({
          reviewStateId: stateId,
          itemType: 'MISTAKE',
          itemId: mistake.id,
          interval: state.interval,
          easeFactor: state.easeFactor,
          repetitions: state.repetitions,
          lapseCount: state.lapseCount,
          dueDate: state.dueDate,
          requeueCount: item.requeueCount ?? 0,
          hasLapsedInSession: item.hasLapsedInSession ?? false,
          mistakeContent: {
            wrong: mistake.wrong,
            correct: mistake.correct,
            category: mistake.category,
            subCategory: mistake.subCategory,
            explanationVi: mistake.explanationVi,
          },
        });
      }
    }

    return cards;
  }

  /**
   * Lấy hoặc khởi tạo phiên học hoạt động (Active Session) với quy tắc ranh giới 04:00 AM:
   * 1. Nếu có phiên IN_PROGRESS cũ (sessionDate < todayStudyDate) -> tự động chuyển ABANDONED.
   * 2. Nếu có phiên IN_PROGRESS của hôm nay -> nạp lại nguyên vẹn trạng thái dở dang.
   * 3. Nếu chưa có phiên -> tạo mới từ các thẻ đến hạn hôm nay.
   */
  async getOrCreateActiveSession(now: Date = new Date()): Promise<DueCardsResponseData> {
    const todayStudyDate = getStudyDate(now);

    // 1. Kiểm tra xem có phiên IN_PROGRESS nào đang tồn tại không
    const activeSession = await this.prisma.reviewSession.findFirst({
      where: { status: 'IN_PROGRESS' },
      orderBy: { startedAt: 'desc' },
    });

    if (activeSession) {
      if (activeSession.sessionDate < todayStudyDate) {
        // Đã qua 04:00 AM hôm sau: Đổi trạng thái sang ABANDONED
        await this.prisma.reviewSession.update({
          where: { id: activeSession.id },
          data: { status: 'ABANDONED', updatedAt: now },
        });
        // Tiếp tục xuống dưới để tạo phiên mới cho ngày hôm nay
      } else {
        // Phiên của ngày hôm nay đang diễn ra dở dang: Nạp lại
        const sessionItems: SessionItemState[] = JSON.parse(activeSession.queueJson);
        const cards = await this.enrichCardItems(sessionItems);

        return {
          sessionId: activeSession.id,
          studyDate: todayStudyDate,
          count: cards.length,
          currentIndex: activeSession.currentIndex,
          completedCount: activeSession.completedCount,
          cards,
        };
      }
    }

    // 2. Chưa có phiên IN_PROGRESS cho hôm nay:
    // Lấy cấu hình quota hiện tại (hoặc mặc định)
    const quotaConfig =
      (await this.prisma.studyQuotaConfig.findFirst()) || DEFAULT_QUOTA_CONFIG;

    // Phân loại thẻ đến hạn hôm nay: Thẻ ôn tập (lastReviewedAt != null) & Thẻ mới (lastReviewedAt == null)
    // Áp dụng hạn ngạch cho từng nhóm
    const [reviewWords, reviewMistakes, newWords, newMistakes] = await Promise.all([
      // Thẻ từ vựng ôn tập (ưu tiên dueDate ASC, createdAt ASC)
      this.prisma.reviewState.findMany({
        where: {
          itemType: 'WORD',
          lastReviewedAt: { not: null },
          dueDate: { lte: todayStudyDate },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        take: quotaConfig.maxReviewWordsPerDay,
      }),
      // Thẻ lỗi sai ôn tập (ưu tiên dueDate ASC, createdAt ASC)
      this.prisma.reviewState.findMany({
        where: {
          itemType: 'MISTAKE',
          lastReviewedAt: { not: null },
          dueDate: { lte: todayStudyDate },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        take: quotaConfig.maxReviewMistakesPerDay,
      }),
      // Thẻ từ vựng mới (ưu tiên thời gian nhập liệu cũ nhất trước: createdAt ASC)
      this.prisma.reviewState.findMany({
        where: {
          itemType: 'WORD',
          lastReviewedAt: null,
          dueDate: { lte: todayStudyDate },
        },
        orderBy: { createdAt: 'asc' },
        take: quotaConfig.maxNewWordsPerDay,
      }),
      // Thẻ lỗi sai mới (ưu tiên createdAt ASC)
      this.prisma.reviewState.findMany({
        where: {
          itemType: 'MISTAKE',
          lastReviewedAt: null,
          dueDate: { lte: todayStudyDate },
        },
        orderBy: { createdAt: 'asc' },
        take: quotaConfig.maxNewMistakesPerDay,
      }),
    ]);

    const allWordStates = [...reviewWords, ...newWords];
    const allMistakeStates = [...reviewMistakes, ...newMistakes];

    if (allWordStates.length === 0 && allMistakeStates.length === 0) {
      return {
        studyDate: todayStudyDate,
        count: 0,
        currentIndex: 0,
        completedCount: 0,
        cards: [],
      };
    }

    // Làm giàu nội dung từ vựng và câu sai
    const [wordCards, mistakeCards] = await Promise.all([
      this.enrichCardItems(allWordStates),
      this.enrichCardItems(allMistakeStates),
    ]);

    if (wordCards.length === 0 && mistakeCards.length === 0) {
      return {
        studyDate: todayStudyDate,
        count: 0,
        currentIndex: 0,
        completedCount: 0,
        cards: [],
      };
    }

    // Áp dụng thuật toán trộn xen kẽ Interleaving 2 Từ : 1 Lỗi
    const cards = interleaveCards(wordCards, mistakeCards, { words: 2, mistakes: 1 });

    const quotaSummary = {
      reviewWords: reviewWords.length,
      newWords: newWords.length,
      reviewMistakes: reviewMistakes.length,
      newMistakes: newMistakes.length,
    };

    // Khởi tạo bản ghi ReviewSession mới trong CSDL
    const initialItems: SessionItemState[] = cards.map((c) => ({
      reviewStateId: c.reviewStateId,
      itemType: c.itemType,
      itemId: c.itemId,
      requeueCount: 0,
      hasLapsedInSession: false,
      status: 'PENDING',
    }));

    const createdSession = await this.prisma.reviewSession.create({
      data: {
        sessionDate: todayStudyDate,
        queueJson: JSON.stringify(initialItems),
        currentIndex: 0,
        completedCount: 0,
        status: 'IN_PROGRESS',
        startedAt: now,
      },
    });

    return {
      sessionId: createdSession.id,
      studyDate: todayStudyDate,
      count: cards.length,
      currentIndex: 0,
      completedCount: 0,
      quotaSummary,
      cards,
    };
  }

  /**
   * Alias cho getOrCreateActiveSession để tương thích ngược với API cũ
   */
  async getDueReviewCards(now: Date = new Date()): Promise<DueCardsResponseData> {
    return this.getOrCreateActiveSession(now);
  }

  /**
   * Chấm điểm thẻ ôn tập trong 1 transaction CSDL duy nhất ($transaction):
   * 1. Cập nhật ReviewState (interval, easeFactor, repetitions, lapseCount, dueDate, lastReviewedAt)
   * 2. Tạo bản ghi ReviewLog ghi nhận lịch sử chấm điểm
   * 3. Cập nhật ReviewSession (queueJson, currentIndex, completedCount, status)
   */
  async submitCardReview(
    input: SubmitReviewInput,
    now: Date = new Date()
  ) {
    const validRatings: Rating[] = ['FORGOTTEN', 'HARD', 'REMEMBERED'];
    if (!validRatings.includes(input.rating)) {
      throw new Error(`Đánh giá không hợp lệ: ${input.rating}`);
    }

    const todayStudyDate = getStudyDate(now);

    return this.prisma.$transaction(async (tx) => {
      const reviewState = await tx.reviewState.findUnique({
        where: { id: input.reviewStateId },
      });

      if (!reviewState) {
        throw new Error(`Không tìm thấy thẻ ôn tập với ID: ${input.reviewStateId}`);
      }

      // Tìm ReviewSession hiện tại (ưu tiên input.sessionId, nếu không có thì tìm IN_PROGRESS hôm nay)
      let sessionRecord = input.sessionId
        ? await tx.reviewSession.findUnique({ where: { id: input.sessionId } })
        : await tx.reviewSession.findFirst({
            where: { status: 'IN_PROGRESS', sessionDate: todayStudyDate },
            orderBy: { startedAt: 'desc' },
          });

      if (sessionRecord && sessionRecord.status === 'IN_PROGRESS') {
        const sessionItems: SessionItemState[] = JSON.parse(sessionRecord.queueJson);
        const sessionData: ReviewSessionData = {
          id: sessionRecord.id,
          sessionDate: sessionRecord.sessionDate,
          currentIndex: sessionRecord.currentIndex,
          completedCount: sessionRecord.completedCount,
          status: 'IN_PROGRESS',
          items: sessionItems,
        };

        const currentState = {
          interval: reviewState.interval,
          easeFactor: reviewState.easeFactor,
          repetitions: reviewState.repetitions,
          lapseCount: reviewState.lapseCount,
        };

        // Chạy qua máy trạng thái phiên (Tầng b)
        const transition = processSessionCard(sessionData, currentState, input.rating, now);

        // 1. Cập nhật ReviewState
        const updatedState = await tx.reviewState.update({
          where: { id: input.reviewStateId },
          data: {
            interval: transition.persistedStateUpdate.interval,
            easeFactor: transition.persistedStateUpdate.easeFactor,
            repetitions: transition.persistedStateUpdate.repetitions,
            lapseCount: transition.persistedStateUpdate.lapseCount,
            dueDate: transition.persistedStateUpdate.dueDate,
            lastReviewedAt: transition.persistedStateUpdate.lastReviewedAt,
          },
        });

        // 2. Ghi lịch sử ReviewLog
        await tx.reviewLog.create({
          data: {
            reviewStateId: input.reviewStateId,
            rating: input.rating,
            intervalBefore: reviewState.interval,
            intervalAfter: transition.persistedStateUpdate.interval,
            easeFactorBefore: reviewState.easeFactor,
            easeFactorAfter: transition.persistedStateUpdate.easeFactor,
            reviewDurationMs: input.reviewDurationMs || 0,
            reviewedAt: now,
          },
        });

        // 3. Cập nhật ReviewSession
        await tx.reviewSession.update({
          where: { id: sessionRecord.id },
          data: {
            queueJson: JSON.stringify(transition.nextSessionState.items),
            currentIndex: transition.nextSessionState.currentIndex,
            completedCount: transition.nextSessionState.completedCount,
            status: transition.nextSessionState.status,
            updatedAt: now,
          },
        });

        return {
          ...updatedState,
          session: transition.nextSessionState,
          isSessionCompleted: transition.isSessionCompleted,
        };
      }

      // Fallback: nếu không có session trong CSDL (chạy test độc lập tầng a)
      const next = calculateNextReview(
        {
          interval: reviewState.interval,
          easeFactor: reviewState.easeFactor,
          repetitions: reviewState.repetitions,
          lapseCount: reviewState.lapseCount,
        },
        input.rating,
        now
      );

      const updated = await tx.reviewState.update({
        where: { id: input.reviewStateId },
        data: {
          interval: next.interval,
          easeFactor: next.easeFactor,
          repetitions: next.repetitions,
          lapseCount: next.lapseCount,
          dueDate: next.dueDate,
          lastReviewedAt: now,
        },
      });

      await tx.reviewLog.create({
        data: {
          reviewStateId: input.reviewStateId,
          rating: input.rating,
          intervalBefore: reviewState.interval,
          intervalAfter: next.interval,
          easeFactorBefore: reviewState.easeFactor,
          easeFactorAfter: next.easeFactor,
          reviewDurationMs: input.reviewDurationMs || 0,
          reviewedAt: now,
        },
      });

      return updated;
    });
  }

  /**
   * Nút "Kết thúc hôm nay": Dừng sớm buổi học, lưu trạng thái COMPLETED cho phiên hiện tại.
   * Các thẻ chưa làm giữ nguyên dueDate để tự động gối đầu vào ngày mai.
   */
  async endSessionEarly(
    sessionId?: string,
    now: Date = new Date()
  ): Promise<EndSessionResponseData> {
    const todayStudyDate = getStudyDate(now);

    const session = sessionId
      ? await this.prisma.reviewSession.findUnique({ where: { id: sessionId } })
      : await this.prisma.reviewSession.findFirst({
          where: { status: 'IN_PROGRESS', sessionDate: todayStudyDate },
          orderBy: { startedAt: 'desc' },
        });

    if (!session) {
      throw new Error('Không tìm thấy phiên học đang diễn ra để kết thúc');
    }

    await this.prisma.reviewSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        updatedAt: now,
      },
    });

    return {
      sessionId: session.id,
      status: 'COMPLETED',
      completedCount: session.completedCount,
      message: 'Đã hoàn thành sớm phiên học hôm nay. Các thẻ còn lại sẽ được gối đầu sang ngày mai!',
    };
  }
}

export const reviewService = new DefaultReviewService();
