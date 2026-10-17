import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { POST as dryRunHandler } from '../src/app/api/import/dry-run/route';
import { POST as commitHandler } from '../src/app/api/import/commit/route';
import { prisma } from '../src/lib/prisma';

describe('Import Route Handlers (API Integration)', () => {
  let validSampleRaw: string;

  beforeEach(async () => {
    validSampleRaw = fs.readFileSync(
      path.join(process.cwd(), 'tests', 'fixtures', 'session_valid_sample.json'),
      'utf8'
    );
    // Clean test DB records
    await prisma.sessionItem.deleteMany();
    await prisma.reviewLog.deleteMany();
    await prisma.reviewState.deleteMany();
    await prisma.sentence.deleteMany();
    await prisma.wordMeaning.deleteMany();
    await prisma.word.deleteMany();
    await prisma.mistake.deleteMany();
    await prisma.session.deleteMany();
    await prisma.importBatch.deleteMany();
  });

  afterEach(async () => {
    await prisma.sessionItem.deleteMany();
    await prisma.reviewLog.deleteMany();
    await prisma.reviewState.deleteMany();
    await prisma.sentence.deleteMany();
    await prisma.wordMeaning.deleteMany();
    await prisma.word.deleteMany();
    await prisma.mistake.deleteMany();
    await prisma.session.deleteMany();
    await prisma.importBatch.deleteMany();
  });

  it('handles POST /api/import/dry-run successfully with valid JSON', async () => {
    const req = new NextRequest('http://localhost/api/import/dry-run', {
      method: 'POST',
      body: JSON.stringify({ rawPayload: validSampleRaw }),
    });

    const res = await dryRunHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isValid).toBe(true);
    expect(body.summary.addedWordsCount).toBe(2);
    expect(body.summary.addedMistakesCount).toBe(2);
  });

  it('rejects POST /api/import/dry-run when rawPayload is missing or non-string', async () => {
    const req = new NextRequest('http://localhost/api/import/dry-run', {
      method: 'POST',
      body: JSON.stringify({ rawPayload: 123 }),
    });

    const res = await dryRunHandler(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('rawPayload');
  });

  it('handles POST /api/import/commit and persists data to database', async () => {
    const req = new NextRequest('http://localhost/api/import/commit', {
      method: 'POST',
      body: JSON.stringify({ rawPayload: validSampleRaw }),
    });

    const res = await commitHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('SUCCESS');
    expect(body.stats.wordsCreated).toBe(2);
    expect(body.stats.mistakesCreated).toBe(2);

    // Verify DB
    const wordCount = await prisma.word.count();
    expect(wordCount).toBe(2);

    const mistakeCount = await prisma.mistake.count();
    expect(mistakeCount).toBe(2);
  });
});
