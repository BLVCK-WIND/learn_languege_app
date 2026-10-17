import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import { calculateNextReview, type Rating } from '@/lib/srs/scheduler';
import { getStudyDate } from '@/lib/study-day';
import type {
  DueCardDTO,
  DueCardsResponseData,
  SubmitReviewInput,
} from '@/types/review';

export class DefaultReviewService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Lấy danh sách toàn bộ thẻ đến hạn ôn tập (dueDate <= todayStudyDate)
   * và lọc bỏ các thẻ mồ côi hoặc có cha đã bị xóa mềm (where: { deletedAt: null }).
   */
  async getDueReviewCards(now: Date = new Date()): Promise<DueCardsResponseData> {
    const todayStudyDate = getStudyDate(now);

    // Lấy các thẻ ReviewState đến hạn hôm nay hoặc quá hạn
    const dueStates = await this.prisma.reviewState.findMany({
      where: {
        dueDate: { lte: todayStudyDate },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (dueStates.length === 0) {
      return {
        studyDate: todayStudyDate,
        count: 0,
        cards: [],
      };
    }

    const wordItemIds = dueStates
      .filter((s) => s.itemType === 'WORD')
      .map((s) => s.itemId);

    const mistakeItemIds = dueStates
      .filter((s) => s.itemType === 'MISTAKE')
      .map((s) => s.itemId);

    // Truy vấn nội dung Word và Mistake kèm lọc xóa mềm
    const [words, mistakes] = await Promise.all([
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
    ]);

    const wordMap = new Map(words.map((w) => [w.id, w]));
    const mistakeMap = new Map(mistakes.map((m) => [m.id, m]));

    const cards: DueCardDTO[] = [];

    for (const state of dueStates) {
      if (state.itemType === 'WORD') {
        const word = wordMap.get(state.itemId);
        // Bỏ qua nếu từ vựng đã bị xóa mềm hoặc không tồn tại
        if (!word) continue;

        cards.push({
          reviewStateId: state.id,
          itemType: 'WORD',
          itemId: word.id,
          interval: state.interval,
          easeFactor: state.easeFactor,
          repetitions: state.repetitions,
          lapseCount: state.lapseCount,
          dueDate: state.dueDate,
          wordContent: {
            normalizedWord: word.normalizedWord,
            pos: word.pos,
            ipa: word.ipa,
            meanings: word.meanings.map((m) => m.meaningVi),
            exampleSentence: word.sentences[0] || null,
          },
        });
      } else if (state.itemType === 'MISTAKE') {
        const mistake = mistakeMap.get(state.itemId);
        // Bỏ qua nếu lỗi sai đã bị xóa mềm hoặc không tồn tại
        if (!mistake) continue;

        cards.push({
          reviewStateId: state.id,
          itemType: 'MISTAKE',
          itemId: mistake.id,
          interval: state.interval,
          easeFactor: state.easeFactor,
          repetitions: state.repetitions,
          lapseCount: state.lapseCount,
          dueDate: state.dueDate,
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

    return {
      studyDate: todayStudyDate,
      count: cards.length,
      cards,
    };
  }

  /**
   * Chấm điểm thẻ ôn tập trong 1 transaction CSDL duy nhất ($transaction):
   * 1. Cập nhật ReviewState (interval, easeFactor, repetitions, lapseCount, dueDate, lastReviewedAt)
   * 2. Tạo bản ghi ReviewLog ghi nhận lịch sử chấm điểm
   */
  async submitCardReview(
    input: SubmitReviewInput,
    now: Date = new Date()
  ) {
    const validRatings: Rating[] = ['FORGOTTEN', 'HARD', 'REMEMBERED'];
    if (!validRatings.includes(input.rating)) {
      throw new Error(`Đánh giá không hợp lệ: ${input.rating}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const reviewState = await tx.reviewState.findUnique({
        where: { id: input.reviewStateId },
      });

      if (!reviewState) {
        throw new Error(`Không tìm thấy thẻ ôn tập với ID: ${input.reviewStateId}`);
      }

      // Tính toán các chỉ số mới qua bộ tính toán thuần túy
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

      // Cập nhật ReviewState
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

      // Ghi lịch sử ReviewLog
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
}

export const reviewService = new DefaultReviewService();
