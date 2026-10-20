import { NextResponse } from 'next/server';
import { analyticsService } from '@/services/analytics.service';

export async function GET() {
  try {
    const data = await analyticsService.getDashboardSummary();
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching analytics dashboard:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
