export interface WebSpeechOptions {
  rate?: number; // Tốc độ phát âm, mặc định bình thường 1.0
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Kiểm tra xem trình duyệt có hỗ trợ Web Speech API không (an toàn SSR)
 */
export function isWebSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Lấy danh sách giọng en-US, chờ nạp bất đồng bộ nếu danh sách đang rỗng (timeout 1000ms)
 */
export async function getUsVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isWebSpeechSupported()) return [];
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();

  if (voices.length === 0) {
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => resolve(), 1000);
      synth.onvoiceschanged = () => {
        clearTimeout(timeoutId);
        resolve();
      };
    });
    voices = synth.getVoices();
  }

  return voices.filter(
    (v) => v.lang === 'en-US' || v.lang === 'en_US' || v.lang.startsWith('en')
  );
}

/**
 * Phát âm đoạn văn bản bằng Web Speech API
 * - Hủy lời thoại dở dang trước khi đọc
 * - Chọn giọng en-US (ưu tiên localService khi offline)
 * - Tốc độ đọc mặc định bình thường (rate = 1.0)
 */
export async function playWebSpeech(
  text: string,
  options: WebSpeechOptions = {}
): Promise<boolean> {
  if (!isWebSpeechSupported() || !text || text.trim().length === 0) {
    return false;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const voices = await getUsVoices();
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  // Ưu tiên chọn giọng localService khi thiết bị offline
  const selectedVoice =
    voices.find(
      (v) =>
        (v.lang === 'en-US' || v.lang === 'en_US') &&
        (!isOffline || v.localService)
    ) ||
    voices.find((v) => v.lang === 'en-US' || v.lang === 'en_US') ||
    voices[0];

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = options.rate ?? 1.0;
  if (options.pitch) utterance.pitch = options.pitch;
  if (selectedVoice) utterance.voice = selectedVoice;

  if (options.onStart) utterance.onstart = options.onStart;
  if (options.onEnd) utterance.onend = options.onEnd;
  if (options.onError) utterance.onerror = options.onError;

  synth.speak(utterance);
  return true;
}

/**
 * Dừng phát âm ngay lập tức
 */
export function stopWebSpeech(): void {
  if (isWebSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
}
