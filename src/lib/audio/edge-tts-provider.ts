import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EdgeTTS } from 'node-edge-tts';
import type { TtsProvider, TtsSynthesizeOptions } from './tts-provider';

/**
 * Các giá trị cấu hình mặc định bất biến theo docs/AUDIO_SUBSYSTEM.md
 */
export const DEFAULT_EDGE_VOICE = 'en-US-AriaNeural';
export const DEFAULT_EDGE_LANG = 'en-US';
export const DEFAULT_EDGE_TIMEOUT_MS = 10000;
export const MAX_TTS_TEXT_LENGTH = 300;

export interface EdgeTtsProviderConfig {
  defaultVoice?: string;
  defaultLang?: string;
  defaultTimeoutMs?: number;
}

/**
 * Hiện thực TtsProvider sử dụng thư viện node-edge-tts
 * - Bắt buộc ghi đè voice 'en-US-AriaNeural' và lang 'en-US'
 * - Thực hiện ghi nguyên tử (Atomic File Write): ghi ra .tmp trước, sau đó đổi tên sang file .mp3
 * - Dọn dẹp file tạm .tmp nếu xảy ra sự cố (mất mạng, timeout, WSS error)
 */
export class EdgeTtsProvider implements TtsProvider {
  private readonly defaultVoice: string;
  private readonly defaultLang: string;
  private readonly defaultTimeoutMs: number;

  constructor(config: EdgeTtsProviderConfig = {}) {
    this.defaultVoice = config.defaultVoice ?? DEFAULT_EDGE_VOICE;
    this.defaultLang = config.defaultLang ?? DEFAULT_EDGE_LANG;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_EDGE_TIMEOUT_MS;
  }

  /**
   * Tổng hợp giọng đọc và lưu trực tiếp ra file đích an toàn
   * @param text Đoạn văn bản cần đọc (tối đa 300 ký tự)
   * @param destinationFilePath Đường dẫn tuyệt đối tới file .mp3 cuối cùng
   * @param options Cấu hình giọng đọc (voice, lang, rate, pitch, timeout)
   * @returns Đường dẫn tới file audio đã tạo thành công
   */
  async synthesizeToFile(
    text: string,
    destinationFilePath: string,
    options?: TtsSynthesizeOptions
  ): Promise<string> {
    // 1. Kiểm thực văn bản đầu vào
    if (!text || text.trim().length === 0) {
      throw new Error('Văn bản cần đọc không được để trống');
    }

    const trimmedText = text.trim();
    if (trimmedText.length > MAX_TTS_TEXT_LENGTH) {
      throw new Error(
        `Văn bản vượt quá giới hạn tối đa ${MAX_TTS_TEXT_LENGTH} ký tự (nhận ${trimmedText.length} ký tự)`
      );
    }

    // 2. Kiểm thực đường dẫn file đích
    if (!destinationFilePath || destinationFilePath.trim().length === 0) {
      throw new Error('Đường dẫn file đích không được để trống');
    }

    // 3. Chuẩn bị thư mục chứa file đích
    const targetDir = path.dirname(destinationFilePath);
    await fs.promises.mkdir(targetDir, { recursive: true });

    // 4. Tạo đường dẫn file tạm .tmp nguyên tử
    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const tempFilePath = `${destinationFilePath}.${Date.now()}.${randomSuffix}.tmp`;

    // 5. Cấu hình EdgeTTS với các giá trị bắt buộc
    const voice = options?.voice ?? this.defaultVoice;
    const lang = options?.lang ?? this.defaultLang;
    const rate = options?.rate ?? 'default';
    const pitch = options?.pitch ?? 'default';
    const timeout = options?.timeout ?? this.defaultTimeoutMs;

    const tts = new EdgeTTS({
      voice,
      lang,
      rate,
      pitch,
      timeout,
    });

    try {
      // 6. Ghi stream ra file tạm .tmp
      await tts.ttsPromise(trimmedText, tempFilePath);

      // 7. Xác thực file tạm tồn tại và có dung lượng hợp lệ (> 0 bytes)
      const stat = await fs.promises.stat(tempFilePath);
      if (stat.size === 0) {
        throw new Error(
          `File âm thanh tạm sinh ra có kích thước 0 byte (${tempFilePath})`
        );
      }

      // 8. Đổi tên nguyên tử sang file đích cuối cùng
      try {
        await fs.promises.rename(tempFilePath, destinationFilePath);
      } catch (renameErr: any) {
        // Dự phòng cho Windows khi file đích đang tồn tại hoặc bị khóa ngắn hạn
        if (renameErr.code === 'EEXIST' || renameErr.code === 'EPERM') {
          await fs.promises.unlink(destinationFilePath).catch(() => {});
          await fs.promises.rename(tempFilePath, destinationFilePath);
        } else {
          throw renameErr;
        }
      }

      return destinationFilePath;
    } catch (error) {
      // 9. Dọn dẹp file tạm nếu quá trình sinh âm thanh hoặc ghi đĩa thất bại
      await fs.promises.unlink(tempFilePath).catch(() => {});
      throw error;
    }
  }
}

/**
 * Instance mặc định dùng cho toàn ứng dụng
 */
export const edgeTtsProvider = new EdgeTtsProvider();
