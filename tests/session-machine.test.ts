import { describe, it, expect } from 'vitest';
import {
  createReviewSession,
  processSessionCard,
  MAX_INTRA_SESSION_REQUEUES,
  type ReviewSessionData,
} from '@/lib/srs/session-machine';
import type { ReviewStateInput } from '@/lib/srs/scheduler';

describe('Review Session State Machine (Layer b - Task 2b.3)', () => {
  const fixedNow = new Date('2026-10-18T10:00:00Z');

  describe('createReviewSession', () => {
    it('initializes a clean review session with pending items', () => {
      const session = createReviewSession({
        id: 'session-123',
        sessionDate: '2026-10-18',
        cards: [
          { reviewStateId: 'rev-1', itemType: 'WORD', itemId: 'w-1' },
          { reviewStateId: 'rev-2', itemType: 'MISTAKE', itemId: 'm-1' },
        ],
      });

      expect(session.id).toBe('session-123');
      expect(session.currentIndex).toBe(0);
      expect(session.completedCount).toBe(0);
      expect(session.status).toBe('IN_PROGRESS');
      expect(session.items).toHaveLength(2);
      expect(session.items[0]).toEqual({
        reviewStateId: 'rev-1',
        itemType: 'WORD',
        itemId: 'w-1',
        requeueCount: 0,
        hasLapsedInSession: false,
        status: 'PENDING',
      });
    });
  });

  describe('Matrix Tests (TB1 - TB3)', () => {
    // TB1: Quên rồi Nhớ rõ
    it('TB1: Quên rồi Nhớ rõ -> interval=1, EF giảm 0.20 duy nhất, không tăng EF ở lượt nhớ', () => {
      const initialSession = createReviewSession({
        id: 'sess-tb1',
        sessionDate: '2026-10-18',
        cards: [{ reviewStateId: 'rev-1', itemType: 'WORD', itemId: 'w-1' }],
      });

      const initialCardState: ReviewStateInput = {
        interval: 4,
        easeFactor: 2.5,
        repetitions: 2,
        lapseCount: 0,
      };

      // Turn 1: User rates FORGOTTEN
      const res1 = processSessionCard(initialSession, initialCardState, 'FORGOTTEN', fixedNow);

      expect(res1.isSessionCompleted).toBe(false);
      expect(res1.nextSessionState.status).toBe('IN_PROGRESS');
      expect(res1.nextSessionState.items).toHaveLength(2); // original + 1 requeued copy
      expect(res1.nextSessionState.items[1].requeueCount).toBe(1);
      expect(res1.nextSessionState.items[1].hasLapsedInSession).toBe(true);

      // Persisted state update on lapse:
      expect(res1.persistedStateUpdate.interval).toBe(1);
      expect(res1.persistedStateUpdate.easeFactor).toBe(2.3);
      expect(res1.persistedStateUpdate.lapseCount).toBe(1);

      // Turn 2: User encounters the requeued card at index 1 and rates REMEMBERED
      const currentCardStateAfterLapse: ReviewStateInput = {
        interval: 1,
        easeFactor: 2.3,
        repetitions: 0,
        lapseCount: 1,
      };

      const res2 = processSessionCard(
        res1.nextSessionState,
        currentCardStateAfterLapse,
        'REMEMBERED',
        fixedNow
      );

      // Card is completed, session is completed
      expect(res2.isSessionCompleted).toBe(true);
      expect(res2.nextSessionState.status).toBe('COMPLETED');
      expect(res2.nextSessionState.completedCount).toBe(1);

      // Spec TB1: interval = 1, EF holds at 2.30 (DO NOT increase EF), lapseCount = 1
      expect(res2.persistedStateUpdate.interval).toBe(1);
      expect(res2.persistedStateUpdate.easeFactor).toBe(2.3);
      expect(res2.persistedStateUpdate.lapseCount).toBe(1);
    });

    // TB2: Quên rồi Khó nhớ
    it('TB2: Quên rồi Khó nhớ -> interval=1, EF giảm 0.20 duy nhất, không giảm thêm', () => {
      const initialSession = createReviewSession({
        id: 'sess-tb2',
        sessionDate: '2026-10-18',
        cards: [{ reviewStateId: 'rev-1', itemType: 'WORD', itemId: 'w-1' }],
      });

      const initialCardState: ReviewStateInput = {
        interval: 10,
        easeFactor: 2.5,
        repetitions: 3,
        lapseCount: 0,
      };

      // Turn 1: User rates FORGOTTEN
      const res1 = processSessionCard(initialSession, initialCardState, 'FORGOTTEN', fixedNow);
      expect(res1.persistedStateUpdate.easeFactor).toBe(2.3);
      expect(res1.persistedStateUpdate.lapseCount).toBe(1);

      // Turn 2: User rates HARD on requeued card
      const stateAfterLapse: ReviewStateInput = {
        interval: 1,
        easeFactor: 2.3,
        repetitions: 0,
        lapseCount: 1,
      };

      const res2 = processSessionCard(res1.nextSessionState, stateAfterLapse, 'HARD', fixedNow);

      expect(res2.isSessionCompleted).toBe(true);
      expect(res2.nextSessionState.status).toBe('COMPLETED');
      // Spec TB2: interval = 1, EF holds at 2.30 (NOT penalized twice!), lapseCount = 1
      expect(res2.persistedStateUpdate.interval).toBe(1);
      expect(res2.persistedStateUpdate.easeFactor).toBe(2.3);
      expect(res2.persistedStateUpdate.lapseCount).toBe(1);
    });

    // TB3: Quên liên tục 3 lần
    it('TB3: Quên liên tục 3 lần -> re-queue đủ 3 lần, lần 3 bị buộc kết thúc với interval=1, EF chỉ trừ 0.20 duy nhất', () => {
      let session: ReviewSessionData = createReviewSession({
        id: 'sess-tb3',
        sessionDate: '2026-10-18',
        cards: [{ reviewStateId: 'rev-1', itemType: 'WORD', itemId: 'w-1' }],
      });

      let state: ReviewStateInput = {
        interval: 4,
        easeFactor: 2.5,
        repetitions: 2,
        lapseCount: 0,
      };

      // Turn 1: 1st FORGOTTEN (requeueCount: 0 -> 1)
      const res1 = processSessionCard(session, state, 'FORGOTTEN', fixedNow);
      expect(res1.isSessionCompleted).toBe(false);
      expect(res1.persistedStateUpdate.easeFactor).toBe(2.3);
      expect(res1.persistedStateUpdate.lapseCount).toBe(1);
      session = res1.nextSessionState;
      state = {
        interval: res1.persistedStateUpdate.interval,
        easeFactor: res1.persistedStateUpdate.easeFactor,
        repetitions: res1.persistedStateUpdate.repetitions,
        lapseCount: res1.persistedStateUpdate.lapseCount,
      };

      // Turn 2: 2nd FORGOTTEN (requeueCount: 1 -> 2)
      const res2 = processSessionCard(session, state, 'FORGOTTEN', fixedNow);
      expect(res2.isSessionCompleted).toBe(false);
      expect(res2.persistedStateUpdate.easeFactor).toBe(2.3); // No 2nd EF penalty!
      expect(res2.persistedStateUpdate.lapseCount).toBe(1); // No 2nd lapse increment!
      session = res2.nextSessionState;

      // Turn 3: 3rd FORGOTTEN (requeueCount: 2 -> 3)
      const res3 = processSessionCard(session, state, 'FORGOTTEN', fixedNow);
      expect(res3.isSessionCompleted).toBe(false);
      expect(res3.persistedStateUpdate.easeFactor).toBe(2.3);
      expect(res3.persistedStateUpdate.lapseCount).toBe(1);
      session = res3.nextSessionState;

      // Turn 4: 4th FORGOTTEN (requeueCount is now 3 == MAX_INTRA_SESSION_REQUEUES)
      const res4 = processSessionCard(session, state, 'FORGOTTEN', fixedNow);
      // Forced to complete!
      expect(res4.isSessionCompleted).toBe(true);
      expect(res4.nextSessionState.status).toBe('COMPLETED');
      expect(res4.nextSessionState.completedCount).toBe(1);
      expect(res4.persistedStateUpdate.interval).toBe(1);
      expect(res4.persistedStateUpdate.easeFactor).toBe(2.3);
      expect(res4.persistedStateUpdate.lapseCount).toBe(1);
    });
  });

  describe('Normal Reviews (Never lapsed)', () => {
    it('applies standard Tier (a) formulas for cards that never lapsed', () => {
      const session = createReviewSession({
        id: 'sess-normal',
        sessionDate: '2026-10-18',
        cards: [{ reviewStateId: 'rev-1', itemType: 'WORD', itemId: 'w-1' }],
      });

      const cardState: ReviewStateInput = {
        interval: 1,
        easeFactor: 2.6,
        repetitions: 1,
        lapseCount: 0,
      };

      const result = processSessionCard(session, cardState, 'REMEMBERED', fixedNow);
      expect(result.isSessionCompleted).toBe(true);
      expect(result.persistedStateUpdate.interval).toBe(4); // SECOND_INTERVAL
      expect(result.persistedStateUpdate.easeFactor).toBe(2.7);
      expect(result.persistedStateUpdate.repetitions).toBe(2);
      expect(result.persistedStateUpdate.lapseCount).toBe(0);
    });
  });

  describe('Multi-card Queue Execution', () => {
    it('correctly tracks currentIndex and completedCount across multiple cards', () => {
      let session = createReviewSession({
        id: 'sess-multi',
        sessionDate: '2026-10-18',
        cards: [
          { reviewStateId: 'rev-1', itemType: 'WORD', itemId: 'w-1' },
          { reviewStateId: 'rev-2', itemType: 'MISTAKE', itemId: 'm-1' },
        ],
      });

      // Card 1 remembered
      const res1 = processSessionCard(
        session,
        { interval: 0, easeFactor: 2.5, repetitions: 0, lapseCount: 0 },
        'REMEMBERED',
        fixedNow
      );
      expect(res1.isSessionCompleted).toBe(false);
      expect(res1.nextSessionState.completedCount).toBe(1);
      expect(res1.nextSessionState.currentIndex).toBe(1);

      // Card 2 remembered
      const res2 = processSessionCard(
        res1.nextSessionState,
        { interval: 0, easeFactor: 2.5, repetitions: 0, lapseCount: 0 },
        'REMEMBERED',
        fixedNow
      );
      expect(res2.isSessionCompleted).toBe(true);
      expect(res2.nextSessionState.status).toBe('COMPLETED');
      expect(res2.nextSessionState.completedCount).toBe(2);
    });

    it('throws error when attempting to process card on non-IN_PROGRESS session', () => {
      const session = createReviewSession({
        id: 'sess-done',
        sessionDate: '2026-10-18',
        cards: [{ reviewStateId: 'rev-1', itemType: 'WORD', itemId: 'w-1' }],
      });
      session.status = 'COMPLETED';

      expect(() =>
        processSessionCard(
          session,
          { interval: 1, easeFactor: 2.5, repetitions: 1, lapseCount: 0 },
          'REMEMBERED',
          fixedNow
        )
      ).toThrowError(/Cannot process card in session with status: COMPLETED/);
    });
  });
});
