import { describe, it, expect, vi } from 'vitest';
import { GET } from '@/app/api/analytics/route';
import { analyticsService } from '@/services/analytics.service';
import type { DashboardSummaryDTO } from '@/types/analytics';

describe('Analytics API (GET /api/analytics)', () => {
  it('returns 200 with dashboard summary data', async () => {
    const mockSummary: DashboardSummaryDTO = {
      totalWords: 10,
      totalMistakesCount: 5,
      totalMistakeOccurrences: 12,
      totalSessions: 4,
      topCategories: [
        {
          category: 'tense',
          categoryLabel: 'Sai thì động từ',
          count: 6,
          percentage: 50,
        },
      ],
      topMistakes: [
        {
          mistakeId: 'm1',
          wrong: 'I go yesterday',
          correct: 'I went yesterday',
          category: 'tense',
          categoryLabel: 'Sai thì động từ',
          frequency: 3,
        },
      ],
      weeklyTrends: [
        {
          week: 1,
          totalMistakes: 5,
          categoryBreakdown: { tense: 5 },
        },
      ],
      recentMistakes: [
        {
          id: 'm1',
          wrong: 'I go yesterday',
          correct: 'I went yesterday',
          category: 'tense',
          categoryLabel: 'Sai thì động từ',
          week: 1,
          day: 2,
          seq: 1,
          checkpoint: 'Buổi 1',
          studiedAt: new Date(),
        },
      ],
    };

    const spy = vi
      .spyOn(analyticsService, 'getDashboardSummary')
      .mockResolvedValue(mockSummary);

    const res = await GET();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.totalWords).toBe(10);
    expect(json.data.totalMistakeOccurrences).toBe(12);
    expect(json.data.topCategories).toHaveLength(1);
    expect(spy).toHaveBeenCalled();
  });

  it('returns 500 when service throws an unexpected error', async () => {
    vi.spyOn(analyticsService, 'getDashboardSummary').mockRejectedValue(
      new Error('Database disk error')
    );

    const res = await GET();
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe('Database disk error');
  });
});
