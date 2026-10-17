import { NextRequest, NextResponse } from 'next/server';
import { importService } from '@/services/import.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rawPayload, options } = body;

    if (typeof rawPayload !== 'string') {
      return NextResponse.json(
        { error: 'Trường rawPayload bắt buộc phải là chuỗi JSON.' },
        { status: 400 }
      );
    }

    const result = await importService.commitImport(rawPayload, options);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Lỗi xử lý Commit Import.' },
      { status: 500 }
    );
  }
}
