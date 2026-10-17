import { describe, it, test, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateNextReview,
  type Rating,
  type ReviewStateInput,
} from '../src/lib/srs/scheduler';
import { getStudyDate, addDaysToStudyDate } from '../src/lib/study-day';
import { DefaultReviewService } from '../src/services/review.service';

describe('SRS Scheduler - Pure Modified SM-2 Table-driven Tests (docs/SRS_ALGORITHM.md Sec 6.1)', () => {
  const fixedNow = new Date('2026-10-18T10:00:00.000Z');
  const todayStudyDate = getStudyDate(fixedNow); // "2026-10-18"

  const tableMatrix: Array<{
    tc: string;
    description: string;
    input: ReviewStateInput;
    rating: Rating;
    expected: {
      interval: number;
      easeFactor: number;
      repetitions: number;
      lapseCount: number;
      daysAhead: number;
    };
  }> = [
    {
      tc: 'TC1',
      description: 'Thẻ mới tinh lần đầu bấm Nhớ rõ -> interval=1, EF=2.60, rep=1',
      input: { interval: 0, easeFactor: 2.5, repetitions: 0, lapseCount: 0 },
      rating: 'REMEMBERED',
      expected: { interval: 1, easeFactor: 2.6, repetitions: 1, lapseCount: 0, daysAhead: 1 },
    },
    {
      tc: 'TC2',
      description: 'Thẻ rep=1 bấm Nhớ rõ lần 2 -> interval=4, EF=2.70, rep=2',
      input: { interval: 1, easeFactor: 2.6, repetitions: 1, lapseCount: 0 },
      rating: 'REMEMBERED',
      expected: { interval: 4, easeFactor: 2.7, repetitions: 2, lapseCount: 0, daysAhead: 4 },
    },
    {
      tc: 'TC3',
      description: 'Thẻ rep=2 bấm Nhớ rõ lần 3 -> interval=10, EF=2.60, rep=3',
      input: { interval: 4, easeFactor: 2.5, repetitions: 2, lapseCount: 0 },
      rating: 'REMEMBERED',
      expected: { interval: 10, easeFactor: 2.6, repetitions: 3, lapseCount: 0, daysAhead: 10 },
    },
    {
      tc: 'TC4',
      description: 'Thẻ interval=1 bấm Khó nhớ (bước tăng tối thiểu) -> interval=2, EF=2.35',
      input: { interval: 1, easeFactor: 2.5, repetitions: 1, lapseCount: 0 },
      rating: 'HARD',
      expected: { interval: 2, easeFactor: 2.35, repetitions: 1, lapseCount: 0, daysAhead: 2 },
    },
    {
      tc: 'TC5',
      description: 'Thẻ interval dài bấm Khó nhớ -> interval=12, EF=2.35',
      input: { interval: 10, easeFactor: 2.5, repetitions: 3, lapseCount: 0 },
      rating: 'HARD',
      expected: { interval: 12, easeFactor: 2.35, repetitions: 3, lapseCount: 0, daysAhead: 12 },
    },
    {
      tc: 'TC6',
      description: 'Thẻ bị Quên lần đầu -> interval=1, EF=2.30, rep=0, lapse=1',
      input: { interval: 14, easeFactor: 2.5, repetitions: 4, lapseCount: 0 },
      rating: 'FORGOTTEN',
      expected: { interval: 1, easeFactor: 2.3, repetitions: 0, lapseCount: 1, daysAhead: 1 },
    },
    {
      tc: 'TC7',
      description: 'Thẻ bị Quên chạm sàn Ease Factor -> interval=1, EF=1.30, rep=0, lapse=3',
      input: { interval: 3, easeFactor: 1.35, repetitions: 1, lapseCount: 2 },
      rating: 'FORGOTTEN',
      expected: { interval: 1, easeFactor: 1.3, repetitions: 0, lapseCount: 3, daysAhead: 1 },
    },
    {
      tc: 'TC8',
      description: 'Thẻ đã ở sàn 1.30 tiếp tục bị Quên -> không tụt dưới sàn 1.30',
      input: { interval: 1, easeFactor: 1.3, repetitions: 0, lapseCount: 3 },
      rating: 'FORGOTTEN',
      expected: { interval: 1, easeFactor: 1.3, repetitions: 0, lapseCount: 4, daysAhead: 1 },
    },
  ];

  test.each(tableMatrix)('$tc: $description', ({ input, rating, expected }) => {
    const result = calculateNextReview(input, rating, fixedNow);

    expect(result.interval).toBe(expected.interval);
    expect(result.easeFactor).toBeCloseTo(expected.easeFactor, 2);
    expect(result.repetitions).toBe(expected.repetitions);
    expect(result.lapseCount).toBe(expected.lapseCount);

    const expectedDueDate = addDaysToStudyDate(todayStudyDate, expected.daysAhead);
    expect(result.dueDate).toBe(expectedDueDate);
  });
});

describe('Review Service Integration & Atomic Transactions (Task 2a.2)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_srs_test');
  const tempDbPath = path.join(tempDir, 'test_srs.db');
  let testPrisma: PrismaClient;
  let reviewService: DefaultReviewService;

  beforeEach(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Initialize temporary database with schema
    const rawDb = new Database(tempDbPath);
    rawDb.pragma('foreign_keys = ON;');
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
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('retrieves due cards and filters out soft-deleted items', async () => {
    const fixedNow = new Date('2026-10-18T10:00:00.000Z');
    const todayStudyDate = getStudyDate(fixedNow);

    // 1. Create an active word with ReviewState due today
    const word = await testPrisma.word.create({
      data: {
        normalizedWord: 'achieve',
        pos: 'verb',
        ipa: '/əˈtʃiːv/',
        meanings: {
          create: [{ meaningVi: 'đạt được mục tiêu' }],
        },
        sentences: {
          create: [
            {
              text: 'I will achieve band 6.5.',
              translationVi: 'Tôi sẽ đạt band 6.5.',
              contentHash: 'hash-achieve-due-1',
            },
          ],
        },
      },
    });

    const activeWordState = await testPrisma.reviewState.create({
      data: {
        itemType: 'WORD',
        itemId: word.id,
        dueDate: todayStudyDate,
        interval: 0,
        easeFactor: 2.5,
      },
    });

    // 2. Create a soft-deleted mistake with ReviewState due today (should be excluded)
    const deletedMistake = await testPrisma.mistake.create({
      data: {
        wrong: 'I play game.',
        correct: 'I play games.',
        category: 'plural-s',
        explanationVi: 'Số nhiều danh từ.',
        contentHash: 'hash-mistake-del',
        deletedAt: new Date(),
      },
    });

    await testPrisma.reviewState.create({
      data: {
        itemType: 'MISTAKE',
        itemId: deletedMistake.id,
        dueDate: todayStudyDate,
        interval: 0,
        easeFactor: 2.5,
      },
    });

    // 3. Create a future word (dueDate in future, should be excluded)
    const futureWord = await testPrisma.word.create({
      data: {
        normalizedWord: 'future',
        pos: 'noun',
      },
    });

    await testPrisma.reviewState.create({
      data: {
        itemType: 'WORD',
        itemId: futureWord.id,
        dueDate: addDaysToStudyDate(todayStudyDate, 5),
        interval: 5,
        easeFactor: 2.5,
      },
    });

    const result = await reviewService.getDueReviewCards(fixedNow);
    expect(result.count).toBe(1);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].reviewStateId).toBe(activeWordState.id);
    expect(result.cards[0].wordContent?.normalizedWord).toBe('achieve');
  });

  it('submits card review atomically, updating ReviewState and inserting ReviewLog', async () => {
    const fixedNow = new Date('2026-10-18T10:00:00.000Z');
    const todayStudyDate = getStudyDate(fixedNow);

    const word = await testPrisma.word.create({
      data: {
        normalizedWord: 'diligent',
        pos: 'adj',
      },
    });

    const state = await testPrisma.reviewState.create({
      data: {
        itemType: 'WORD',
        itemId: word.id,
        dueDate: todayStudyDate,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        lapseCount: 0,
      },
    });

    // Submit review with rating 'REMEMBERED'
    const updated = await reviewService.submitCardReview(
      {
        reviewStateId: state.id,
        rating: 'REMEMBERED',
        reviewDurationMs: 4200,
      },
      fixedNow
    );

    // Verify updated ReviewState
    expect(updated.interval).toBe(1);
    expect(updated.repetitions).toBe(1);
    expect(updated.easeFactor).toBeCloseTo(2.6, 2);
    expect(updated.dueDate).toBe(addDaysToStudyDate(todayStudyDate, 1));
    expect(updated.lastReviewedAt).not.toBeNull();

    // Verify ReviewLog record was created in the same transaction
    const logs = await testPrisma.reviewLog.findMany({
      where: { reviewStateId: state.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].rating).toBe('REMEMBERED');
    expect(logs[0].intervalBefore).toBe(0);
    expect(logs[0].intervalAfter).toBe(1);
    expect(logs[0].easeFactorBefore).toBeCloseTo(2.5, 2);
    expect(logs[0].easeFactorAfter).toBeCloseTo(2.6, 2);
    expect(logs[0].reviewDurationMs).toBe(4200);
  });
});
