/**
 * Cloze Deletion & Word Card Mode Specification (Task 2b.2)
 *
 * Implements 3 review modes for Word cards:
 * 1. RECOGNITION (Word -> Meaning & IPA)
 * 2. RECALL (Meaning -> Word & IPA)
 * 3. CLOZE (Sentence with [...] Cloze Deletion using Sentence.targetForm)
 *
 * Conforms to ADR:
 * "Cloze card dùng targetForm kèm fallback tự động. Đảm bảo đục lỗ chính xác dạng từ đã chia
 * trong ngữ cảnh câu; fallback bảo vệ app không bao giờ bị crash giao diện nếu dữ liệu import
 * thiếu trường hoặc targetForm không khớp."
 */

export type WordCardMode = 'RECOGNITION' | 'RECALL' | 'CLOZE';

export interface ClozeResult {
  success: boolean;
  clozeText: string;
  originalText: string;
  targetForm: string | null;
  matchedForm: string | null;
  prefix: string;
  suffix: string;
}

export interface WordCardModeDetermination {
  mode: WordCardMode;
  isFallback: boolean;
  clozeResult?: ClozeResult;
}

/**
 * Checks whether a character is a Unicode letter or number.
 */
function isWordChar(char: string | undefined): boolean {
  if (!char) return false;
  return /[\p{L}\p{N}]/u.test(char);
}

/**
 * Creates a Cloze deletion sentence by replacing targetForm with "[...]"
 * Preserves sentence context and performs case-insensitive boundary-aware search.
 */
export function createClozeSentence(
  sentenceText: string,
  targetForm?: string | null
): ClozeResult {
  const emptyResult: ClozeResult = {
    success: false,
    clozeText: sentenceText || '',
    originalText: sentenceText || '',
    targetForm: targetForm || null,
    matchedForm: null,
    prefix: sentenceText || '',
    suffix: '',
  };

  if (!sentenceText || !targetForm) {
    return emptyResult;
  }

  const cleanTarget = targetForm.trim();
  if (cleanTarget.length === 0) {
    return emptyResult;
  }

  const lowerSentence = sentenceText.toLowerCase();
  const lowerTarget = cleanTarget.toLowerCase();

  // Search for the occurrence with word-boundary awareness
  let searchPos = 0;
  let matchIndex = -1;

  while (searchPos < lowerSentence.length) {
    const foundIdx = lowerSentence.indexOf(lowerTarget, searchPos);
    if (foundIdx === -1) break;

    const charBefore = foundIdx > 0 ? sentenceText[foundIdx - 1] : undefined;
    const charAfter =
      foundIdx + cleanTarget.length < sentenceText.length
        ? sentenceText[foundIdx + cleanTarget.length]
        : undefined;

    // Must be at word boundaries (not a substring of another word, e.g. "car" in "scar")
    const validBoundaryBefore = !isWordChar(charBefore);
    const validBoundaryAfter = !isWordChar(charAfter);

    if (validBoundaryBefore && validBoundaryAfter) {
      matchIndex = foundIdx;
      break;
    }

    searchPos = foundIdx + 1;
  }

  // Fallback: If strict boundary didn't match (e.g. due to hyphen or punctuation), try basic search
  if (matchIndex === -1) {
    const basicIdx = lowerSentence.indexOf(lowerTarget);
    if (basicIdx !== -1) {
      matchIndex = basicIdx;
    } else {
      return emptyResult;
    }
  }

  const matchedForm = sentenceText.slice(matchIndex, matchIndex + cleanTarget.length);
  const prefix = sentenceText.slice(0, matchIndex);
  const suffix = sentenceText.slice(matchIndex + cleanTarget.length);
  const clozeText = `${prefix}[...]${suffix}`;

  return {
    success: true,
    clozeText,
    originalText: sentenceText,
    targetForm: cleanTarget,
    matchedForm,
    prefix,
    suffix,
  };
}

/**
 * Determines the review mode for a word card based on repetitions and Cloze viability.
 *
 * Rules:
 * - repetitions = 0 (New card): RECOGNITION (Word -> Meaning)
 * - repetitions = 1: RECALL (Meaning -> Word)
 * - repetitions >= 2: CLOZE (Sentence Cloze Deletion)
 *   If Cloze conditions are not met, gracefully falls back to RECOGNITION or RECALL.
 */
export function determineWordCardMode(params: {
  repetitions: number;
  sentenceText?: string | null;
  targetForm?: string | null;
}): WordCardModeDetermination {
  const { repetitions, sentenceText, targetForm } = params;

  if (repetitions === 0) {
    return { mode: 'RECOGNITION', isFallback: false };
  }

  if (repetitions === 1) {
    return { mode: 'RECALL', isFallback: false };
  }

  // repetitions >= 2 -> attempt CLOZE
  if (sentenceText && targetForm) {
    const cloze = createClozeSentence(sentenceText, targetForm);
    if (cloze.success) {
      return {
        mode: 'CLOZE',
        isFallback: false,
        clozeResult: cloze,
      };
    }
  }

  // Fallback if Cloze conditions are not satisfied
  // Alternate between RECOGNITION and RECALL
  const fallbackMode: WordCardMode = repetitions % 2 === 0 ? 'RECOGNITION' : 'RECALL';
  return {
    mode: fallbackMode,
    isFallback: true,
  };
}
