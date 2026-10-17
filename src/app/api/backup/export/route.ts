import { NextResponse } from 'next/server';
import { backupService } from '@/services/backup.service';

export async function GET() {
  try {
    const backupData = await backupService.exportDatabaseToJson();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `learn_language_backup_${timestamp}.json`;

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting database backup:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
