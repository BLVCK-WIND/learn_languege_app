import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as exportHandler } from '../src/app/api/backup/export/route';
import { POST as restoreHandler } from '../src/app/api/backup/restore/route';
import { backupService } from '../src/services/backup.service';

describe('Backup API Route Handlers (Contract & Validation)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles GET /api/backup/export returning JSON with Content-Disposition', async () => {
    const mockBackup = {
      version: 1,
      exportedAt: '2026-10-18T10:00:00.000Z',
      data: {
        importBatches: [],
        studyQuotaConfigs: [],
        sessions: [],
        sessionItems: [],
        words: [],
        wordMeanings: [],
        sentences: [],
        mistakes: [],
        reviewStates: [],
        reviewLogs: [],
        reviewSessions: [],
      },
    };

    const spy = vi.spyOn(backupService, 'exportDatabaseToJson').mockResolvedValue(mockBackup);

    const res = await exportHandler();
    expect(res.status).toBe(200);

    const disposition = res.headers.get('Content-Disposition');
    expect(disposition).toContain('attachment; filename="learn_language_backup_');

    const json = await res.json();
    expect(json.version).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it('handles POST /api/backup/restore with valid JSON string', async () => {
    const mockSummary = {
      importBatchesCount: 1,
      studyQuotaConfigsCount: 1,
      sessionsCount: 1,
      sessionItemsCount: 2,
      wordsCount: 2,
      wordMeaningsCount: 2,
      sentencesCount: 2,
      mistakesCount: 1,
      reviewStatesCount: 3,
      reviewLogsCount: 1,
      reviewSessionsCount: 1,
      totalRecordsRestored: 16,
    };

    const spy = vi.spyOn(backupService, 'restoreDatabaseFromJson').mockResolvedValue(mockSummary);

    const req = new NextRequest('http://localhost/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify({ version: 1, exportedAt: '2026-10-18', data: {} }),
    });

    const res = await restoreHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.totalRecordsRestored).toBe(16);
    expect(spy).toHaveBeenCalled();
  });

  it('rejects POST /api/backup/restore with empty body', async () => {
    const req = new NextRequest('http://localhost/api/backup/restore', {
      method: 'POST',
      body: '   ',
    });

    const res = await restoreHandler(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
  });
});
