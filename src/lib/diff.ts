/**
 * Minimal line diff for the "what will this write?" preview.
 *
 * The app edits files the user already owns, so showing the exact change
 * before touching anything is the whole point of the preview. An LCS table is
 * plenty here — these are config files of at most a few hundred lines.
 */

export type DiffOp = "keep" | "add" | "remove";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

export interface Hunk {
  lines: DiffLine[];
  /** Lines of unchanged context skipped before this hunk. */
  skippedBefore: number;
}

/** Above this, the quadratic table is not worth it; callers fall back. */
const MAX_LINES = 4000;

export function diffLines(before: string, after: string): DiffLine[] | null {
  const a = before === "" ? [] : before.replace(/\n$/, "").split("\n");
  const b = after === "" ? [] : after.replace(/\n$/, "").split("\n");

  if (a.length > MAX_LINES || b.length > MAX_LINES) return null;

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ op: "keep", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ op: "remove", text: a[i] });
      i++;
    } else {
      lines.push({ op: "add", text: b[j] });
      j++;
    }
  }
  while (i < a.length) lines.push({ op: "remove", text: a[i++] });
  while (j < b.length) lines.push({ op: "add", text: b[j++] });

  return lines;
}

/**
 * Collapse long runs of unchanged lines, keeping `context` lines on either
 * side of each change.
 */
export function toHunks(lines: DiffLine[], context = 3): Hunk[] {
  const changed = lines
    .map((line, index) => (line.op === "keep" ? -1 : index))
    .filter((index) => index >= 0);
  if (changed.length === 0) return [];

  const ranges: Array<[number, number]> = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(lines.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  let previousEnd = -1;
  return ranges.map(([start, end]) => {
    const hunk: Hunk = {
      lines: lines.slice(start, end + 1),
      skippedBefore: start - previousEnd - 1,
    };
    previousEnd = end;
    return hunk;
  });
}

export function countChanges(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.op === "add") added++;
    else if (line.op === "remove") removed++;
  }
  return { added, removed };
}
