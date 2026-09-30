/**
 * Normalized Levenshtein similarity in [0, 1].
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;

  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[left.length][right.length];
  const maxLen = Math.max(left.length, right.length);
  return 1 - distance / maxLen;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Token overlap (Jaccard-ish) in [0, 1], good for misheard lyric fragments.
 */
export function tokenOverlap(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }

  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Blend fuzzy edit distance + token overlap for lyric/title matching.
 */
export function fuzzyLyricScore(input: string, candidate: string): number {
  if (!input.trim()) return 0.35; // neutral when no lyric clue provided
  const contained = candidate.toLowerCase().includes(input.toLowerCase().trim());
  const levenshtein = levenshteinSimilarity(input, candidate);
  const tokens = tokenOverlap(input, candidate);
  const boost = contained ? 0.2 : 0;
  return Math.min(1, levenshtein * 0.45 + tokens * 0.55 + boost);
}
