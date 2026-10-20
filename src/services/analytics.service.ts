import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient } from '@prisma/client';
import type {
  CategoryFrequencyDTO,
  TopMistakeItemDTO,
  WeeklyMistakeTrendDTO,
  RecentMistakeDTO,
  DashboardSummaryDTO,
} from '@/types/analytics';
import { MISTAKE_CATEGORY_LABELS, type MistakeCategoryType } from '@/types/import';

export class DefaultAnalyticsService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Tính toán các chỉ số thống kê tổng thể và phân tích chuyên sâu cho Dashboard IELTS.
   * TUÂN THỦ ADR: Đếm tần suất mắc lỗi qua bảng SessionItem, tuyệt đối không đếm dòng Mistake.
   */
  async getDashboardSummary(): Promise<DashboardSummaryDTO> {
    const [totalWords, totalMistakesCount, totalSessions, mistakeSessionItems] =
      await Promise.all([
        this.prisma.word.count({
          where: { deletedAt: null },
        }),
        this.prisma.mistake.count({
          where: { deletedAt: null },
        }),
        this.prisma.session.count(),
        this.prisma.sessionItem.findMany({
          where: {
            itemType: 'MISTAKE',
          },
          include: {
            session: true,
          },
          orderBy: [
            { session: { week: 'desc' } },
            { session: { day: 'desc' } },
            { session: { seq: 'desc' } },
            { createdAt: 'desc' },
          ],
        }),
      ]);

    const totalMistakeOccurrences = mistakeSessionItems.length;

    // Lấy thông tin các Mistake tương ứng
    const mistakeIds = Array.from(new Set(mistakeSessionItems.map((item) => item.itemId)));
    const mistakes =
      mistakeIds.length > 0
        ? await this.prisma.mistake.findMany({
            where: {
              id: { in: mistakeIds },
            },
          })
        : [];

    const mistakeMap = new Map(mistakes.map((m) => [m.id, m]));

    // 1. Phân loại theo danh mục: đếm số SessionItem theo Mistake.category
    const categoryCountMap = new Map<string, number>();
    const mistakeFrequencyMap = new Map<string, number>();

    for (const item of mistakeSessionItems) {
      const mistake = mistakeMap.get(item.itemId);
      if (!mistake) continue;

      categoryCountMap.set(
        mistake.category,
        (categoryCountMap.get(mistake.category) || 0) + 1
      );

      mistakeFrequencyMap.set(
        mistake.id,
        (mistakeFrequencyMap.get(mistake.id) || 0) + 1
      );
    }

    // Top 5 danh mục lỗi hay gặp nhất
    const topCategories: CategoryFrequencyDTO[] = Array.from(categoryCountMap.entries())
      .map(([category, count]) => {
        const percentage =
          totalMistakeOccurrences > 0
            ? Math.round((count / totalMistakeOccurrences) * 1000) / 10
            : 0;
        return {
          category,
          categoryLabel:
            MISTAKE_CATEGORY_LABELS[category as MistakeCategoryType] || category,
          count,
          percentage,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 2. Top 5 câu lỗi cụ thể lặp lại nhiều nhất
    const topMistakes: TopMistakeItemDTO[] = Array.from(mistakeFrequencyMap.entries())
      .map(([mistakeId, frequency]) => {
        const m = mistakeMap.get(mistakeId)!;
        return {
          mistakeId,
          wrong: m.wrong,
          correct: m.correct,
          category: m.category,
          categoryLabel:
            MISTAKE_CATEGORY_LABELS[m.category as MistakeCategoryType] || m.category,
          frequency,
        };
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    // 3. Xu hướng lỗi theo tuần: gom nhóm SessionItem theo Session.week
    const weekMap = new Map<
      number,
      { total: number; categoryBreakdown: Record<string, number> }
    >();

    for (const item of mistakeSessionItems) {
      const week = item.session.week;
      const mistake = mistakeMap.get(item.itemId);
      if (!mistake) continue;

      const current = weekMap.get(week) || {
        total: 0,
        categoryBreakdown: {},
      };
      current.total += 1;
      current.categoryBreakdown[mistake.category] =
        (current.categoryBreakdown[mistake.category] || 0) + 1;
      weekMap.set(week, current);
    }

    const weeklyTrends: WeeklyMistakeTrendDTO[] = Array.from(weekMap.entries())
      .map(([week, data]) => ({
        week,
        totalMistakes: data.total,
        categoryBreakdown: data.categoryBreakdown,
      }))
      .sort((a, b) => a.week - b.week);

    // 4. Danh sách câu sai gần đây (tối đa 5 câu, không trùng lặp)
    const recentMistakes: RecentMistakeDTO[] = [];
    const seenRecentIds = new Set<string>();

    for (const item of mistakeSessionItems) {
      if (seenRecentIds.has(item.itemId)) continue;
      const m = mistakeMap.get(item.itemId);
      if (!m) continue;

      seenRecentIds.add(item.itemId);
      recentMistakes.push({
        id: m.id,
        wrong: m.wrong,
        correct: m.correct,
        category: m.category,
        categoryLabel:
          MISTAKE_CATEGORY_LABELS[m.category as MistakeCategoryType] || m.category,
        week: item.session.week,
        day: item.session.day,
        seq: item.session.seq,
        checkpoint: item.session.checkpoint,
        studiedAt: item.session.studiedAt,
      });

      if (recentMistakes.length >= 5) break;
    }

    return {
      totalWords,
      totalMistakesCount,
      totalMistakeOccurrences,
      totalSessions,
      topCategories,
      topMistakes,
      weeklyTrends,
      recentMistakes,
    };
  }
}

export const analyticsService = new DefaultAnalyticsService();
