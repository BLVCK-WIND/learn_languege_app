import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { getStudyDate } from '@/lib/study-day';
import { DefaultReviewService } from '@/services/review.service';

describe('Review Session DB Management & 04:00 AM Boundary (Task 2b.4)', () => {
  let testPrisma: PrismaClient;
  let reviewService: DefaultReviewService;
  let tempDbPath: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(process.cwd(), 'tests', 'fixtures', `temp_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tempDir, { recursive: true });
    tempDbPath = path.join(tempDir, 'test.db');

    const rawDb = new Database(tempDbPath);
    const migrationSql = fs.readFileSync(
      path.join(process.cwd(), 'prisma', 'migrations', '20261017170045_init', 'migration.sql'),
      'utf8'
    );
    rawDb.exec(migrationSql);
    rawDb.close();

    const adapter = new PrismaBetterSqlite3({ url: tempDbPath });
    testPrisma = new PrismaClient({ adapter });
    reviewService = new DefaultReviewService(testPrisma);
  });

  afterEach(async () => {
    await testPrisma.$disconnect();
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
      } catch {
        // Ignore transient lock on Windows
      }
    }
  });

  it('TB5: resumes in-progress session across reloads before 04:00 AM with exact currentIndex', async () => {
    const fixedNow = new Date('2026-10-18T10:00:00.000Z');
    const todayStudyDate = getStudyDate(fixedNow); // "2026-10-18"

    // Create 3 active words due today
    for (let i = 1; i <= 3; i++) {
      const word = await testPrisma.word.create({
        data: {
          normalizedWord: `word${i}`,
          pos: 'noun',
          meanings: { create: [{ meaningVi: `nghĩa ${i}` }] },
        },
      });
      await testPrisma.reviewState.create({
        data: {
          itemType: 'WORD',
          itemId: word.id,
          dueDate: todayStudyDate,
          interval: 0,
          easeFactor: 2.5,
        },
      });
    }

    // 1. Initial load -> creates new IN_PROGRESS session
    const session1 = await reviewService.getOrCreateActiveSession(fixedNow);
    expect(session1.sessionId).toBeDefined();
    expect(session1.currentIndex).toBe(0);
    expect(session1.completedCount).toBe(0);
    expect(session1.cards).toHaveLength(3);

    // 2. Submit review for first card
    await reviewService.submitCardReview({
      sessionId: session1.sessionId,
      reviewStateId: session1.cards[0].reviewStateId,
      rating: 'REMEMBERED',
    }, fixedNow);

    // 3. User reloads page -> should resume same session with currentIndex = 1 and completedCount = 1
    const sessionReload = await reviewService.getOrCreateActiveSession(fixedNow);
    expect(sessionReload.sessionId).toBe(session1.sessionId);
    expect(sessionReload.currentIndex).toBe(1);
    expect(sessionReload.completedCount).toBe(1);
    expect(sessionReload.cards).toHaveLength(3);
  });

  it('TB4: Quên rồi Thoát sớm -> endSessionEarly saves COMPLETED and unreviewed cards rollover', async () => {
    const fixedNow = new Date('2026-10-18T10:00:00.000Z');
    const todayStudyDate = getStudyDate(fixedNow);

    // Create 2 words
    const w1 = await testPrisma.word.create({
      data: { normalizedWord: 'apple', pos: 'noun', meanings: { create: [{ meaningVi: 'quả táo' }] } },
    });
    const w2 = await testPrisma.word.create({
      data: { normalizedWord: 'banana', pos: 'noun', meanings: { create: [{ meaningVi: 'quả chuối' }] } },
    });

    const s1 = await testPrisma.reviewState.create({
      data: { itemType: 'WORD', itemId: w1.id, dueDate: todayStudyDate, interval: 4, easeFactor: 2.5 },
    });
    const s2 = await testPrisma.reviewState.create({
      data: { itemType: 'WORD', itemId: w2.id, dueDate: todayStudyDate, interval: 4, easeFactor: 2.5 },
    });

    const session = await reviewService.getOrCreateActiveSession(fixedNow);

    // Rate 1st card as FORGOTTEN (re-queues to back)
    await reviewService.submitCardReview({
      sessionId: session.sessionId,
      reviewStateId: s1.id,
      rating: 'FORGOTTEN',
    }, fixedNow);

    // User decides to end session early ("Kết thúc hôm nay")
    const endResult = await reviewService.endSessionEarly(session.sessionId, fixedNow);
    expect(endResult.status).toBe('COMPLETED');

    // Verify session in DB is COMPLETED
    const dbSession = await testPrisma.reviewSession.findUnique({
      where: { id: session.sessionId },
    });
    expect(dbSession?.status).toBe('COMPLETED');

    // Card 1 was forgotten -> interval reset to 1
    const updatedS1 = await testPrisma.reviewState.findUnique({ where: { id: s1.id } });
    expect(updatedS1?.interval).toBe(1);
    expect(updatedS1?.lapseCount).toBe(1);

    // Card 2 was not reached -> preserves its original dueDate as today
    const updatedS2 = await testPrisma.reviewState.findUnique({ where: { id: s2.id } });
    expect(updatedS2?.dueDate).toBe(todayStudyDate);
    expect(updatedS2?.interval).toBe(4);
  });

  it('automatically marks yesterday session as ABANDONED when crossed 04:00 AM next day', async () => {
    // Yesterday: 2026-10-17 20:00 VN (13:00 UTC) -> studyDate is "2026-10-17"
    const yesterdayDate = new Date('2026-10-17T13:00:00.000Z');
    expect(getStudyDate(yesterdayDate)).toBe('2026-10-17');

    const w1 = await testPrisma.word.create({
      data: { normalizedWord: 'courage', pos: 'noun', meanings: { create: [{ meaningVi: 'lòng can đảm' }] } },
    });
    await testPrisma.reviewState.create({
      data: { itemType: 'WORD', itemId: w1.id, dueDate: '2026-10-17', interval: 0, easeFactor: 2.5 },
    });

    // Yesterday: create session
    const yesterdaySession = await reviewService.getOrCreateActiveSession(yesterdayDate);
    expect(yesterdaySession.studyDate).toBe('2026-10-17');

    // Today: 2026-10-18 10:00 VN (03:00 UTC) -> studyDate is "2026-10-18" (after 04:00 AM)
    const todayDate = new Date('2026-10-18T03:00:00.000Z');
    expect(getStudyDate(todayDate)).toBe('2026-10-18');

    // Calling getOrCreateActiveSession today:
    const todaySession = await reviewService.getOrCreateActiveSession(todayDate);

    // 1. Old session is updated to ABANDONED in DB
    const oldDbSession = await testPrisma.reviewSession.findUnique({
      where: { id: yesterdaySession.sessionId },
    });
    expect(oldDbSession?.status).toBe('ABANDONED');

    // 2. New session is created for today
    expect(todaySession.sessionId).not.toBe(yesterdaySession.sessionId);
    expect(todaySession.studyDate).toBe('2026-10-18');

    // 3. The unreviewed card from yesterday is automatically picked up!
    expect(todaySession.cards).toHaveLength(1);
    expect(todaySession.cards[0].wordContent?.normalizedWord).toBe('courage');
  });

  it('executes ReviewState, ReviewLog, and ReviewSession in a single atomic transaction', async () => {
    const fixedNow = new Date('2026-10-18T10:00:00.000Z');
    const todayStudyDate = getStudyDate(fixedNow);

    const word = await testPrisma.word.create({
      data: { normalizedWord: 'atomic', pos: 'adj', meanings: { create: [{ meaningVi: 'nguyên tử' }] } },
    });
    const state = await testPrisma.reviewState.create({
      data: { itemType: 'WORD', itemId: word.id, dueDate: todayStudyDate, interval: 1, easeFactor: 2.5, repetitions: 1 },
    });

    const session = await reviewService.getOrCreateActiveSession(fixedNow);

    // Submit rating
    await reviewService.submitCardReview({
      sessionId: session.sessionId,
      reviewStateId: state.id,
      rating: 'REMEMBERED',
      reviewDurationMs: 1500,
    }, fixedNow);

    // Verify all 3 records were created/updated:
    const updatedState = await testPrisma.reviewState.findUnique({ where: { id: state.id } });
    expect(updatedState?.interval).toBe(4);
    expect(updatedState?.repetitions).toBe(2);

    const log = await testPrisma.reviewLog.findFirst({ where: { reviewStateId: state.id } });
    expect(log).toBeDefined();
    expect(log?.rating).toBe('REMEMBERED');
    expect(log?.reviewDurationMs).toBe(1500);

    const updatedSession = await testPrisma.reviewSession.findUnique({ where: { id: session.sessionId } });
    expect(updatedSession?.currentIndex).toBe(1);
    expect(updatedSession?.completedCount).toBe(1);
    expect(updatedSession?.status).toBe('COMPLETED');
  });
});
