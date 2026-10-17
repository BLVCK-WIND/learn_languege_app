import type { Rating, ReviewStateOutput } from '@/lib/srs/scheduler';

export interface DueWordContentDTO {
  normalizedWord: string;
  pos: string;
  ipa: string | null;
  meanings: string[];
  exampleSentence: {
    text: string;
    translationVi: string;
    targetForm: string | null;
  } | null;
}

export interface DueMistakeContentDTO {
  wrong: string;
  correct: string;
  category: string;
  subCategory: string | null;
  explanationVi: string;
}

export interface DueCardDTO {
  reviewStateId: string;
  itemType: 'WORD' | 'MISTAKE';
  itemId: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  lapseCount: number;
  dueDate: string;
  wordContent?: DueWordContentDTO;
  mistakeContent?: DueMistakeContentDTO;
}

export interface SubmitReviewInput {
  reviewStateId: string;
  rating: Rating;
  reviewDurationMs?: number;
}

export interface DueCardsResponseData {
  studyDate: string;
  count: number;
  cards: DueCardDTO[];
}
