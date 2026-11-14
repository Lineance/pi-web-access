/** Walk a dotted path. Returns `undefined` as soon as the shape does not match. */
export function readDottedPath(raw: unknown, path: string): unknown {
  let current: unknown = raw;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Accepts a string, or the first non-empty string of an array of candidates. */
export function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.length > 0) return item;
    }
    return "";
  }
  return typeof value === "string" ? value : "";
}
