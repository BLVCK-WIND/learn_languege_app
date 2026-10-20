import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultAnalyticsService } from '../src/services/analytics.service';

describe('AnalyticsService - Dashboard Metrics & SessionItem Aggregations (Task 3.2)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_analytics_test');
  const tempDbPath = path.join(tempDir, 'test_analytics.db');
  let testPrisma: PrismaClient;
  let analyticsService: DefaultAnalyticsService;

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
    analyticsService = new DefaultAnalyticsService(testPrisma);
  });

  afterEach(async () => {
    await testPrisma.$disconnect();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns clean zero summary when database has no records', async () => {
    const summary = await analyticsService.getDashboardSummary();
    expect(summary.totalWords).toBe(0);
    expect(summary.totalMistakesCount).toBe(0);
    expect(summary.totalMistakeOccurrences).toBe(0);
    expect(summary.totalSessions).toBe(0);
    expect(summary.topCategories).toEqual([]);
    expect(summary.topMistakes).toEqual([]);
    expect(summary.weeklyTrends).toEqual([]);
    expect(summary.recentMistakes).toEqual([]);
  });

  it('aggregates mistake frequencies via SessionItem records, NOT Mistake rows (ADR Specification)', async () => {
    // 1. Create 3 Sessions across Week 1 and Week 2
    const sessionW1 = await testPrisma.session.create({
      data: {
        week: 1,
        day: 1,
        seq: 1,
        checkpoint: 'Tuần 1 Buổi 1',
        studiedAt: new Date('2026-10-01T08:00:00Z'),
      },
    });

    const sessionW2A = await testPrisma.session.create({
      data: {
        week: 2,
        day: 1,
        seq: 1,
        checkpoint: 'Tuần 2 Buổi 1',
        studiedAt: new Date('2026-10-08T08:00:00Z'),
      },
    });

    const sessionW2B = await testPrisma.session.create({
      data: {
        week: 2,
        day: 2,
        seq: 1,
        checkpoint: 'Tuần 2 Buổi 2',
        studiedAt: new Date('2026-10-09T08:00:00Z'),
      },
    });

    // 2. Create 3 Mistakes with unique contentHash
    const mistakePlural = await testPrisma.mistake.create({
      data: {
        wrong: 'two book',
        correct: 'two books',
        category: 'plural-s',
        explanationVi: 'Danh từ số nhiều thêm s.',
        contentHash: 'hash-plural',
      },
    });

    const mistakeTense = await testPrisma.mistake.create({
      data: {
        wrong: 'I go yesterday',
        correct: 'I went yesterday',
        category: 'tense',
        explanationVi: 'Thì quá khứ đơn.',
        contentHash: 'hash-tense',
      },
    });

    const mistakePrep = await testPrisma.mistake.create({
      data: {
        wrong: 'in Monday',
        correct: 'on Monday',
        category: 'preposition',
        explanationVi: 'Thứ trong tuần dùng on.',
        contentHash: 'hash-prep',
      },
    });

    // Also seed a Word
    await testPrisma.word.create({
      data: {
        normalizedWord: 'achieve',
        pos: 'verb',
      },
    });

    // 3. Link SessionItems (ItemType = MISTAKE):
    // - mistakePlural appears 3 times (W1, W2A, W2B)
    // - mistakeTense appears 2 times (W1, W2A)
    // - mistakePrep appears 1 time (W1)
    await testPrisma.sessionItem.createMany({
      data: [
        { sessionId: sessionW1.id, itemType: 'MISTAKE', itemId: mistakePlural.id, role: 'INTRODUCED' },
        { sessionId: sessionW2A.id, itemType: 'MISTAKE', itemId: mistakePlural.id, role: 'REAPPEARED' },
        { sessionId: sessionW2B.id, itemType: 'MISTAKE', itemId: mistakePlural.id, role: 'REAPPEARED' },

        { sessionId: sessionW1.id, itemType: 'MISTAKE', itemId: mistakeTense.id, role: 'INTRODUCED' },
        { sessionId: sessionW2A.id, itemType: 'MISTAKE', itemId: mistakeTense.id, role: 'REAPPEARED' },

        { sessionId: sessionW1.id, itemType: 'MISTAKE', itemId: mistakePrep.id, role: 'INTRODUCED' },
      ],
    });

    // 4. Retrieve dashboard analytics summary
    const summary = await analyticsService.getDashboardSummary();

    // Metric cards
    expect(summary.totalWords).toBe(1);
    expect(summary.totalMistakesCount).toBe(3);
    expect(summary.totalMistakeOccurrences).toBe(6); // 3 + 2 + 1 = 6 SessionItems
    expect(summary.totalSessions).toBe(3);

    // Top Categories:
    // #1 plural-s: 3 (50%)
    // #2 tense: 2 (33.3%)
    // #3 preposition: 1 (16.7%)
    expect(summary.topCategories).toHaveLength(3);
    expect(summary.topCategories[0].category).toBe('plural-s');
    expect(summary.topCategories[0].count).toBe(3);
    expect(summary.topCategories[0].percentage).toBe(50);

    expect(summary.topCategories[1].category).toBe('tense');
    expect(summary.topCategories[1].count).toBe(2);
    expect(summary.topCategories[1].percentage).toBe(33.3);

    expect(summary.topCategories[2].category).toBe('preposition');
    expect(summary.topCategories[2].count).toBe(1);
    expect(summary.topCategories[2].percentage).toBe(16.7);

    // Top Mistakes:
    // #1 mistakePlural: frequency = 3
    // #2 mistakeTense: frequency = 2
    // #3 mistakePrep: frequency = 1
    expect(summary.topMistakes).toHaveLength(3);
    expect(summary.topMistakes[0].mistakeId).toBe(mistakePlural.id);
    expect(summary.topMistakes[0].frequency).toBe(3);
    expect(summary.topMistakes[1].mistakeId).toBe(mistakeTense.id);
    expect(summary.topMistakes[1].frequency).toBe(2);
    expect(summary.topMistakes[2].mistakeId).toBe(mistakePrep.id);
    expect(summary.topMistakes[2].frequency).toBe(1);

    // Weekly Trends:
    // Week 1: 3 mistakes (sessionW1 had plural, tense, prep)
    // Week 2: 3 mistakes (sessionW2A had plural, tense; sessionW2B had plural)
    expect(summary.weeklyTrends).toHaveLength(2);
    expect(summary.weeklyTrends[0].week).toBe(1);
    expect(summary.weeklyTrends[0].totalMistakes).toBe(3);
    expect(summary.weeklyTrends[0].categoryBreakdown['plural-s']).toBe(1);
    expect(summary.weeklyTrends[0].categoryBreakdown['tense']).toBe(1);
    expect(summary.weeklyTrends[0].categoryBreakdown['preposition']).toBe(1);

    expect(summary.weeklyTrends[1].week).toBe(2);
    expect(summary.weeklyTrends[1].totalMistakes).toBe(3);
    expect(summary.weeklyTrends[1].categoryBreakdown['plural-s']).toBe(2);
    expect(summary.weeklyTrends[1].categoryBreakdown['tense']).toBe(1);

    // Recent Mistakes:
    // Sorted by most recent sessions (Week 2 before Week 1)
    expect(summary.recentMistakes.length).toBeGreaterThanOrEqual(2);
    expect(summary.recentMistakes[0].id).toBe(mistakePlural.id);
    expect(summary.recentMistakes[0].week).toBe(2);
  });
});
