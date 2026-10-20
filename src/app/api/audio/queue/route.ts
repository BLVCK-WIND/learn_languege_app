import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { audioQueue, type AudioItemType } from '@/lib/audio/queue';
import { runAudioRecovery } from '@/services/audio-recovery.service';

/**
 * GET /api/audio/queue
 * Phục vụ polling tiến độ mỗi 2 giây theo docs/AUDIO_SUBSYSTEM.md Mục 5.1
 */
export async function GET() {
  try {
    const queueStatus = audioQueue.getStatus();

    const [
      pendingWords,
      processingWords,
      readyWords,
      failedWords,
      pendingSentences,
      processingSentences,
      readySentences,
      failedSentences,
    ] = await Promise.all([
      prisma.word.count({ where: { audioStatus: 'PENDING', deletedAt: null } }),
      prisma.word.count({ where: { audioStatus: 'PROCESSING', deletedAt: null } }),
      prisma.word.count({ where: { audioStatus: 'READY', deletedAt: null } }),
      prisma.word.count({ where: { audioStatus: 'FAILED', deletedAt: null } }),
      prisma.sentence.count({ where: { audioStatus: 'PENDING', deletedAt: null } }),
      prisma.sentence.count({ where: { audioStatus: 'PROCESSING', deletedAt: null } }),
      prisma.sentence.count({ where: { audioStatus: 'READY', deletedAt: null } }),
      prisma.sentence.count({ where: { audioStatus: 'FAILED', deletedAt: null } }),
    ]);

    return NextResponse.json({
      isProcessing: queueStatus.isProcessing,
      queueLength: queueStatus.queueLength,
      activeItem: queueStatus.activeItem,
      counts: {
        pending: pendingWords + pendingSentences,
        processing: processingWords + processingSentences,
        ready: readyWords + readySentences,
        failed: failedWords + failedSentences,
        words: {
          pending: pendingWords,
          processing: processingWords,
          ready: readyWords,
          failed: failedWords,
        },
        sentences: {
          pending: pendingSentences,
          processing: processingSentences,
          ready: readySentences,
          failed: failedSentences,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Lỗi lấy thông tin hàng đợi âm thanh' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audio/queue
 * Tuyến 2: Tiếp nhận yêu cầu tải ưu tiên on-demand (priority bump), retry, hoặc enqueue toàn bộ pending
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, itemType, itemId } = body as {
      action: 'priority' | 'retry' | 'enqueue-all-pending';
      itemType?: AudioItemType;
      itemId?: string;
    };

    if (action === 'enqueue-all-pending') {
      const recovery = await runAudioRecovery(prisma, audioQueue);
      return NextResponse.json({
        success: true,
        message: 'Đã nạp toàn bộ các mục pending vào hàng đợi',
        recovery,
      });
    }

    if (!itemType || !itemId) {
      return NextResponse.json(
        { error: 'Thiếu tham số itemType hoặc itemId bắt buộc' },
        { status: 400 }
      );
    }

    if (itemType !== 'WORD' && itemType !== 'SENTENCE') {
      return NextResponse.json(
        { error: "itemType chỉ được phép là 'WORD' hoặc 'SENTENCE'" },
        { status: 400 }
      );
    }

    // 1. Thao tác 'priority' (Tuyến 2: On-demand priority bump)
    if (action === 'priority') {
      if (itemType === 'WORD') {
        const word = await prisma.word.findUnique({
          where: { id: itemId },
          select: { id: true, normalizedWord: true, audioAttempts: true, audioStatus: true },
        });

        if (!word) {
          return NextResponse.json({ error: 'Không tìm thấy từ vựng' }, { status: 404 });
        }

        audioQueue.enqueue({
          itemType: 'WORD',
          itemId: word.id,
          text: word.normalizedWord,
          priority: 'HIGH',
          attempts: word.audioAttempts,
        });
      } else {
        const sentence = await prisma.sentence.findUnique({
          where: { id: itemId },
          select: { id: true, text: true, audioAttempts: true, audioStatus: true },
        });

        if (!sentence) {
          return NextResponse.json({ error: 'Không tìm thấy câu ví dụ' }, { status: 404 });
        }

        audioQueue.enqueue({
          itemType: 'SENTENCE',
          itemId: sentence.id,
          text: sentence.text,
          priority: 'HIGH',
          attempts: sentence.audioAttempts,
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Đã đẩy mục lên đầu hàng đợi ưu tiên',
      });
    }

    // 2. Thao tác 'retry' (Thử lại khi audioStatus === 'FAILED')
    if (action === 'retry') {
      const now = new Date();
      if (itemType === 'WORD') {
        const word = await prisma.word.update({
          where: { id: itemId },
          data: {
            audioStatus: 'PENDING',
            audioAttempts: 0,
            audioUpdatedAt: now,
          },
          select: { id: true, normalizedWord: true },
        });

        audioQueue.enqueue({
          itemType: 'WORD',
          itemId: word.id,
          text: word.normalizedWord,
          priority: 'HIGH',
          attempts: 0,
        });
      } else {
        const sentence = await prisma.sentence.update({
          where: { id: itemId },
          data: {
            audioStatus: 'PENDING',
            audioAttempts: 0,
            audioUpdatedAt: now,
          },
          select: { id: true, text: true },
        });

        audioQueue.enqueue({
          itemType: 'SENTENCE',
          itemId: sentence.id,
          text: sentence.text,
          priority: 'HIGH',
          attempts: 0,
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Đã đặt lại trạng thái và đưa vào hàng đợi ưu tiên',
      });
    }

    return NextResponse.json({ error: 'Thao tác action không hợp lệ' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Lỗi xử lý yêu cầu hàng đợi âm thanh' },
      { status: 500 }
    );
  }
}
