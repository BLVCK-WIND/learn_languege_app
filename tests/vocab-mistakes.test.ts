import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { DefaultVocabService } from '../src/services/vocab.service';
import { DefaultMistakeService } from '../src/services/mistake.service';

describe('Vocab & Mistakes Services - Soft Delete & Frequency Specs (Task 2a.1)', () => {
  const tempDir = path.join(process.cwd(), 'tests', 'fixtures', 'temp_vocab_test');
  const tempDbPath = path.join(tempDir, 'test_vocab.db');
  let testPrisma: PrismaClient;
  let vocabService: DefaultVocabService;
  let mistakeService: DefaultMistakeService;

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
    vocabService = new DefaultVocabService(testPrisma);
    mistakeService = new DefaultMistakeService(testPrisma);
  });

  afterEach(async () => {
    await testPrisma.$disconnect();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('DefaultVocabService', () => {
    it('retrieves active words and excludes soft-deleted words (where: { deletedAt: null })', async () => {
      // Seed 2 words: 1 active, 1 soft-deleted
      const activeWord = await testPrisma.word.create({
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
                text: 'I will achieve 6.5 band.',
                targetForm: 'achieve',
                translationVi: 'Tôi sẽ đạt band 6.5.',
                contentHash: 'hash-achieve-1',
              },
            ],
          },
        },
      });

      const deletedWord = await testPrisma.word.create({
        data: {
          normalizedWord: 'abandon',
          pos: 'verb',
          deletedAt: new Date(),
          meanings: {
            create: [{ meaningVi: 'từ bỏ' }],
          },
        },
      });

      const list = await vocabService.getVocabList();
      expect(list.total).toBe(1);
      expect(list.items).toHaveLength(1);
      expect(list.items[0].id).toBe(activeWord.id);
      expect(list.items[0].normalizedWord).toBe('achieve');
      expect(list.items[0].meanings).toHaveLength(1);
      expect(list.items[0].sentences).toHaveLength(1);

      // Verify the deleted word is omitted
      expect(list.items.some((w) => w.id === deletedWord.id)).toBe(false);
    });

    it('cascades soft-delete to related meanings and sentences atomically', async () => {
      const word = await testPrisma.word.create({
        data: {
          normalizedWord: 'consistent',
          pos: 'adj',
          meanings: {
            create: [{ meaningVi: 'nhất quán' }],
          },
          sentences: {
            create: [
              {
                text: 'Consistent practice is key.',
                targetForm: 'Consistent',
                translationVi: 'Luyện tập nhất quán là chìa khóa.',
                contentHash: 'hash-consistent-1',
              },
            ],
          },
        },
      });

      const success = await vocabService.softDeleteWord(word.id);
      expect(success).toBe(true);

      // Verify word has deletedAt set
      const recheckWord = await testPrisma.word.findUnique({ where: { id: word.id } });
      expect(recheckWord?.deletedAt).not.toBeNull();

      // Verify meanings and sentences also have deletedAt set
      const recheckMeaning = await testPrisma.wordMeaning.findFirst({ where: { wordId: word.id } });
      expect(recheckMeaning?.deletedAt).not.toBeNull();

      const recheckSentence = await testPrisma.sentence.findFirst({ where: { wordId: word.id } });
      expect(recheckSentence?.deletedAt).not.toBeNull();

      // Verify it no longer appears in getVocabList
      const listAfter = await vocabService.getVocabList();
      expect(listAfter.total).toBe(0);
    });

    it('filters words by search keyword and POS correctly', async () => {
      await testPrisma.word.createMany({
        data: [
          { normalizedWord: 'adapt', pos: 'verb' },
          { normalizedWord: 'adaptation', pos: 'noun' },
          { normalizedWord: 'fluent', pos: 'adj' },
        ],
      });

      // Search keyword 'adapt'
      const searchRes = await vocabService.getVocabList({ search: 'adapt' });
      expect(searchRes.total).toBe(2);

      // Filter by POS 'verb'
      const posRes = await vocabService.getVocabList({ pos: 'verb' });
      expect(posRes.total).toBe(1);
      expect(posRes.items[0].normalizedWord).toBe('adapt');
    });
  });

  describe('DefaultMistakeService', () => {
    it('accurately counts mistake frequency based on SessionItem records (ADR Specification)', async () => {
      // 1. Create a session
      const session1 = await testPrisma.session.create({
        data: {
          week: 1,
          day: 1,
          seq: 1,
          checkpoint: 'Buổi 1',
          studiedAt: new Date(),
        },
      });

      const session2 = await testPrisma.session.create({
        data: {
          week: 1,
          day: 2,
          seq: 1,
          checkpoint: 'Buổi 2',
          studiedAt: new Date(),
        },
      });

      // 2. Create a mistake
      const mistake = await testPrisma.mistake.create({
        data: {
          wrong: 'I play game yesterday.',
          correct: 'I played games yesterday.',
          category: 'tense',
          explanationVi: 'Cần chia thì quá khứ đơn vì có yesterday.',
          contentHash: 'hash-mistake-1',
        },
      });

      // 3. Create 2 SessionItems linking to this same mistake (INTRODUCED in session1, REAPPEARED in session2)
      await testPrisma.sessionItem.createMany({
        data: [
          {
            sessionId: session1.id,
            itemType: 'MISTAKE',
            itemId: mistake.id,
            role: 'INTRODUCED',
          },
          {
            sessionId: session2.id,
            itemType: 'MISTAKE',
            itemId: mistake.id,
            role: 'REAPPEARED',
          },
        ],
      });

      const list = await mistakeService.getMistakesList();
      expect(list.total).toBe(1);
      expect(list.items[0].id).toBe(mistake.id);
      // Frequency must be 2 according to ADR (counting SessionItems, not Mistake rows)
      expect(list.items[0].frequency).toBe(2);
    });

    it('excludes soft-deleted mistakes and supports soft-delete & restore', async () => {
      const mistake = await testPrisma.mistake.create({
        data: {
          wrong: 'She don’t know.',
          correct: 'She doesn’t know.',
          category: 'subject-verb-agreement',
          explanationVi: 'Ngôi thứ 3 số ít dùng doesn’t.',
          contentHash: 'hash-mistake-2',
        },
      });

      let list = await mistakeService.getMistakesList();
      expect(list.total).toBe(1);

      // Soft delete
      const deleted = await mistakeService.softDeleteMistake(mistake.id);
      expect(deleted).toBe(true);

      list = await mistakeService.getMistakesList();
      expect(list.total).toBe(0);

      // Restore
      const restored = await mistakeService.restoreMistake(mistake.id);
      expect(restored).toBe(true);

      list = await mistakeService.getMistakesList();
      expect(list.total).toBe(1);
      expect(list.items[0].id).toBe(mistake.id);
    });

    it('filters mistakes by category and search keyword', async () => {
      await testPrisma.mistake.createMany({
        data: [
          {
            wrong: 'He like apple.',
            correct: 'He likes apples.',
            category: 'subject-verb-agreement',
            explanationVi: 'Chủ ngữ He chia động từ số ít.',
            contentHash: 'hash-sva',
          },
          {
            wrong: 'I have two cat.',
            correct: 'I have two cats.',
            category: 'plural-s',
            explanationVi: 'Danh từ số nhiều thêm s.',
            contentHash: 'hash-plural',
          },
        ],
      });

      const catRes = await mistakeService.getMistakesList({ category: 'plural-s' });
      expect(catRes.total).toBe(1);
      expect(catRes.items[0].category).toBe('plural-s');

      const searchRes = await mistakeService.getMistakesList({ search: 'apple' });
      expect(searchRes.total).toBe(1);
      expect(searchRes.items[0].wrong).toContain('apple');
    });
  });
});
