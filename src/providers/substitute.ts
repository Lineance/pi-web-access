export interface SubstitutionValues {
  query?: string;
  maxResults?: number;
  url?: string;
}

const WHOLE_TOKEN = /^\{(query|maxResults|url)\}$/;
const EMBEDDED_TOKEN = /\{(query|maxResults|url)\}/g;

/**
 * Replace `{query}`, `{maxResults}` and `{url}` inside a value.
 *
 * A string that is exactly one placeholder keeps the natural type — `{maxResults}`
 * becomes a number, so it stays numeric in the request body. Placeholders inside a
 * larger string are text substitutions.
 *
 * Nothing is concatenated into request syntax by hand: the caller builds an object
 * and the transport serialises it, so a query containing quotes cannot break out.
 */
export function substitute(value: unknown, values: SubstitutionValues): unknown {
  if (typeof value === "string") return substituteString(value, values);
  if (Array.isArray(value)) return value.map((item) => substitute(item, values));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      result[key] = substitute(inner, values);
    }
    return result;
  }
  return value;
}

export function substituteString(text: string, values: SubstitutionValues): string | number {
  const whole = WHOLE_TOKEN.exec(text);
  if (whole !== null) {
    const token = whole[1] ?? "";
    if (token === "maxResults" && values.maxResults !== undefined) return values.maxResults;
    return renderToken(token, values) ?? text;
  }

  return text.replace(
    EMBEDDED_TOKEN,
    (match, token: string) => renderToken(token, values) ?? match,
  );
}

function renderToken(token: string, values: SubstitutionValues): string | undefined {
  if (token === "query") return values.query;
  if (token === "maxResults") {
    return values.maxResults === undefined ? undefined : String(values.maxResults);
  }
  // A URL is a component of the target, so it is always percent-encoded.
  if (token === "url") return values.url === undefined ? undefined : encodeURIComponent(values.url);
  return undefined;
}
