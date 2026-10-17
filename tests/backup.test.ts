import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createDatabaseBackup, cleanupOldBackups } from '../scripts/backup';

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
