import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as dueHandler } from '../src/app/api/review/due/route';
import { POST as submitHandler } from '../src/app/api/review/submit/route';
import { reviewService } from '../src/services/review.service';

describe('Review API Route Handlers (Contract & Validation)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles GET /api/review/due successfully', async () => {
    const mockData = {
      studyDate: '2026-10-18',
      count: 1,
      cards: [
        {
          reviewStateId: 'rs_1',
          itemType: 'WORD' as const,
          itemId: 'w_1',
          interval: 0,
          easeFactor: 2.5,
          repetitions: 0,
          lapseCount: 0,
          dueDate: '2026-10-18',
          wordContent: {
            normalizedWord: 'achieve',
            pos: 'verb',
            ipa: '/əˈtʃiːv/',
            meanings: ['đạt được'],
            exampleSentence: null,
          },
        },
      ],
    };

    const spy = vi.spyOn(reviewService, 'getDueReviewCards').mockResolvedValue(mockData);

    const res = await dueHandler();
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.count).toBe(1);
    expect(json.data.cards[0].wordContent.normalizedWord).toBe('achieve');
    expect(spy).toHaveBeenCalled();
  });

  it('handles POST /api/review/submit with valid rating', async () => {
    const mockUpdated = {
      id: 'rs_1',
      itemType: 'WORD',
      itemId: 'w_1',
      interval: 1,
      easeFactor: 2.6,
      repetitions: 1,
      lapseCount: 0,
      dueDate: '2026-10-19',
      lastReviewedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const spy = vi.spyOn(reviewService, 'submitCardReview').mockResolvedValue(mockUpdated as any);

    const req = new NextRequest('http://localhost/api/review/submit', {
      method: 'POST',
      body: JSON.stringify({
        reviewStateId: 'rs_1',
        rating: 'REMEMBERED',
        reviewDurationMs: 2500,
      }),
    });

    const res = await submitHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.interval).toBe(1);
    expect(spy).toHaveBeenCalledWith({
      reviewStateId: 'rs_1',
      rating: 'REMEMBERED',
      reviewDurationMs: 2500,
    });
  });

  it('rejects POST /api/review/submit with invalid rating or missing reviewStateId', async () => {
    // Missing reviewStateId
    const req1 = new NextRequest('http://localhost/api/review/submit', {
      method: 'POST',
      body: JSON.stringify({ rating: 'REMEMBERED' }),
    });
    const res1 = await submitHandler(req1);
    expect(res1.status).toBe(400);

    // Invalid rating
    const req2 = new NextRequest('http://localhost/api/review/submit', {
      method: 'POST',
      body: JSON.stringify({ reviewStateId: 'rs_1', rating: 'INVALID_RATING' }),
    });
    const res2 = await submitHandler(req2);
    expect(res2.status).toBe(400);
  });
});
