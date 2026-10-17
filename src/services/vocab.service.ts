import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import type {
  VocabFilterParams,
  VocabListResponse,
  VocabItemDTO,
} from '@/types/vocab';

export class DefaultVocabService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Lấy danh sách từ vựng kèm lọc xóa mềm (where: { deletedAt: null }),
   * nghĩa tiếng Việt, câu ví dụ và trạng thái ôn tập SRS ReviewState.
   */
  async getVocabList(params: VocabFilterParams = {}): Promise<VocabListResponse> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const whereCondition: Record<string, unknown> = {
      deletedAt: null,
    };

    if (params.search && params.search.trim().length > 0) {
      whereCondition.normalizedWord = {
        contains: params.search.trim().toLowerCase(),
      };
    }

    if (params.pos && params.pos !== 'all') {
      whereCondition.pos = params.pos.trim().toLowerCase();
    }

    const [total, words] = await Promise.all([
      this.prisma.word.count({
        where: whereCondition,
      }),
      this.prisma.word.findMany({
        where: whereCondition,
        include: {
          meanings: {
            where: { deletedAt: null },
            select: {
              id: true,
              meaningVi: true,
              context: true,
            },
          },
          sentences: {
            where: { deletedAt: null },
            select: {
              id: true,
              text: true,
              targetForm: true,
              translationVi: true,
              audioUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const wordIds = words.map((w) => w.id);

    // Lấy thông tin trạng thái SRS cho các từ này
    const reviewStates =
      wordIds.length > 0
        ? await this.prisma.reviewState.findMany({
            where: {
              itemType: 'WORD',
              itemId: { in: wordIds },
            },
          })
        : [];

    const reviewStateMap = new Map(reviewStates.map((rs) => [rs.itemId, rs]));

    const items: VocabItemDTO[] = words.map((word) => {
      const rs = reviewStateMap.get(word.id);
      return {
        id: word.id,
        normalizedWord: word.normalizedWord,
        pos: word.pos,
        ipa: word.ipa,
        audioUrl: word.audioUrl,
        audioStatus: word.audioStatus,
        createdAt: word.createdAt,
        updatedAt: word.updatedAt,
        meanings: word.meanings,
        sentences: word.sentences,
        reviewState: rs
          ? {
              interval: rs.interval,
              easeFactor: rs.easeFactor,
              dueDate: rs.dueDate,
              repetitions: rs.repetitions,
              lapseCount: rs.lapseCount,
              lastReviewedAt: rs.lastReviewedAt,
            }
          : null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Xóa mềm một từ vựng và toàn bộ nghĩa, câu ví dụ trực thuộc trong một transaction
   */
  async softDeleteWord(id: string): Promise<boolean> {
    const existing = await this.prisma.word.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt !== null) {
      return false;
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.word.update({
        where: { id },
        data: { deletedAt: now },
      }),
      this.prisma.wordMeaning.updateMany({
        where: { wordId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.sentence.updateMany({
        where: { wordId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
    ]);

    return true;
  }

  /**
   * Khôi phục từ vựng đã xóa mềm
   */
  async restoreWord(id: string): Promise<boolean> {
    const existing = await this.prisma.word.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt === null) {
      return false;
    }

    await this.prisma.$transaction([
      this.prisma.word.update({
        where: { id },
        data: { deletedAt: null },
      }),
      this.prisma.wordMeaning.updateMany({
        where: { wordId: id },
        data: { deletedAt: null },
      }),
      this.prisma.sentence.updateMany({
        where: { wordId: id },
        data: { deletedAt: null },
      }),
    ]);

    return true;
  }
}

export const vocabService = new DefaultVocabService();
