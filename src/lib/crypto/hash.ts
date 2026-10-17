import { createHash } from 'node:crypto';

/**
 * Chuẩn hóa chuỗi văn bản theo đặc tả docs/DATABASE_SCHEMA.md Mục 3:
 * 1. Trim khoảng trắng hai đầu.
 * 2. Gộp chuỗi khoảng trắng liên tiếp thành 1 dấu cách duy nhất (\s+ -> ' ').
 * 3. Chuẩn hóa Unicode dựng sẵn (NFC).
 * 4. BẢO TOÀN chữ hoa/thường và dấu câu nguyên bản (để giữ nguyên ngữ cảnh lỗi).
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFC');
}

/**
 * Tính mã băm SHA-256 dạng chuỗi hex chữ thường.
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Băm nội dung thô (raw payload) cho ImportBatch.contentHash.
 * Giữ nguyên văn chuỗi JSON gốc để bảo đảm tính toàn vẹn kiểm toán (Outer Idempotency Barrier).
 */
export function hashPayload(rawPayload: string): string {
  return sha256(rawPayload);
}

/**
 * Băm câu ví dụ chuẩn hóa cho Sentence.contentHash.
 * Unique theo (wordId, contentHash).
 */
export function hashSentence(text: string): string {
  return sha256(normalizeText(text));
}

/**
 * Băm cặp câu sai và đúng cho Mistake.contentHash.
 * Định dạng ghép: normalize(wrong) + "::" + normalize(correct).
 * Unique toàn cục trong bảng Mistake.
 */
export function hashMistake(wrong: string, correct: string): string {
  const normWrong = normalizeText(wrong);
  const normCorrect = normalizeText(correct);
  return sha256(`${normWrong}::${normCorrect}`);
}
