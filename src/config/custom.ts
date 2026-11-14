import type { CatalogAdditions, FetchAddition, SearchAddition } from "../providers/catalog.js";
import { compileFetchProvider } from "../providers/fetch/custom/compile.js";
import { compileSearchProvider } from "../providers/search/custom/compile.js";

export interface CustomProviderIssue {
  side: "search" | "fetch";
  name: string;
  message: string;
}

export interface CustomProviderResult {
  additions: CatalogAdditions;
  issues: CustomProviderIssue[];
}

/**
 * Read the `customProviders` block into compiled providers.
 *
 * Shape:
 *
 * ```jsonc
 * "customProviders": {
 *   "search": { "<name>": { … } },
 *   "fetch":  { "<name>": { … } }
 * }
 * ```
 *
 * One entry declares one capability, so each side keeps its own schema and its own
 * rules. A name may not appear on both sides: `providers` and `fetchProviders` are
 * separate chains, and the same name meaning two different endpoints would be a
 * trap.
 */
export function readCustomProviders(raw: unknown): CustomProviderResult {
  const additions: {
    search: Map<string, SearchAddition>;
    fetch: Map<string, FetchAddition>;
  } = { search: new Map(), fetch: new Map() };
  const issues: CustomProviderIssue[] = [];

  if (raw === undefined || raw === null) return { additions, issues };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    issues.push({ side: "search", name: "customProviders", message: "must be an object" });
    return { additions: additions as CatalogAdditions, issues };
  }

  const block = raw as Record<string, unknown>;
  for (const key of Object.keys(block)) {
    if (key !== "search" && key !== "fetch") {
      issues.push({
        side: "search",
        name: "customProviders",
        message: `unknown section "${key}"; expected "search" or "fetch"`,
      });
    }
  }

  collect("search", block["search"], issues, (name, entry) => {
    const result = compileSearchProvider(name, entry);
    if (!result.ok) return result.message;
    additions.search.set(name, { meta: result.meta, spec: result.spec });
    return undefined;
  });

  collect("fetch", block["fetch"], issues, (name, entry) => {
    const result = compileFetchProvider(name, entry);
    if (!result.ok) return result.message;
    additions.fetch.set(name, { meta: result.meta, spec: result.spec });
    return undefined;
  });

  for (const name of additions.search.keys()) {
    if (additions.fetch.has(name)) {
      issues.push({
        side: "fetch",
        name,
        message: "declared on both sides; use a distinct name for search and fetch",
      });
      additions.fetch.delete(name);
    }
  }

  return { additions: additions as CatalogAdditions, issues };
}

function collect(
  side: "search" | "fetch",
  section: unknown,
  issues: CustomProviderIssue[],
  handle: (name: string, entry: unknown) => string | undefined,
): void {
  if (section === undefined || section === null) return;
  if (typeof section !== "object" || Array.isArray(section)) {
    issues.push({ side, name: section as string, message: "must be an object keyed by name" });
    return;
  }
  for (const [name, entry] of Object.entries(section as Record<string, unknown>)) {
    const message = handle(name, entry);
    if (message !== undefined) issues.push({ side, name, message });
  }
}
