import { NextResponse } from 'next/server';
import { vocabService } from '@/services/vocab.service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q') || searchParams.get('search') || undefined;
    const pos = searchParams.get('pos') || undefined;
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    const pageSize = searchParams.get('pageSize')
      ? parseInt(searchParams.get('pageSize')!, 10)
      : 20;

    const result = await vocabService.getVocabList({
      search,
      pos,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching vocab list:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
