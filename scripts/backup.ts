import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Creates an SQLite database backup using VACUUM INTO outside of transactions.
 * Follows the spec in docs/TECH_STACK.md Section 7.
 */
export function createDatabaseBackup(
  prefix: string = 'backup',
  customDbPath?: string,
  customBackupDir?: string
): string {
  const dbPath = customDbPath ?? path.join(process.cwd(), 'data', 'app.db');
  const backupDir = customBackupDir ?? path.join(process.cwd(), 'data', 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found at: ${dbPath}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `${prefix}_${timestamp}.db`);

  const db = new Database(dbPath);
  try {
    // Execute VACUUM INTO directly outside of any transaction
    db.prepare('VACUUM INTO ?').run(backupFile);
  } finally {
    db.close();
  }

  return backupFile;
}

/**
 * Enforces the retention policy defined in docs/TECH_STACK.md Section 7.2:
 * - Keeps standard daily backups within retentionDays (default: 14 days).
 * - PERMANENT RETENTION: Keeps all pre_migration_* backups forever.
 * - PERMANENT RETENTION: Keeps monthly snapshots from day 1 of each month.
 */
export function cleanupOldBackups(
  retentionDays: number = 14,
  customBackupDir?: string
): string[] {
  const backupDir = customBackupDir ?? path.join(process.cwd(), 'data', 'backups');
  if (!fs.existsSync(backupDir)) return [];

  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const deletedFiles: string[] = [];

  const files = fs.readdirSync(backupDir);
  for (const file of files) {
    if (!file.endsWith('.db')) continue;

    // Pre-migration backups are stored permanently
    if (file.startsWith('pre_migration_')) continue;

    // Monthly snapshot on day 1 of each month is retained permanently
    if (/_\d{4}-\d{2}-01T/.test(file)) continue;

    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filePath);
      deletedFiles.push(file);
    }
  }

  return deletedFiles;
}

// Support CLI execution via `npx tsx scripts/backup.ts`
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].replace(/\\/g, '/').endsWith('scripts/backup.ts'));

if (isDirectExecution) {
  try {
    const backupPath = createDatabaseBackup('manual');
    console.log(`[Backup] Successfully created database backup at: ${backupPath}`);
    const cleaned = cleanupOldBackups();
    if (cleaned.length > 0) {
      console.log(`[Backup] Cleaned up ${cleaned.length} old backup(s): ${cleaned.join(', ')}`);
    }
  } catch (error) {
    console.error('[Backup] Failed to create backup:', error);
    process.exit(1);
  }
}
