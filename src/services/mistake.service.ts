import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import type {
  MistakeFilterParams,
  MistakeListResponse,
  MistakeItemDTO,
} from '@/types/mistake';

export class DefaultMistakeService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Lấy danh sách lỗi sai kèm điều kiện lọc xóa mềm (where: { deletedAt: null }),
   * tính toán tần suất mắc lỗi chính xác qua bảng SessionItem và gắn ReviewState SRS.
   */
  async getMistakesList(
    params: MistakeFilterParams = {}
  ): Promise<MistakeListResponse> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const whereCondition: Record<string, unknown> = {
      deletedAt: null,
    };

    if (params.category && params.category !== 'all') {
      whereCondition.category = params.category.trim();
    }

    if (params.search && params.search.trim().length > 0) {
      const keyword = params.search.trim();
      whereCondition.OR = [
        { wrong: { contains: keyword } },
        { correct: { contains: keyword } },
        { explanationVi: { contains: keyword } },
      ];
    }

    const [total, mistakes] = await Promise.all([
      this.prisma.mistake.count({
        where: whereCondition,
      }),
      this.prisma.mistake.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    const mistakeIds = mistakes.map((m) => m.id);

    // Tính tần suất xuất hiện thực tế qua SessionItem (chuẩn hóa theo ADR: không đếm dòng Mistake)
    const frequencyMap = new Map<string, number>();
    if (mistakeIds.length > 0) {
      const sessionItems = await this.prisma.sessionItem.findMany({
        where: {
          itemType: 'MISTAKE',
          itemId: { in: mistakeIds },
        },
        select: {
          itemId: true,
        },
      });

      for (const item of sessionItems) {
        frequencyMap.set(
          item.itemId,
          (frequencyMap.get(item.itemId) || 0) + 1
        );
      }
    }

    // Lấy thông tin trạng thái SRS cho các lỗi này
    const reviewStates =
      mistakeIds.length > 0
        ? await this.prisma.reviewState.findMany({
            where: {
              itemType: 'MISTAKE',
              itemId: { in: mistakeIds },
            },
          })
        : [];

    const reviewStateMap = new Map(reviewStates.map((rs) => [rs.itemId, rs]));

    const items: MistakeItemDTO[] = mistakes.map((mistake) => {
      const rs = reviewStateMap.get(mistake.id);
      return {
        id: mistake.id,
        wrong: mistake.wrong,
        correct: mistake.correct,
        category: mistake.category,
        subCategory: mistake.subCategory,
        explanationVi: mistake.explanationVi,
        createdAt: mistake.createdAt,
        updatedAt: mistake.updatedAt,
        frequency: frequencyMap.get(mistake.id) || 0,
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
   * Xóa mềm một lỗi sai
   */
  async softDeleteMistake(id: string): Promise<boolean> {
    const existing = await this.prisma.mistake.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt !== null) {
      return false;
    }

    await this.prisma.mistake.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return true;
  }

  /**
   * Khôi phục lỗi sai đã xóa mềm
   */
  async restoreMistake(id: string): Promise<boolean> {
    const existing = await this.prisma.mistake.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });

    if (!existing || existing.deletedAt === null) {
      return false;
    }

    await this.prisma.mistake.update({
      where: { id },
      data: { deletedAt: null },
    });

    return true;
  }
}

export const mistakeService = new DefaultMistakeService();
