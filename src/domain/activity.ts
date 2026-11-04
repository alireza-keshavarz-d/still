import type { StudyActivity } from './types';

export interface ActivitySuggestion {
  activity: StudyActivity;
  kind: 'prefix' | 'token' | 'fuzzy';
  score: number;
}

export interface ActivityMatchResult {
  exact: StudyActivity | null;
  suggestions: ActivitySuggestion[];
}

export function normalizeActivityName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function validateActivityName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Activity name cannot be empty.');
  if (name.length > 80) throw new Error('Activity name must be 80 characters or fewer.');
  if (!normalizeActivityName(name)) throw new Error('Activity name must contain letters or numbers.');
  return name;
}

/** Optimal-string-alignment distance (Damerau-Levenshtein variant). */
export function damerauLevenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
      if (
        row > 1 && column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

function fuzzyThreshold(length: number): number {
  if (length < 4) return 0;
  if (length < 8) return 1;
  return 2;
}

export function matchActivities(
  input: string,
  activities: StudyActivity[],
  limit = 3
): ActivityMatchResult {
  const query = normalizeActivityName(input);
  if (!query) return { exact: null, suggestions: [] };

  const available = activities.filter((activity) => activity.archivedAt === null);
  const exact = available.find((activity) => activity.normalizedName === query) ?? null;
  if (exact) return { exact, suggestions: [] };
  if (query.length < 2) return { exact: null, suggestions: [] };

  const queryTokens = query.split(' ');
  const suggestions: ActivitySuggestion[] = [];

  for (const activity of available) {
    const candidate = activity.normalizedName;
    if (candidate.startsWith(query)) {
      suggestions.push({ activity, kind: 'prefix', score: 300 + query.length / candidate.length });
      continue;
    }

    const candidateTokens = candidate.split(' ');
    if (queryTokens.some((token) => candidateTokens.some((part) => part.startsWith(token)))) {
      suggestions.push({ activity, kind: 'token', score: 200 + query.length / candidate.length });
      continue;
    }

    const threshold = fuzzyThreshold(query.length);
    if (threshold === 0) continue;
    const distance = damerauLevenshtein(query, candidate);
    if (distance <= threshold) {
      suggestions.push({ activity, kind: 'fuzzy', score: 100 - distance * 10 - Math.abs(candidate.length - query.length) });
    }
  }

  suggestions.sort((left, right) =>
    right.score - left.score || left.activity.name.localeCompare(right.activity.name)
  );
  return { exact: null, suggestions: suggestions.slice(0, Math.max(0, limit)) };
}
