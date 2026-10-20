import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DICTIONARY_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';
export const DEFAULT_DICTIONARY_TIMEOUT_MS = 5000;
export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 LearnLanguageApp/1.0';

export interface DictionaryPhonetic {
  text?: string;
  audio?: string;
  sourceUrl?: string;
  license?: {
    name?: string;
    url?: string;
  };
}

export interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: DictionaryPhonetic[];
}

export interface BestPhoneticResult {
  audioUrl: string | null;
  ipa: string | null;
}

export interface DictionaryDownloadResult {
  audioFilePath: string;
  audioUrl: string;
  ipa: string | null;
}

export interface DictionaryFetchOptions {
  timeoutMs?: number;
  userAgent?: string;
  fetchFn?: typeof fetch;
}

/**
 * Chuẩn hóa URL âm thanh từ API (bổ sung giao thức https: nếu là protocol-relative)
 */
export function sanitizeAudioUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return null;
}

/**
 * Thuật toán phân tích phonetics & ưu tiên giọng đọc Mỹ (-us.mp3)
 * Căn cứ đặc tả docs/AUDIO_SUBSYSTEM.md Mục 3.1
 * - Ưu tiên 1: URL chứa '-us.mp3' hoặc 'en-us'
 * - Ưu tiên 2: URL file .mp3 bất kỳ có trong danh sách
 * - Trích xuất chuỗi ký âm quốc tế IPA tương ứng
 */
export function extractBestPhonetic(
  phonetics?: DictionaryPhonetic[],
  topLevelPhonetic?: string
): BestPhoneticResult {
  let generalIpa = topLevelPhonetic?.trim() || null;

  if (!phonetics || phonetics.length === 0) {
    return {
      audioUrl: null,
      ipa: generalIpa,
    };
  }

  // Thu thập IPA đầu tiên nếu chưa có topLevelPhonetic
  if (!generalIpa) {
    const firstWithText = phonetics.find((p) => p.text && p.text.trim().length > 0);
    if (firstWithText?.text) {
      generalIpa = firstWithText.text.trim();
    }
  }

  const validPhonetics = phonetics
    .map((p) => ({
      ...p,
      cleanAudio: sanitizeAudioUrl(p.audio),
    }))
    .filter((p): p is DictionaryPhonetic & { cleanAudio: string } => Boolean(p.cleanAudio));

  if (validPhonetics.length === 0) {
    return {
      audioUrl: null,
      ipa: generalIpa,
    };
  }

  // 1. Ưu tiên cao nhất: URL chứa '-us.mp3', 'en-us' hoặc '-us/'
  const usMatch = validPhonetics.find((p) => {
    const lower = p.cleanAudio.toLowerCase();
    return (
      lower.includes('-us.mp3') ||
      lower.includes('en-us') ||
      lower.includes('-us/') ||
      lower.includes('/en/us')
    );
  });

  if (usMatch) {
    return {
      audioUrl: usMatch.cleanAudio,
      ipa: usMatch.text?.trim() || generalIpa,
    };
  }

  // 2. Dự phòng: Lấy bất kỳ audio mp3 hợp lệ đầu tiên
  const fallbackMatch = validPhonetics[0];
  return {
    audioUrl: fallbackMatch.cleanAudio,
    ipa: fallbackMatch.text?.trim() || generalIpa,
  };
}

/**
 * Truy vấn thông tin từ vựng từ DictionaryAPI
 * Trả về null nếu mã HTTP khác 200 (404, 530, 429), timeout hoặc lỗi mạng
 */
export async function fetchDictionaryEntry(
  word: string,
  options?: DictionaryFetchOptions
): Promise<DictionaryEntry[] | null> {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return null;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_DICTIONARY_TIMEOUT_MS;
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
  const fetchFn = options?.fetchFn ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${DICTIONARY_API_BASE}/${encodeURIComponent(normalized)}`;
    const response = await fetchFn(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    return data as DictionaryEntry[];
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tải phát âm từ điển chuẩn qua DictionaryAPI và lưu vào file cục bộ an toàn
 * - Ưu tiên lấy audio -us.mp3
 * - Thực hiện ghi nguyên tử (.tmp -> rename)
 * - Trả về null nếu không tìm thấy từ, không có audio hoặc lỗi kết nối (để kích hoạt fallback sang TtsProvider)
 */
export async function downloadDictionaryAudio(
  word: string,
  destinationFilePath: string,
  options?: DictionaryFetchOptions
): Promise<DictionaryDownloadResult | null> {
  if (!word || word.trim().length === 0 || !destinationFilePath) {
    return null;
  }

  const entries = await fetchDictionaryEntry(word, options);
  if (!entries || entries.length === 0) {
    return null;
  }

  // Tìm URL phát âm tốt nhất từ các entries trả về
  let bestAudioUrl: string | null = null;
  let detectedIpa: string | null = null;

  for (const entry of entries) {
    const { audioUrl, ipa } = extractBestPhonetic(entry.phonetics, entry.phonetic);
    if (audioUrl) {
      bestAudioUrl = audioUrl;
      detectedIpa = ipa;
      break;
    }
  }

  if (!bestAudioUrl) {
    return null;
  }

  // Chuẩn bị thư mục chứa file đích
  const targetDir = path.dirname(destinationFilePath);
  await fs.promises.mkdir(targetDir, { recursive: true });

  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tempFilePath = `${destinationFilePath}.${Date.now()}.${randomSuffix}.tmp`;

  const timeoutMs = options?.timeoutMs ?? DEFAULT_DICTIONARY_TIMEOUT_MS;
  const userAgent = options?.userAgent ?? DEFAULT_USER_AGENT;
  const fetchFn = options?.fetchFn ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const audioRes = await fetchFn(bestAudioUrl, {
      headers: {
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    });

    if (!audioRes.ok) {
      return null;
    }

    const arrayBuffer = await audioRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      return null;
    }

    await fs.promises.writeFile(tempFilePath, buffer);

    // Đổi tên nguyên tử sang file đích cuối cùng (an toàn trên Windows)
    try {
      await fs.promises.rename(tempFilePath, destinationFilePath);
    } catch (renameErr: any) {
      if (renameErr.code === 'EEXIST' || renameErr.code === 'EPERM') {
        await fs.promises.unlink(destinationFilePath).catch(() => {});
        await fs.promises.rename(tempFilePath, destinationFilePath);
      } else {
        throw renameErr;
      }
    }

    return {
      audioFilePath: destinationFilePath,
      audioUrl: bestAudioUrl,
      ipa: detectedIpa,
    };
  } catch {
    // Dọn dẹp file tạm nếu tải thất bại
    await fs.promises.unlink(tempFilePath).catch(() => {});
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
