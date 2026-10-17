import { NextResponse } from 'next/server';
import { reviewService } from '@/services/review.service';
import type { Rating } from '@/lib/srs/scheduler';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reviewStateId, rating, reviewDurationMs, sessionId } = body;

    if (!reviewStateId || typeof reviewStateId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'reviewStateId is required' },
        { status: 400 }
      );
    }

    const validRatings: Rating[] = ['FORGOTTEN', 'HARD', 'REMEMBERED'];
    if (!rating || !validRatings.includes(rating as Rating)) {
      return NextResponse.json(
        { success: false, error: 'rating must be FORGOTTEN, HARD, or REMEMBERED' },
        { status: 400 }
      );
    }

    const updated = await reviewService.submitCardReview({
      reviewStateId,
      rating,
      reviewDurationMs: typeof reviewDurationMs === 'number' ? reviewDurationMs : 0,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('Error submitting review card:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
