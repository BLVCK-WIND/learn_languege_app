import { NextResponse } from 'next/server';
import { reviewService } from '@/services/review.service';

export async function GET() {
  try {
    const data = await reviewService.getDueReviewCards();
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching due review cards:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
