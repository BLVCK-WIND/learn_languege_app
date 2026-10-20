import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

/**
 * Biểu thức chính quy kiểm tra định dạng tên file nghiêm ngặt theo docs/AUDIO_SUBSYSTEM.md Mục 6.2:
 * 64 ký tự hex chữ thường (SHA-256) + đuôi '.mp3'
 * Ngăn chặn 100% tấn công Path Traversal
 */
export const VALID_AUDIO_FILENAME_REGEX = /^[a-f0-9]{64}\.mp3$/;

type RouteContext = {
  params: Promise<{ filename: string }> | { filename: string };
};

/**
 * GET /api/audio/[filename]
 * Phục vụ stream audio mp3 cục bộ từ thư mục data/audio/
 * - Phòng chống Path Traversal qua regex
 * - Hỗ trợ HTTP Range Requests (206 Partial Content) để tua và phát âm tức thì
 * - Header Cache-Control dài hạn (bất biến theo hash)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const params = await context.params;
    const filename = params?.filename;

    // 1. Kiểm tra regex chống Path Traversal
    if (!filename || !VALID_AUDIO_FILENAME_REGEX.test(filename)) {
      return new Response('Tên file âm thanh không hợp lệ', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 2. Xác định đường dẫn file trong data/audio/
    const audioDir = path.join(process.cwd(), 'data', 'audio');
    const filePath = path.join(audioDir, filename);

    // 3. Kiểm tra file tồn tại trên đĩa
    if (!fs.existsSync(filePath)) {
      return new Response('File âm thanh không tồn tại', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;

    // 4. Xử lý HTTP Range Request (bytes=start-end)
    const rangeHeader = request.headers.get('range');

    if (rangeHeader && rangeHeader.startsWith('bytes=')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] && parts[1].trim().length > 0 ? parseInt(parts[1], 10) : fileSize - 1;

      // Kiểm tra tính hợp lệ của dải byte
      if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(nodeStream);

      return new Response(webStream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 5. Trả về toàn bộ file (HTTP 200 OK) khi không có header Range
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as any, {
      status: 200,
      headers: {
        'Content-Length': String(fileSize),
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (_error) {
    return new Response('Lỗi máy chủ khi đọc file âm thanh', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
