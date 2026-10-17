import { getStudyDate, addDaysToStudyDate } from '@/lib/study-day';

export const INITIAL_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;
export const FIRST_INTERVAL = 1;
export const SECOND_INTERVAL = 4;
export const HARD_MULTIPLIER = 1.2;
export const MIN_HARD_INTERVAL_INCREASE = 1;
export const FORGOTTEN_EF_DELTA = -0.2;
export const HARD_EF_DELTA = -0.15;
export const REMEMBERED_EF_DELTA = 0.1;

export type Rating = 'FORGOTTEN' | 'HARD' | 'REMEMBERED';

export interface ReviewStateInput {
  interval: number; // Khoảng cách hiện tại (ngày)
  easeFactor: number; // Hệ số Ease Factor hiện tại
  repetitions: number; // Số lần đạt chuẩn liên tiếp
  lapseCount: number; // Tổng số lần bị quên trong lịch sử
}

export interface ReviewStateOutput {
  interval: number;
  easeFactor: number;
  repetitions: number;
  lapseCount: number;
  dueDate: string; // Chuỗi ngày học YYYY-MM-DD
}

export interface SrsScheduler {
  calculateNextReview(
    state: ReviewStateInput,
    rating: Rating,
    now?: Date
  ): ReviewStateOutput;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Bộ tính lịch ôn toán học thuần túy (Tầng a - Modified SM-2)
 * Nhận trạng thái hiện tại, nút chấm và thời điểm hiện tại `now`.
 * Trả về trạng thái tiếp theo và chuỗi dueDate YYYY-MM-DD.
 */
export function calculateNextReview(
  state: ReviewStateInput,
  rating: Rating,
  now: Date = new Date()
): ReviewStateOutput {
  let nextInterval: number;
  let nextEaseFactor: number;
  let nextRepetitions: number;
  let nextLapseCount: number;

  switch (rating) {
    case 'FORGOTTEN': {
      nextInterval = 1;
      nextRepetitions = 0;
      nextLapseCount = state.lapseCount + 1;
      nextEaseFactor = Math.max(
        MIN_EASE_FACTOR,
        round2(state.easeFactor + FORGOTTEN_EF_DELTA)
      );
      break;
    }

    case 'HARD': {
      nextInterval = Math.max(
        state.interval + MIN_HARD_INTERVAL_INCREASE,
        Math.ceil(state.interval * HARD_MULTIPLIER)
      );
      nextRepetitions = state.repetitions;
      nextLapseCount = state.lapseCount;
      nextEaseFactor = Math.max(
        MIN_EASE_FACTOR,
        round2(state.easeFactor + HARD_EF_DELTA)
      );
      break;
    }

    case 'REMEMBERED': {
      if (state.repetitions === 0) {
        nextInterval = FIRST_INTERVAL;
      } else if (state.repetitions === 1) {
        nextInterval = SECOND_INTERVAL;
      } else {
        nextInterval = Math.round(state.interval * state.easeFactor);
      }
      nextRepetitions = state.repetitions + 1;
      nextLapseCount = state.lapseCount;
      nextEaseFactor = round2(state.easeFactor + REMEMBERED_EF_DELTA);
      break;
    }
  }

  const studyDate = getStudyDate(now);
  const dueDate = addDaysToStudyDate(studyDate, nextInterval);

  return {
    interval: nextInterval,
    easeFactor: nextEaseFactor,
    repetitions: nextRepetitions,
    lapseCount: nextLapseCount,
    dueDate,
  };
}
