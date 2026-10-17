import { NextResponse } from 'next/server';
import { mistakeService } from '@/services/mistake.service';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Missing mistake ID' },
        { status: 400 }
      );
    }

    const deleted = await mistakeService.softDeleteMistake(id);
    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error: 'Lỗi sai không tồn tại hoặc đã được xóa mềm trước đó',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa mềm lỗi sai thành công',
    });
  } catch (error) {
    console.error('Error soft-deleting mistake:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
