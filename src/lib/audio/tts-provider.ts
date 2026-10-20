/**
 * Interface & Types cho hệ thống tổng hợp giọng đọc AI (TTS)
 * Căn cứ đặc tả: docs/AUDIO_SUBSYSTEM.md (Mục 4)
 */

export interface TtsSynthesizeOptions {
  /**
   * Tên giọng đọc Microsoft Edge TTS.
   * Cấu hình bắt buộc mặc định: 'en-US-AriaNeural' (giọng nữ Bắc Mỹ tự nhiên cho IELTS).
   */
  voice?: string;

  /**
   * Mã ngôn ngữ.
   * Cấu hình bắt buộc mặc định: 'en-US' (thay vì mặc định 'zh-CN' của thư viện gốc).
   */
  lang?: string;

  /**
   * Tốc độ đọc. Mặc định 'default' hoặc '+0%'.
   */
  rate?: string;

  /**
   * Cao độ giọng đọc. Mặc định 'default' hoặc '+0Hz'.
   */
  pitch?: string;

  /**
   * Thời gian chờ tối đa cho request TTS (ms). Mặc định 10000ms (10 giây).
   */
  timeout?: number;
}

export interface TtsProvider {
  /**
   * Tổng hợp giọng đọc và lưu trực tiếp ra file đích an toàn (ghi nguyên tử)
   * @param text Đoạn văn bản cần đọc (tối đa 300 ký tự)
   * @param destinationFilePath Đường dẫn tuyệt đối tới file .mp3 cuối cùng
   * @param options Cấu hình giọng đọc
   * @returns Đường dẫn tới file audio đã tạo thành công
   */
  synthesizeToFile(
    text: string,
    destinationFilePath: string,
    options?: TtsSynthesizeOptions
  ): Promise<string>;
}
