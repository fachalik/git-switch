/** `1 file`, `3 files` — nearly every message in the app counts something. */
export function plural(count: number, singular: string, many = `${singular}s`) {
  return `${count} ${count === 1 ? singular : many}`;
}
