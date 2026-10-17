/**
 * Interleaving Algorithm for SRS Queue (Task 2b.5)
 *
 * Interleaves Word and Mistake flashcards according to pedagogical ratio:
 * 2 Words : 1 Mistake (Interleaving).
 *
 * Conforms to ADR:
 * "Trộn xen kẽ hàng đợi theo tỷ lệ 2 Thẻ Từ : 1 Thẻ Lỗi (Interleaving).
 * Giúp người học thay đổi ngữ cảnh tư duy liên tục, chống mỏi mệt nhận thức
 * và tăng cường khả năng ghi nhớ dài hạn."
 */

export interface InterleaveRatio {
  words: number;
  mistakes: number;
}

export const DEFAULT_INTERLEAVE_RATIO: InterleaveRatio = {
  words: 2,
  mistakes: 1,
};

/**
 * Interleaves two lists of items according to the specified ratio.
 * Preserves the relative order of items in each list.
 * Appends remaining items if one list runs out early.
 */
export function interleaveCards<T>(
  words: T[],
  mistakes: T[],
  ratio: InterleaveRatio = DEFAULT_INTERLEAVE_RATIO
): T[] {
  const result: T[] = [];
  let wIdx = 0;
  let mIdx = 0;

  const wCount = Math.max(1, ratio.words);
  const mCount = Math.max(1, ratio.mistakes);

  while (wIdx < words.length || mIdx < mistakes.length) {
    // Take words
    for (let i = 0; i < wCount && wIdx < words.length; i++) {
      result.push(words[wIdx++]);
    }

    // Take mistakes
    for (let i = 0; i < mCount && mIdx < mistakes.length; i++) {
      result.push(mistakes[mIdx++]);
    }
  }

  return result;
}
