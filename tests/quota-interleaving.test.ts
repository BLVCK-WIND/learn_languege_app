import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { getStudyDate } from '@/lib/study-day';
import { DefaultReviewService } from '@/services/review.service';
import { DefaultQuotaService } from '@/services/quota.service';

describe('Study Quota & Interleaving Integration (Task 2b.5)', () => {
  let testPrisma: PrismaClient;
  let reviewService: DefaultReviewService;
  let quotaService: DefaultQuotaService;
  let tempDbPath: string;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(
      process.cwd(),
      'tests',
      'fixtures',
      `temp_quota_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    );
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
    quotaService = new DefaultQuotaService(testPrisma);
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

  it('DefaultQuotaService initializes with standard defaults and allows updates', async () => {
    const config = await quotaService.getQuotaConfig();
    expect(config.maxNewWordsPerDay).toBe(10);
    expect(config.maxNewMistakesPerDay).toBe(5);
    expect(config.maxReviewWordsPerDay).toBe(50);
    expect(config.maxReviewMistakesPerDay).toBe(30);

    const updated = await quotaService.updateQuotaConfig({
      maxNewWordsPerDay: 15,
      maxNewMistakesPerDay: 8,
    });
    expect(updated.maxNewWordsPerDay).toBe(15);
    expect(updated.maxNewMistakesPerDay).toBe(8);
  });

  it('applies daily quota limits and interleaves cards 2 Words : 1 Mistake', async () => {
    const fixedNow = new Date('2026-10-18T10:00:00.000Z');
    const todayStudyDate = getStudyDate(fixedNow);

    // Set quota: 4 new words, 2 new mistakes
    await quotaService.updateQuotaConfig({
      maxNewWordsPerDay: 4,
      maxNewMistakesPerDay: 2,
    });

    // Create 6 new words (more than quota 4)
    for (let i = 1; i <= 6; i++) {
      const w = await testPrisma.word.create({
        data: {
          normalizedWord: `word-${i}`,
          pos: 'noun',
          meanings: { create: [{ meaningVi: `nghĩa ${i}` }] },
        },
      });
      await testPrisma.reviewState.create({
        data: {
          itemType: 'WORD',
          itemId: w.id,
          dueDate: todayStudyDate,
          interval: 0,
          easeFactor: 2.5,
          lastReviewedAt: null, // New card
        },
      });
    }

    // Create 4 new mistakes (more than quota 2)
    for (let i = 1; i <= 4; i++) {
      const m = await testPrisma.mistake.create({
        data: {
          wrong: `wrong sentence ${i}`,
          correct: `correct sentence ${i}`,
          category: 'grammar',
          explanationVi: `giải thích ${i}`,
          contentHash: `hash-mistake-quota-${i}`,
        },
      });
      await testPrisma.reviewState.create({
        data: {
          itemType: 'MISTAKE',
          itemId: m.id,
          dueDate: todayStudyDate,
          interval: 0,
          easeFactor: 2.5,
          lastReviewedAt: null, // New card
        },
      });
    }

    // Initialize session
    const session = await reviewService.getOrCreateActiveSession(fixedNow);

    // Check quota summary: 4 words and 2 mistakes selected
    expect(session.quotaSummary).toBeDefined();
    expect(session.quotaSummary?.newWords).toBe(4);
    expect(session.quotaSummary?.newMistakes).toBe(2);
    expect(session.count).toBe(6); // 4 + 2

    // Check interleaving pattern: [WORD, WORD, MISTAKE, WORD, WORD, MISTAKE]
    const types = session.cards.map((c) => c.itemType);
    expect(types).toEqual(['WORD', 'WORD', 'MISTAKE', 'WORD', 'WORD', 'MISTAKE']);
  });
});
