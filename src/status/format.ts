import type { KeyState, ProviderStatus, StatusSnapshot } from "./report.js";

const USABLE = "✓";
const UNUSABLE = "·";
const NAME_WIDTH = 14;

/**
 * Render a snapshot as one line per fact.
 *
 * Plain text only: pi's widgets and notifications already theme their own surface,
 * and colour codes here would break `--json`-adjacent use such as piping into a file.
 */
export interface FormatOptions {
  /** List every known provider, not only the ones in a chain. */
  all?: boolean;
}

export function formatStatus(snapshot: StatusSnapshot, options: FormatOptions = {}): string[] {
  const lines: string[] = [];
  const all = options.all === true;

  lines.push(...section("search", snapshot.searchChain, snapshot.providers, "search", all));
  lines.push("");
  lines.push(...section("fetch", snapshot.fetchChain, snapshot.providers, "fetch", all));
  lines.push("");
  lines.push(...configLines(snapshot));

  for (const problem of snapshot.chainProblems) {
    lines.push(`chain    ${problem.side}: ${problem.message}`);
  }
  for (const issue of snapshot.issues) {
    lines.push(`rejected custom ${issue.side} "${issue.name}": ${issue.message}`);
  }

  return lines;
}

function section(
  title: string,
  chain: readonly string[],
  providers: readonly ProviderStatus[],
  side: ProviderStatus["side"],
  all: boolean,
): string[] {
  const rows = providers.filter((provider) => provider.side === side);
  // Default to the chain: a provider nobody selected is only interesting when you
  // are choosing what to add, and listing all of them overflows the widget.
  const shown = all ? rows : rows.filter((provider) => provider.inChain);
  const hidden = rows.length - shown.length;

  const head =
    chain.length === 0 ? `${title}  (nothing configured)` : `${title}  ${chain.join(" → ")}`;
  const lines = [head, ...shown.map((row) => `  ${describeRow(row)}`)];
  if (hidden > 0) lines.push(`  +${hidden} not in chain · --all`);

  return lines;
}

function describeRow(row: ProviderStatus): string {
  const mark = isUsable(row.key) ? USABLE : UNUSABLE;
  const name = row.name.padEnd(NAME_WIDTH);
  const tier = `t${row.tier}`.padEnd(3);
  const parts = [`${mark} ${name} ${tier} ${describeKey(row.key)}`];

  if (row.maxResults !== undefined) parts.push(`max ${row.maxResults}`);
  if (row.origin === "custom") parts.push("custom");
  if (!row.inChain) parts.push("not in chain");

  return parts.join(" · ");
}

function describeKey(key: KeyState): string {
  switch (key.state) {
    case "keyless":
      return "keyless";
    case "env":
      return `env ${key.variable}`;
    case "config":
      return "config file";
    case "missing":
      return `missing ${key.variable}`;
    case "missing-env-only":
      return `missing ${key.variable} (env only)`;
  }
}

function isUsable(key: KeyState): boolean {
  return key.state === "keyless" || key.state === "env" || key.state === "config";
}

function configLines(snapshot: StatusSnapshot): string[] {
  const lines = [`config   ${snapshot.configPath}  ${snapshot.configState}`];

  if (snapshot.configError !== undefined) {
    lines.push(`         ${snapshot.configError}; using defaults`);
  }
  for (const key of snapshot.unknownKeys) {
    lines.push(`         unknown key "${key}" ignored`);
  }

  const footer = [`maxResults ${snapshot.maxResults}`, `proxy ${snapshot.proxy ?? "none"}`];
  lines.push(footer.join(" · "));

  return lines;
}
