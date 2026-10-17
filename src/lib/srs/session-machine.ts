/**
 * Review Session State Machine (Layer b - Task 2b.3)
 *
 * Implements intra-session queue coordination:
 * 1. Re-queues forgotten cards up to MAX_INTRA_SESSION_REQUEUES (3 times)
 * 2. Penalizes Ease Factor and increases lapseCount only ONCE per card per session
 * 3. Caps interval at 1 day without increasing EF when a previously lapsed card is remembered
 *
 * Conforms to ADR:
 * "Tách riêng 2 lớp: Bộ tính thuần túy & Máy trạng thái phiên. Logic toán học được test cô lập 100%,
 * máy trạng thái kiểm soát vòng đời thẻ trong phiên mà không làm rối thuật toán gốc."
 */

import {
  calculateNextReview,
  type Rating,
  type ReviewStateInput,
  type ReviewStateOutput,
} from '@/lib/srs/scheduler';
import { getStudyDate, addDaysToStudyDate } from '@/lib/study-day';

export const MAX_INTRA_SESSION_REQUEUES = 3;

export interface SessionItemState {
  reviewStateId: string;
  itemType: 'WORD' | 'MISTAKE';
  itemId: string;
  requeueCount: number; // Số lần đã re-queue trong phiên này
  hasLapsedInSession: boolean; // Cờ đánh dấu đã bị bấm Quên trong phiên
  status: 'PENDING' | 'COMPLETED';
}

export interface ReviewSessionData {
  id: string;
  sessionDate: string; // YYYY-MM-DD
  currentIndex: number;
  completedCount: number;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  items: SessionItemState[];
}

export interface SessionTransitionResult {
  nextSessionState: ReviewSessionData;
  persistedStateUpdate: ReviewStateOutput & { lastReviewedAt: Date };
  isSessionCompleted: boolean;
}

/**
 * Creates an initial ReviewSessionData instance from a list of due cards.
 */
export function createReviewSession(params: {
  id: string;
  sessionDate: string;
  cards: { reviewStateId: string; itemType: 'WORD' | 'MISTAKE'; itemId: string }[];
}): ReviewSessionData {
  return {
    id: params.id,
    sessionDate: params.sessionDate,
    currentIndex: 0,
    completedCount: 0,
    status: 'IN_PROGRESS',
    items: params.cards.map((c) => ({
      reviewStateId: c.reviewStateId,
      itemType: c.itemType,
      itemId: c.itemId,
      requeueCount: 0,
      hasLapsedInSession: false,
      status: 'PENDING',
    })),
  };
}

/**
 * Pure state machine transition function for a single card rating in an active session.
 */
export function processSessionCard(
  session: ReviewSessionData,
  currentState: ReviewStateInput,
  rating: Rating,
  now: Date = new Date()
): SessionTransitionResult {
  if (session.status !== 'IN_PROGRESS') {
    throw new Error(`Cannot process card in session with status: ${session.status}`);
  }

  const currentItem = session.items[session.currentIndex];
  if (!currentItem) {
    throw new Error(
      `Invalid session state: currentIndex ${session.currentIndex} exceeds items length ${session.items.length}`
    );
  }

  const newItems: SessionItemState[] = session.items.map((it) => ({ ...it }));
  const activeItem = newItems[session.currentIndex];

  let persistedState: ReviewStateOutput;
  let newCompletedCount = session.completedCount;

  if (rating === 'FORGOTTEN') {
    // Check if card has not exceeded maximum re-queues
    if (activeItem.requeueCount < MAX_INTRA_SESSION_REQUEUES) {
      if (!activeItem.hasLapsedInSession) {
        // First lapse in session: apply standard lapse penalty (EF -0.2, interval = 1, lapseCount + 1)
        persistedState = calculateNextReview(currentState, 'FORGOTTEN', now);
        activeItem.hasLapsedInSession = true;
      } else {
        // Already lapsed earlier in this session: DO NOT penalize EF or increase lapseCount again
        const studyDate = getStudyDate(now);
        persistedState = {
          interval: 1,
          easeFactor: currentState.easeFactor,
          repetitions: 0,
          lapseCount: currentState.lapseCount,
          dueDate: addDaysToStudyDate(studyDate, 1),
        };
      }

      // Mark current turn handled
      activeItem.status = 'COMPLETED';

      // Append re-queued card to the end of the queue
      const requeuedCard: SessionItemState = {
        reviewStateId: activeItem.reviewStateId,
        itemType: activeItem.itemType,
        itemId: activeItem.itemId,
        requeueCount: activeItem.requeueCount + 1,
        hasLapsedInSession: true,
        status: 'PENDING',
      };
      newItems.push(requeuedCard);
    } else {
      // Reached MAX_INTRA_SESSION_REQUEUES (3 times): force complete
      activeItem.status = 'COMPLETED';
      newCompletedCount += 1;

      const studyDate = getStudyDate(now);
      persistedState = {
        interval: 1,
        easeFactor: activeItem.hasLapsedInSession
          ? currentState.easeFactor
          : calculateNextReview(currentState, 'FORGOTTEN', now).easeFactor,
        repetitions: 0,
        lapseCount: activeItem.hasLapsedInSession
          ? currentState.lapseCount
          : currentState.lapseCount + 1,
        dueDate: addDaysToStudyDate(studyDate, 1),
      };
    }
  } else {
    // Rating is 'HARD' or 'REMEMBERED'
    activeItem.status = 'COMPLETED';
    newCompletedCount += 1;

    if (activeItem.hasLapsedInSession) {
      // Card previously lapsed in this session: remembering it is short-term reinforcement only
      // Force interval = 1 day and DO NOT increase Ease Factor
      const studyDate = getStudyDate(now);
      persistedState = {
        interval: 1,
        easeFactor: currentState.easeFactor,
        repetitions: 0,
        lapseCount: currentState.lapseCount,
        dueDate: addDaysToStudyDate(studyDate, 1),
      };
    } else {
      // Card never lapsed in this session: apply full Tier (a) formulas
      persistedState = calculateNextReview(currentState, rating, now);
    }
  }

  const nextIndex = session.currentIndex + 1;
  const isSessionCompleted = nextIndex >= newItems.length;

  const nextSessionState: ReviewSessionData = {
    ...session,
    currentIndex: nextIndex,
    completedCount: newCompletedCount,
    status: isSessionCompleted ? 'COMPLETED' : 'IN_PROGRESS',
    items: newItems,
  };

  return {
    nextSessionState,
    persistedStateUpdate: {
      ...persistedState,
      lastReviewedAt: now,
    },
    isSessionCompleted,
  };
}
