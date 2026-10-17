import { NextResponse } from 'next/server';
import { vocabService } from '@/services/vocab.service';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing word ID' },
        { status: 400 }
      );
    }

    const deleted = await vocabService.softDeleteWord(id);
    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error: 'Từ vựng không tồn tại hoặc đã được xóa mềm trước đó',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa mềm từ vựng thành công',
    });
  } catch (error) {
    console.error('Error soft-deleting word:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
