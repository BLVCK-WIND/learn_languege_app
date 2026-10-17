import type { PosType } from './import';

export interface VocabFilterParams {
  search?: string;
  pos?: string;
  page?: number;
  pageSize?: number;
}

export interface WordMeaningDTO {
  id: string;
  meaningVi: string;
  context: string | null;
}

export interface WordSentenceDTO {
  id: string;
  text: string;
  targetForm: string | null;
  translationVi: string;
  audioUrl: string | null;
}

export interface WordReviewStateDTO {
  interval: number;
  easeFactor: number;
  dueDate: string;
  repetitions: number;
  lapseCount: number;
  lastReviewedAt: Date | null;
}

export interface VocabItemDTO {
  id: string;
  normalizedWord: string;
  pos: string;
  ipa: string | null;
  audioUrl: string | null;
  audioStatus: string;
  createdAt: Date;
  updatedAt: Date;
  meanings: WordMeaningDTO[];
  sentences: WordSentenceDTO[];
  reviewState: WordReviewStateDTO | null;
}

export interface VocabListResponse {
  items: VocabItemDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
