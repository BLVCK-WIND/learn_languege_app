import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import type {
  MistakeFilterParams,
  MistakeListResponse,
  MistakeItemDTO,
  MistakeSessionDTO,
} from '@/types/mistake';

export class DefaultMistakeService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Lấy danh sách lỗi sai kèm điều kiện lọc xóa mềm (where: { deletedAt: null }),
   * tính toán tần suất mắc lỗi chính xác qua bảng SessionItem, gắn ngữ cảnh buổi học (Session Context),
   * trạng thái ReviewState SRS và thống kê số lượng lỗi theo từng danh mục chuẩn.
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

    const [total, mistakes, categoryGroups] = await Promise.all([
      this.prisma.mistake.count({
        where: whereCondition,
      }),
      this.prisma.mistake.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.mistake.groupBy({
        by: ['category'],
        where: {
          deletedAt: null,
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const mistakeIds = mistakes.map((m) => m.id);

    // Tính tần suất xuất hiện thực tế qua SessionItem (chuẩn hóa theo ADR: không đếm dòng Mistake)
    // và lấy ngữ cảnh buổi học thực tế (Session Context: week, day, seq, checkpoint, role)
    const frequencyMap = new Map<string, number>();
    const sessionMap = new Map<string, MistakeSessionDTO[]>();
    if (mistakeIds.length > 0) {
      const sessionItems = await this.prisma.sessionItem.findMany({
        where: {
          itemType: 'MISTAKE',
          itemId: { in: mistakeIds },
        },
        include: {
          session: true,
        },
        orderBy: [
          { session: { week: 'asc' } },
          { session: { day: 'asc' } },
          { session: { seq: 'asc' } },
        ],
      });

      for (const item of sessionItems) {
        frequencyMap.set(
          item.itemId,
          (frequencyMap.get(item.itemId) || 0) + 1
        );
        const sessions = sessionMap.get(item.itemId) || [];
        sessions.push({
          sessionId: item.sessionId,
          week: item.session.week,
          day: item.session.day,
          seq: item.session.seq,
          checkpoint: item.session.checkpoint,
          studiedAt: item.session.studiedAt,
          role: item.role,
        });
        sessionMap.set(item.itemId, sessions);
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
        sessions: sessionMap.get(mistake.id) || [],
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

    const categoryCounts: Record<string, number> = {};
    for (const group of categoryGroups) {
      categoryCounts[group.category] = group._count.id;
    }

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      categoryCounts,
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
