import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultImportService } from '../src/services/import.service';
import { hashPayload } from '../src/lib/crypto/hash';
import { getStudyDate } from '../src/lib/study-day';

describe('Import Engine - Two-pass Validation & Atomic Ingestion (docs/IMPORT_SPEC.md)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_import_test');
  const tempDbPath = path.join(tempDir, 'test_import.db');
  let testPrisma: PrismaClient;
  let testImportService: DefaultImportService;
  let validSampleRaw: string;

  beforeEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Initialize clean schema in temp SQLite database
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
    testImportService = new DefaultImportService(testPrisma);

    validSampleRaw = fs.readFileSync(
      path.join(process.cwd(), 'tests', 'fixtures', 'session_valid_sample.json'),
      'utf8'
    );
  });

  afterEach(async () => {
    await testPrisma.$disconnect();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('performs clean dry-run on valid fixture with correct diff summary', async () => {
    const report = await testImportService.dryRunImport(validSampleRaw);

    expect(report.isValid).toBe(true);
    expect(report.requiresUserAction).toBe(false);
    expect(report.summary.addedWordsCount).toBe(2);
    expect(report.summary.newSentencesCount).toBe(3);
    expect(report.summary.addedMistakesCount).toBe(2);
    expect(report.summary.mergedWordsCount).toBe(0);
    expect(report.summary.reappearedMistakesCount).toBe(0);
    expect(report.summary.errorCount).toBe(0);
    expect(report.pendingMappings).toHaveLength(0);
  });

  it('detects unknown fields and adds warnings without failing validation', async () => {
    const obj = JSON.parse(validSampleRaw);
    obj.words[0].difficulty = 'hard';
    obj.extraField = 'should-warn';

    const report = await testImportService.dryRunImport(JSON.stringify(obj));

    expect(report.isValid).toBe(true);
    expect(report.summary.warningCount).toBeGreaterThanOrEqual(2);
    expect(report.warnings.some((w) => w.path === '/extraField')).toBe(true);
    expect(report.warnings.some((w) => w.path === '/words/0/difficulty')).toBe(true);
  });

  it('detects unknown mistake categories and marks requiresUserAction: true', async () => {
    const obj = JSON.parse(validSampleRaw);
    obj.mistakes[0].category = 'wrong-verb-form'; // Mã lỗi lạ

    const report = await testImportService.dryRunImport(JSON.stringify(obj));

    expect(report.isValid).toBe(true);
    expect(report.requiresUserAction).toBe(true);
    expect(report.pendingMappings).toHaveLength(1);
    expect(report.pendingMappings[0].unknownCategory).toBe('wrong-verb-form');
    expect(report.pendingMappings[0].suggestedOptions.length).toBe(13);
  });

  it('detects session key conflict when week/day/seq already exists with different hash', async () => {
    // Commit valid session first
    await testImportService.commitImport(validSampleRaw);

    // Prepare different session with same week/day/seq
    const differentPayload = JSON.parse(validSampleRaw);
    differentPayload.words[0].word = 'innovate';
    const rawDifferent = JSON.stringify(differentPayload);

    const report = await testImportService.dryRunImport(rawDifferent);

    expect(report.isValid).toBe(true);
    expect(report.requiresUserAction).toBe(true);
    expect(report.sessionConflict).toBeDefined();
    expect(report.sessionConflict?.suggestedSeq).toBe(2);
  });

  it('commits session atomically and creates all related entities and review states', async () => {
    const result = await testImportService.commitImport(validSampleRaw);

    expect(result.status).toBe('SUCCESS');
    expect(result.stats.wordsCreated).toBe(2);
    expect(result.stats.sentencesCreated).toBe(3);
    expect(result.stats.mistakesCreated).toBe(2);
    expect(result.stats.sessionItemsCreated).toBe(4);
    expect(result.stats.reviewStatesCreated).toBe(4);

    // Verify DB integrity
    const batch = await testPrisma.importBatch.findUnique({
      where: { id: result.importBatchId },
    });
    expect(batch).toBeDefined();
    expect(batch?.contentHash).toBe(hashPayload(validSampleRaw));

    const session = await testPrisma.session.findUnique({
      where: { id: result.sessionId },
      include: { items: true },
    });
    expect(session).toBeDefined();
    expect(session?.items).toHaveLength(4);

    // Verify ReviewStates were initialized with current study date
    const reviewStates = await testPrisma.reviewState.findMany();
    expect(reviewStates).toHaveLength(4);
    const today = getStudyDate();
    for (const rs of reviewStates) {
      expect(rs.dueDate).toBe(today);
      expect(rs.repetitions).toBe(0);
      expect(rs.easeFactor).toBe(2.5);
      expect(rs.lastReviewedAt).toBeNull();
    }
  });

  it('enforces outer idempotency barrier: skips re-import of identical payload', async () => {
    const res1 = await testImportService.commitImport(validSampleRaw);
    expect(res1.status).toBe('SUCCESS');

    // Re-importing identical payload
    const res2 = await testImportService.commitImport(validSampleRaw);
    expect(res2.status).toBe('SKIPPED');
    expect(res2.stats.wordsCreated).toBe(0);
    expect(res2.stats.sentencesCreated).toBe(0);

    // Check that counts in DB did not increase
    const wordCount = await testPrisma.word.count();
    expect(wordCount).toBe(2);
  });

  it('merges existing words: adds new meanings and sentences without resetting SRS state', async () => {
    // 1. Initial import with achieve
    await testImportService.commitImport(validSampleRaw);

    // Tamper with SRS state of 'achieve' to verify it is NOT reset on merge
    const achieveWord = await testPrisma.word.findFirst({
      where: { normalizedWord: 'achieve' },
    });
    expect(achieveWord).toBeDefined();

    await testPrisma.reviewState.update({
      where: { itemType_itemId: { itemType: 'WORD', itemId: achieveWord!.id } },
      data: { interval: 10, repetitions: 3, easeFactor: 2.7 },
    });

    // 2. Second session (week 2, day 1) with achieve having an additional meaning and sentence
    const secondSessionPayload = {
      schemaVersion: 1,
      session: {
        week: 2,
        day: 1,
        seq: 1,
        checkpoint: 'Ôn tập và gộp từ',
      },
      words: [
        {
          word: 'achieve',
          pos: 'verb',
          ipa: '/əˈtʃiːv/',
          meanings: [
            'đạt được, giành được mục tiêu sau nhiều nỗ lực', // nghĩa cũ
            'hoàn thành xuất sắc', // nghĩa mới
          ],
          sentences: [
            {
              text: 'He achieved all his milestones ahead of schedule.', // câu mới
              translationVi: 'Anh ấy đã hoàn thành mọi cột mốc trước thời hạn.',
              targetForm: 'achieved',
            },
          ],
        },
      ],
      mistakes: [],
    };

    const res2 = await testImportService.commitImport(JSON.stringify(secondSessionPayload));

    expect(res2.status).toBe('SUCCESS');
    expect(res2.stats.wordsCreated).toBe(0);
    expect(res2.stats.wordsMerged).toBe(1);
    expect(res2.stats.sentencesCreated).toBe(1);

    // Verify SRS state was PRESERVED
    const srsState = await testPrisma.reviewState.findUnique({
      where: { itemType_itemId: { itemType: 'WORD', itemId: achieveWord!.id } },
    });
    expect(srsState?.interval).toBe(10);
    expect(srsState?.repetitions).toBe(3);
    expect(srsState?.easeFactor).toBe(2.7);

    // Verify WordMeaning count increased to 2
    const meanings = await testPrisma.wordMeaning.findMany({
      where: { wordId: achieveWord!.id },
    });
    expect(meanings).toHaveLength(2);

    // Verify Sentence count increased to 3 (2 from session 1 + 1 from session 2)
    const sentences = await testPrisma.sentence.findMany({
      where: { wordId: achieveWord!.id },
    });
    expect(sentences).toHaveLength(3);

    // Verify SessionItem in second session has role REAPPEARED
    const secondSessionItem = await testPrisma.sessionItem.findFirst({
      where: {
        sessionId: res2.sessionId,
        itemId: achieveWord!.id,
      },
    });
    expect(secondSessionItem?.role).toBe('REAPPEARED');
  });

  it('safely deduplicates identical mistakes within same payload preventing unique constraint crashes', async () => {
    const payload = JSON.parse(validSampleRaw);
    // Duplicate the first mistake exactly
    payload.mistakes.push({ ...payload.mistakes[0] });

    // Dry-run should report skipped mistake
    const dryRun = await testImportService.dryRunImport(JSON.stringify(payload));
    expect(dryRun.isValid).toBe(true);
    expect(dryRun.summary.skippedMistakesCount).toBe(1);

    // Commit should succeed without SQL constraint crash
    const res = await testImportService.commitImport(JSON.stringify(payload));
    expect(res.status).toBe('SUCCESS');
    expect(res.stats.mistakesCreated).toBe(2); // Only 2 distinct mistakes created
  });

  it('applies categoryMappings on unknown categories during commit', async () => {
    const payload = JSON.parse(validSampleRaw);
    payload.mistakes[0].category = 'verb-form-error'; // Mã lỗi lạ

    const res = await testImportService.commitImport(JSON.stringify(payload), {
      categoryMappings: {
        'verb-form-error': 'verb-pattern',
      },
    });

    expect(res.status).toBe('SUCCESS');
    const createdMistake = await testPrisma.mistake.findFirst({
      where: { wrong: payload.mistakes[0].wrong },
    });
    expect(createdMistake?.category).toBe('verb-pattern');
  });
});
