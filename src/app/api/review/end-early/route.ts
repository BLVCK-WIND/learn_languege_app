import { NextResponse } from 'next/server';
import { reviewService } from '@/services/review.service';

export async function POST(request: Request) {
  try {
    let sessionId: string | undefined;
    try {
      const body = await request.json();
      sessionId = body?.sessionId;
    } catch {
      // Body can be empty
    }

    const result = await reviewService.endSessionEarly(sessionId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error ending review session early:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
