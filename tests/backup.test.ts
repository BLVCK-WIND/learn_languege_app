import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { createDatabaseBackup, cleanupOldBackups } from '../scripts/backup';
import { DefaultBackupService } from '../src/services/backup.service';

describe('SQLite Backup & Retention Policy (VACUUM INTO)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_backup_test');
  const tempDbPath = path.join(tempDir, 'test_app.db');
  const tempBackupDir = path.join(tempDir, 'backups');

  beforeEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(tempBackupDir, { recursive: true });

    // Initialize temporary database with a test table and row
    const db = new Database(tempDbPath);
    db.exec(`
      CREATE TABLE test_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      INSERT INTO test_items (id, name) VALUES ('test_1', 'Antigravity');
    `);
    db.close();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates a valid database backup via VACUUM INTO with preserved data', () => {
    const backupFile = createDatabaseBackup('unit_test', tempDbPath, tempBackupDir);

    expect(fs.existsSync(backupFile)).toBe(true);
    expect(path.basename(backupFile).startsWith('unit_test_')).toBe(true);

    // Verify backup file is a valid SQLite DB containing the record
    const backupDb = new Database(backupFile);
    const row = backupDb.prepare('SELECT * FROM test_items WHERE id = ?').get('test_1') as {
      id: string;
      name: string;
    };
    expect(row).toBeDefined();
    expect(row.name).toBe('Antigravity');
    backupDb.close();
  });

  it('enforces retention policy: removes old backups but keeps pre_migration and monthly snapshots', () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);

    // 1. Regular old backup (should be cleaned)
    const oldRegularPath = path.join(tempBackupDir, 'daily_old.db');
    fs.writeFileSync(oldRegularPath, 'dummy sqlite content');
    fs.utimesSync(oldRegularPath, twentyDaysAgo, twentyDaysAgo);

    // 2. Pre-migration old backup (MUST BE PRESERVED)
    const oldPreMigrationPath = path.join(tempBackupDir, 'pre_migration_2026-09-01T12-00-00-000Z.db');
    fs.writeFileSync(oldPreMigrationPath, 'dummy pre migration');
    fs.utimesSync(oldPreMigrationPath, twentyDaysAgo, twentyDaysAgo);

    // 3. Monthly snapshot backup on 1st of month (MUST BE PRESERVED)
    const oldMonthlyPath = path.join(tempBackupDir, 'backup_2026-09-01T04-00-00-000Z.db');
    fs.writeFileSync(oldMonthlyPath, 'dummy monthly');
    fs.utimesSync(oldMonthlyPath, twentyDaysAgo, twentyDaysAgo);

    // 4. Fresh backup (should be kept)
    const freshPath = path.join(tempBackupDir, 'daily_fresh.db');
    fs.writeFileSync(freshPath, 'dummy fresh');

    const cleaned = cleanupOldBackups(14, tempBackupDir);

    expect(cleaned).toContain('daily_old.db');
    expect(fs.existsSync(oldRegularPath)).toBe(false);

    // Preserved files
    expect(fs.existsSync(oldPreMigrationPath)).toBe(true);
    expect(fs.existsSync(oldMonthlyPath)).toBe(true);
    expect(fs.existsSync(freshPath)).toBe(true);
  });
});

describe('JSON Full Database Backup & Round-trip Restore (Task 2a.4)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_json_backup_test');
  const tempDbPath = path.join(tempDir, 'test_json_backup.db');
  let testPrisma: PrismaClient;
  let backupService: DefaultBackupService;

  beforeEach(async () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Initialize temporary database with full schema
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
    backupService = new DefaultBackupService(testPrisma);
  });

  afterEach(async () => {
    await testPrisma.$disconnect();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('performs complete round-trip JSON backup & restore preserving 100% CUID2 IDs and polymorphic relations', async () => {
    // 1. Seed rich dataset spanning all core tables
    const config = await testPrisma.studyQuotaConfig.create({
      data: {
        id: 'default',
        maxNewWordsPerDay: 10,
        maxNewMistakesPerDay: 5,
        maxReviewWordsPerDay: 50,
        maxReviewMistakesPerDay: 30,
      },
    });

    const batch = await testPrisma.importBatch.create({
      data: {
        sessionWeek: 1,
        sessionDay: 1,
        seq: 1,
        contentHash: 'hash-roundtrip-batch',
        rawPayload: '{"dummy": true}',
        status: 'COMMITTED',
      },
    });

    const session = await testPrisma.session.create({
      data: {
        importBatchId: batch.id,
        week: 1,
        day: 1,
        seq: 1,
        checkpoint: 'Checkpoint Roundtrip',
        studiedAt: new Date('2026-10-18T10:00:00.000Z'),
      },
    });

    const word = await testPrisma.word.create({
      data: {
        normalizedWord: 'persevere',
        pos: 'verb',
        ipa: '/ˌpɜː.sɪˈvɪər/',
        meanings: {
          create: [{ meaningVi: 'kiên trì vượt qua khó khăn', context: 'học tập' }],
        },
        sentences: {
          create: [
            {
              text: 'You must persevere to achieve band 6.5.',
              targetForm: 'persevere',
              translationVi: 'Bạn phải kiên trì để đạt band 6.5.',
              contentHash: 'hash-sentence-roundtrip',
            },
          ],
        },
      },
    });

    const mistake = await testPrisma.mistake.create({
      data: {
        wrong: 'I am agree with you.',
        correct: 'I agree with you.',
        category: 'verb-pattern',
        explanationVi: 'Agree là động từ, không dùng với to be.',
        contentHash: 'hash-mistake-roundtrip',
      },
    });

    const sessionItemWord = await testPrisma.sessionItem.create({
      data: {
        sessionId: session.id,
        itemType: 'WORD',
        itemId: word.id,
        role: 'INTRODUCED',
      },
    });

    const sessionItemMistake = await testPrisma.sessionItem.create({
      data: {
        sessionId: session.id,
        itemType: 'MISTAKE',
        itemId: mistake.id,
        role: 'INTRODUCED',
      },
    });

    const wordReviewState = await testPrisma.reviewState.create({
      data: {
        itemType: 'WORD',
        itemId: word.id,
        interval: 4,
        easeFactor: 2.6,
        dueDate: '2026-10-22',
        repetitions: 2,
        lapseCount: 0,
        lastReviewedAt: new Date('2026-10-18T10:30:00.000Z'),
      },
    });

    const mistakeReviewState = await testPrisma.reviewState.create({
      data: {
        itemType: 'MISTAKE',
        itemId: mistake.id,
        interval: 1,
        easeFactor: 2.3,
        dueDate: '2026-10-19',
        repetitions: 1,
        lapseCount: 1,
        lastReviewedAt: new Date('2026-10-18T10:35:00.000Z'),
      },
    });

    const reviewLog = await testPrisma.reviewLog.create({
      data: {
        reviewStateId: wordReviewState.id,
        rating: 'REMEMBERED',
        intervalBefore: 1,
        intervalAfter: 4,
        easeFactorBefore: 2.5,
        easeFactorAfter: 2.6,
        reviewDurationMs: 3100,
        reviewedAt: new Date('2026-10-18T10:30:00.000Z'),
      },
    });

    const reviewSession = await testPrisma.reviewSession.create({
      data: {
        sessionDate: '2026-10-18',
        queueJson: '[]',
        status: 'COMPLETED',
        currentIndex: 2,
        completedCount: 2,
      },
    });

    // 2. Export database to JSON
    const exportedBackup = await backupService.exportDatabaseToJson();

    expect(exportedBackup.version).toBe(1);
    expect(exportedBackup.data.words).toHaveLength(1);
    expect(exportedBackup.data.mistakes).toHaveLength(1);
    expect(exportedBackup.data.sessions).toHaveLength(1);
    expect(exportedBackup.data.sessionItems).toHaveLength(2);
    expect(exportedBackup.data.reviewStates).toHaveLength(2);
    expect(exportedBackup.data.reviewLogs).toHaveLength(1);
    expect(exportedBackup.data.studyQuotaConfigs).toHaveLength(1);

    // 3. Wipe all tables in the database
    await testPrisma.reviewLog.deleteMany();
    await testPrisma.reviewSession.deleteMany();
    await testPrisma.reviewState.deleteMany();
    await testPrisma.sessionItem.deleteMany();
    await testPrisma.sentence.deleteMany();
    await testPrisma.wordMeaning.deleteMany();
    await testPrisma.word.deleteMany();
    await testPrisma.mistake.deleteMany();
    await testPrisma.session.deleteMany();
    await testPrisma.importBatch.deleteMany();
    await testPrisma.studyQuotaConfig.deleteMany();

    // Verify DB is completely empty
    expect(await testPrisma.word.count()).toBe(0);
    expect(await testPrisma.mistake.count()).toBe(0);
    expect(await testPrisma.reviewState.count()).toBe(0);

    // 4. Restore from JSON string
    const jsonString = JSON.stringify(exportedBackup, null, 2);
    const summary = await backupService.restoreDatabaseFromJson(jsonString);

    expect(summary.wordsCount).toBe(1);
    expect(summary.mistakesCount).toBe(1);
    expect(summary.sessionsCount).toBe(1);
    expect(summary.sessionItemsCount).toBe(2);
    expect(summary.reviewStatesCount).toBe(2);
    expect(summary.reviewLogsCount).toBe(1);
    expect(summary.totalRecordsRestored).toBeGreaterThan(10);

    // 5. Verify 100% integrity across all tables and polymorphic links
    const restoredWord = await testPrisma.word.findUnique({
      where: { id: word.id },
      include: { meanings: true, sentences: true },
    });
    expect(restoredWord).toBeDefined();
    expect(restoredWord?.id).toBe(word.id);
    expect(restoredWord?.normalizedWord).toBe('persevere');
    expect(restoredWord?.meanings).toHaveLength(1);
    expect(restoredWord?.meanings[0].meaningVi).toBe('kiên trì vượt qua khó khăn');
    expect(restoredWord?.sentences).toHaveLength(1);
    expect(restoredWord?.sentences[0].targetForm).toBe('persevere');

    const restoredMistake = await testPrisma.mistake.findUnique({
      where: { id: mistake.id },
    });
    expect(restoredMistake).toBeDefined();
    expect(restoredMistake?.id).toBe(mistake.id);
    expect(restoredMistake?.wrong).toBe('I am agree with you.');

    // Verify polymorphic ReviewStates intact
    const restoredWordRS = await testPrisma.reviewState.findUnique({
      where: { itemType_itemId: { itemType: 'WORD', itemId: word.id } },
    });
    expect(restoredWordRS).toBeDefined();
    expect(restoredWordRS?.id).toBe(wordReviewState.id);
    expect(restoredWordRS?.interval).toBe(4);
    expect(restoredWordRS?.easeFactor).toBeCloseTo(2.6, 2);

    const restoredMistakeRS = await testPrisma.reviewState.findUnique({
      where: { itemType_itemId: { itemType: 'MISTAKE', itemId: mistake.id } },
    });
    expect(restoredMistakeRS).toBeDefined();
    expect(restoredMistakeRS?.id).toBe(mistakeReviewState.id);
    expect(restoredMistakeRS?.lapseCount).toBe(1);

    // Verify polymorphic SessionItems intact
    const restoredSessionItems = await testPrisma.sessionItem.findMany();
    expect(restoredSessionItems).toHaveLength(2);
    expect(restoredSessionItems.some((si) => si.id === sessionItemWord.id && si.itemId === word.id)).toBe(true);
    expect(restoredSessionItems.some((si) => si.id === sessionItemMistake.id && si.itemId === mistake.id)).toBe(true);

    // Verify ReviewLog intact
    const restoredLogs = await testPrisma.reviewLog.findMany();
    expect(restoredLogs).toHaveLength(1);
    expect(restoredLogs[0].id).toBe(reviewLog.id);
    expect(restoredLogs[0].reviewStateId).toBe(wordReviewState.id);
    expect(restoredLogs[0].reviewDurationMs).toBe(3100);
  });

  it('rejects invalid or corrupted JSON gracefully', async () => {
    await expect(backupService.restoreDatabaseFromJson('invalid json string')).rejects.toThrow(
      'Chuỗi JSON sao lưu không hợp lệ'
    );

    await expect(
      backupService.restoreDatabaseFromJson(JSON.stringify({ version: 'one', data: {} }))
    ).rejects.toThrow('Dữ liệu sao lưu không đúng quy chuẩn');
  });
});

