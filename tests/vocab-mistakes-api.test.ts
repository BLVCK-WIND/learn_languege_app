import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getVocabHandler } from '../src/app/api/vocab/route';
import { DELETE as deleteVocabHandler } from '../src/app/api/vocab/[id]/route';
import { GET as getMistakesHandler } from '../src/app/api/mistakes/route';
import { DELETE as deleteMistakesHandler } from '../src/app/api/mistakes/[id]/route';
import { vocabService } from '../src/services/vocab.service';
import { mistakeService } from '../src/services/mistake.service';

describe('Vocab & Mistakes API Route Handlers (Unit & Contract)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET & DELETE /api/vocab', () => {
    it('handles GET /api/vocab with query parameters', async () => {
      const mockResult = {
        items: [
          {
            id: 'word_1',
            normalizedWord: 'resilient',
            pos: 'adj',
            ipa: '/rɪˈzɪl.jənt/',
            audioUrl: null,
            audioStatus: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date(),
            meanings: [{ id: 'm_1', meaningVi: 'kiên cường', context: null }],
            sentences: [],
            reviewState: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };

      const spy = vi.spyOn(vocabService, 'getVocabList').mockResolvedValue(mockResult);

      const req = new NextRequest('http://localhost/api/vocab?q=resilient&pos=adj&page=1&pageSize=20');
      const res = await getVocabHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.total).toBe(1);
      expect(json.data.items[0].normalizedWord).toBe('resilient');
      expect(spy).toHaveBeenCalledWith({
        search: 'resilient',
        pos: 'adj',
        page: 1,
        pageSize: 20,
      });
    });

    it('handles DELETE /api/vocab/[id] successfully when item exists', async () => {
      const spy = vi.spyOn(vocabService, 'softDeleteWord').mockResolvedValue(true);

      const req = new NextRequest('http://localhost/api/vocab/word_1', { method: 'DELETE' });
      const res = await deleteVocabHandler(req, { params: Promise.resolve({ id: 'word_1' }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(spy).toHaveBeenCalledWith('word_1');
    });

    it('returns 404 when DELETE /api/vocab/[id] targets non-existent item', async () => {
      vi.spyOn(vocabService, 'softDeleteWord').mockResolvedValue(false);

      const req = new NextRequest('http://localhost/api/vocab/non_existent', { method: 'DELETE' });
      const res = await deleteVocabHandler(req, { params: Promise.resolve({ id: 'non_existent' }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe('GET & DELETE /api/mistakes', () => {
    it('handles GET /api/mistakes with query parameters', async () => {
      const mockResult = {
        items: [
          {
            id: 'm_1',
            wrong: 'I have many homework.',
            correct: 'I have a lot of homework.',
            category: 'word-choice',
            subCategory: null,
            explanationVi: 'Homework là danh từ không đếm được.',
            createdAt: new Date(),
            updatedAt: new Date(),
            frequency: 2,
            reviewState: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };

      const spy = vi.spyOn(mistakeService, 'getMistakesList').mockResolvedValue(mockResult);

      const req = new NextRequest('http://localhost/api/mistakes?category=word-choice&page=1&pageSize=20');
      const res = await getMistakesHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.total).toBe(1);
      expect(json.data.items[0].frequency).toBe(2);
      expect(spy).toHaveBeenCalledWith({
        search: undefined,
        category: 'word-choice',
        page: 1,
        pageSize: 20,
      });
    });

    it('handles DELETE /api/mistakes/[id] successfully when item exists', async () => {
      const spy = vi.spyOn(mistakeService, 'softDeleteMistake').mockResolvedValue(true);

      const req = new NextRequest('http://localhost/api/mistakes/m_1', { method: 'DELETE' });
      const res = await deleteMistakesHandler(req, { params: Promise.resolve({ id: 'm_1' }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(spy).toHaveBeenCalledWith('m_1');
    });

    it('returns 404 when DELETE /api/mistakes/[id] targets non-existent item', async () => {
      vi.spyOn(mistakeService, 'softDeleteMistake').mockResolvedValue(false);

      const req = new NextRequest('http://localhost/api/mistakes/non_existent', { method: 'DELETE' });
      const res = await deleteMistakesHandler(req, { params: Promise.resolve({ id: 'non_existent' }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });
});
