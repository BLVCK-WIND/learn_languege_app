/**
 * Word-level Diff Utility (Case & Punctuation Sensitive)
 *
 * Implements tokenization and Longest Common Subsequence (LCS) to provide
 * visual diff highlights for user-typed sentences against correct target sentences.
 *
 * Conforms to ADR:
 * "Diff Highlight mức từng từ, phân biệt hoa/thường và dấu câu cho thẻ Mistake.
 * Hỗ trợ thị giác trực quan giúp người học thấy ngay chỗ sai sót chính tả và dấu câu;
 * vẫn giữ nguyên tắc tự chấm 3 nút chủ động."
 */

export type DiffType = 'equal' | 'added' | 'removed';

export interface DiffChunk {
  type: DiffType;
  value: string;
}

export interface UserDiffChunk {
  value: string;
  isError: boolean;
}

export interface TargetDiffChunk {
  value: string;
  isMissingOrChanged: boolean;
}

export interface MistakeDiffResult {
  isExactMatch: boolean;
  cleanUserInput: string;
  cleanTarget: string;
  userChunks: UserDiffChunk[];
  targetChunks: TargetDiffChunk[];
  unifiedChunks: DiffChunk[];
}

/**
 * Tokenize a sentence into words (preserving contractions like don't, it's),
 * punctuation marks, and whitespace sequences.
 */
export function tokenizeSentence(text: string): string[] {
  if (!text) return [];
  // Matches words with optional internal apostrophe/hyphen, individual punctuation marks, or whitespace chunks
  const matches = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]|\s+/gu);
  return matches || [];
}

/**
 * Compute Longest Common Subsequence (LCS) diff between two token arrays.
 */
export function computeLcsDiff(tokensA: string[], tokensB: string[]): DiffChunk[] {
  const n = tokensA.length;
  const m = tokensB.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return tokensB.map((t) => ({ type: 'added', value: t }));
  if (m === 0) return tokensA.map((t) => ({ type: 'removed', value: t }));

  // DP table for LCS
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (tokensA[i] === tokensB[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to recover diff chunks
  let i = n;
  let j = m;
  const rawChunks: DiffChunk[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && tokensA[i - 1] === tokensB[j - 1]) {
      rawChunks.push({ type: 'equal', value: tokensA[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawChunks.push({ type: 'added', value: tokensB[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rawChunks.push({ type: 'removed', value: tokensA[i - 1] });
      i--;
    }
  }

  rawChunks.reverse();

  // Consolidate consecutive chunks of the same type
  const consolidated: DiffChunk[] = [];
  for (const chunk of rawChunks) {
    if (consolidated.length > 0 && consolidated[consolidated.length - 1].type === chunk.type) {
      consolidated[consolidated.length - 1].value += chunk.value;
    } else {
      consolidated.push({ ...chunk });
    }
  }

  return consolidated;
}

/**
 * Compare user typed sentence against target correct sentence with case and punctuation sensitivity.
 */
export function compareMistakeSentence(userInput: string, targetSentence: string): MistakeDiffResult {
  const cleanUserInput = (userInput || '').trim();
  const cleanTarget = (targetSentence || '').trim();

  const isExactMatch = cleanUserInput === cleanTarget && cleanTarget.length > 0;

  const tokensUser = tokenizeSentence(cleanUserInput);
  const tokensTarget = tokenizeSentence(cleanTarget);

  const unifiedChunks = computeLcsDiff(tokensUser, tokensTarget);

  // Derive userChunks: contains tokens from user input, flagged if they were incorrect/removed
  const userChunks: UserDiffChunk[] = [];
  for (const chunk of unifiedChunks) {
    if (chunk.type === 'equal') {
      userChunks.push({ value: chunk.value, isError: false });
    } else if (chunk.type === 'removed') {
      userChunks.push({ value: chunk.value, isError: true });
    }
    // 'added' chunks are missing in user input, so not in userChunks
  }

  // Derive targetChunks: contains tokens from target sentence, flagged if user missed or changed them
  const targetChunks: TargetDiffChunk[] = [];
  for (const chunk of unifiedChunks) {
    if (chunk.type === 'equal') {
      targetChunks.push({ value: chunk.value, isMissingOrChanged: false });
    } else if (chunk.type === 'added') {
      targetChunks.push({ value: chunk.value, isMissingOrChanged: true });
    }
    // 'removed' chunks were only in user input, so not in targetChunks
  }

  return {
    isExactMatch,
    cleanUserInput,
    cleanTarget,
    userChunks,
    targetChunks,
    unifiedChunks,
  };
}
