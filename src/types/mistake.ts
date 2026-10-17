import type { MistakeCategoryType } from './import';

export interface MistakeFilterParams {
  search?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

export interface MistakeReviewStateDTO {
  interval: number;
  easeFactor: number;
  dueDate: string;
  repetitions: number;
  lapseCount: number;
  lastReviewedAt: Date | null;
}

export interface MistakeItemDTO {
  id: string;
  wrong: string;
  correct: string;
  category: string;
  subCategory: string | null;
  explanationVi: string;
  createdAt: Date;
  updatedAt: Date;
  frequency: number;
  reviewState: MistakeReviewStateDTO | null;
}

export interface MistakeListResponse {
  items: MistakeItemDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
