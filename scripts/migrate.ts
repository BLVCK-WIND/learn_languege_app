import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDatabaseBackup } from './backup';

export interface MigrationOptions {
  customDbPath?: string;
  skipBackup?: boolean;
}

/**
 * Migration wrapper that:
 * 1. Ensures target database directory exists.
 * 2. Automatically backs up the database using VACUUM INTO before migration.
 * 3. Runs pending Prisma migrations.
 * 4. Explicitly activates and verifies SQLite foreign keys (PRAGMA foreign_keys = ON).
 */
export async function runMigrations(options: MigrationOptions = {}): Promise<void> {
  const dbPath = options.customDbPath ?? path.join(process.cwd(), 'data', 'app.db');
  const dataDir = path.dirname(dbPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Step 1: Pre-migration backup if the DB already exists
  if (!options.skipBackup && fs.existsSync(dbPath)) {
    console.log('[Migration] Existing database detected. Creating pre-migration backup...');
    const backupFile = createDatabaseBackup('pre_migration', dbPath);
    console.log(`[Migration] Pre-migration backup created: ${backupFile}`);
  }

  // Step 2: Apply migrations via Prisma CLI
  console.log('[Migration] Applying pending migrations via Prisma CLI...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  // Step 3: Explicitly set PRAGMA foreign_keys = ON on connection
  if (fs.existsSync(dbPath)) {
    const rawDb = new Database(dbPath);
    try {
      rawDb.pragma('foreign_keys = ON;');
    } finally {
      rawDb.close();
    }
  }

  // Step 4: Verify foreign_keys = 1 via PrismaClient
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.$queryRawUnsafe<Array<{ foreign_keys: number | bigint }>>(
      'PRAGMA foreign_keys;'
    );

    const fkVal = result?.[0]?.foreign_keys;
    if (fkVal === undefined || Number(fkVal) !== 1) {
      throw new Error(`CRITICAL ERROR: PRAGMA foreign_keys via PrismaClient returned ${fkVal}, expected 1!`);
    }

    console.log('[Migration] PRAGMA foreign_keys verified successfully (foreign_keys = 1).');
  } finally {
    await prisma.$disconnect();
  }
}

// CLI execution support
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].replace(/\\/g, '/').endsWith('scripts/migrate.ts'));

if (isDirectExecution) {
  runMigrations()
    .then(() => {
      console.log('[Migration] Migration pipeline completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Migration] Migration pipeline failed:', error);
      process.exit(1);
    });
}
