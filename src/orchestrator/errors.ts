/**
 * Failure taxonomy for the provider chains.
 *
 * Error text is deliberately terse and structured: it goes into the model
 * context, so it must stay short and factual. Lengthy remediation recipes belong
 * in the README, never in a tool result.
 */

export type FailureKind =
  | "quota"
  | "auth"
  | "transport"
  | "timeout"
  | "parse"
  | "empty"
  | "config"
  | "exhausted";

/** A classified provider failure, with no stack and no vendor prose. */
export interface Failure {
  provider: string;
  kind: FailureKind;
  message: string;
}

export class WebSearchError extends Error {
  readonly kind: FailureKind;
  readonly provider: string;
  readonly status: number | undefined;

  constructor(kind: FailureKind, provider: string, message: string, status?: number) {
    super(message);
    this.name = "WebSearchError";
    this.kind = kind;
    this.provider = provider;
    this.status = status;
  }
}

/** Thrown when every attempt in a chain failed. */
export class ChainExhaustedError extends WebSearchError {
  readonly failures: readonly Failure[];

  constructor(failures: readonly Failure[]) {
    super("exhausted", "*", formatFailures(failures));
    this.name = "ChainExhaustedError";
    this.failures = failures;
  }
}

/**
 * Map an HTTP status onto the taxonomy.
 *
 * 402 and 429 both mean "you are out of allowance right now"; 401 and 403 mean
 * "this credential will not work", which is worth a different cooldown.
 */
export function kindForStatus(status: number): FailureKind {
  if (status === 429 || status === 402) return "quota";
  if (status === 401 || status === 403) return "auth";
  return "transport";
}

/**
 * Collapse an unknown thrown value into a `Failure`.
 *
 * Only the first line is kept: provider bodies sometimes echo multi-line error
 * pages, and none of that belongs in the context.
 */
export function toFailure(provider: string, error: unknown): Failure {
  if (error instanceof WebSearchError) {
    return {
      provider: error.provider === "*" ? provider : error.provider,
      kind: error.kind,
      message: firstLine(error.message),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { provider, kind: "transport", message: firstLine(message) };
}

function firstLine(message: string): string {
  const line = message.split("\n", 1)[0] ?? "";
  return line.trim().slice(0, 160);
}

/**
 * Render failures as `tavily:quota exa:auth firecrawl:parse`.
 *
 * Deliberately drops per-provider prose: with several providers in a chain, the
 * concatenated messages would blow past any sane budget and get truncated
 * mid-sentence.
 */
export function formatFailures(failures: readonly Failure[]): string {
  if (failures.length === 0) return "no providers attempted";
  return failures.map((failure) => `${failure.provider}:${failure.kind}`).join(" ");
}
