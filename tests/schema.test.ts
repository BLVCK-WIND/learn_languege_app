import { describe, it, expect } from 'vitest';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';

describe('Prisma Schema & Client Verification', () => {
  it('exposes all 11 model delegates on PrismaClient with PrismaBetterSqlite3 adapter', () => {
    const adapter = new PrismaBetterSqlite3({ url: ':memory:' });
    const prisma = new PrismaClient({ adapter });

    expect(prisma.importBatch).toBeDefined();
    expect(prisma.session).toBeDefined();
    expect(prisma.sessionItem).toBeDefined();
    expect(prisma.word).toBeDefined();
    expect(prisma.wordMeaning).toBeDefined();
    expect(prisma.sentence).toBeDefined();
    expect(prisma.mistake).toBeDefined();
    expect(prisma.reviewState).toBeDefined();
    expect(prisma.reviewLog).toBeDefined();
    expect(prisma.reviewSession).toBeDefined();
    expect(prisma.studyQuotaConfig).toBeDefined();
  });
});
