export interface CategoryFrequencyDTO {
  category: string;
  categoryLabel: string;
  count: number;
  percentage: number;
}

export interface TopMistakeItemDTO {
  mistakeId: string;
  wrong: string;
  correct: string;
  category: string;
  categoryLabel: string;
  frequency: number;
}

export interface WeeklyMistakeTrendDTO {
  week: number;
  totalMistakes: number;
  categoryBreakdown: Record<string, number>;
}

export interface RecentMistakeDTO {
  id: string;
  wrong: string;
  correct: string;
  category: string;
  categoryLabel: string;
  week: number;
  day: number;
  seq: number;
  checkpoint: string;
  studiedAt: Date;
}

export interface DashboardSummaryDTO {
  totalWords: number;
  totalMistakesCount: number;
  totalMistakeOccurrences: number;
  totalSessions: number;
  topCategories: CategoryFrequencyDTO[];
  topMistakes: TopMistakeItemDTO[];
  weeklyTrends: WeeklyMistakeTrendDTO[];
  recentMistakes: RecentMistakeDTO[];
}
