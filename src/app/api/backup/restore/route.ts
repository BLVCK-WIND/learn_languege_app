import { NextResponse } from 'next/server';
import { backupService } from '@/services/backup.service';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!rawBody || !rawBody.trim()) {
      return NextResponse.json(
        { success: false, error: 'Dữ liệu JSON sao lưu không được để trống' },
        { status: 400 }
      );
    }

    const summary = await backupService.restoreDatabaseFromJson(rawBody);

    return NextResponse.json({
      success: true,
      message: 'Khôi phục toàn vẹn dữ liệu thành công',
      data: summary,
    });
  } catch (error) {
    console.error('Error restoring database backup:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
