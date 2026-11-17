import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

/**
 * The package version, walked up from this module to the package root.
 *
 * Lives in one place because hardcoding it rots (the MCP clientInfo shipped
 * "0.7.0" for three releases). The walk works from both the source tree and the
 * published `dist/` layout, where the module sits one directory deeper.
 */
export function packageVersion(): string {
  cached ??= read();
  return cached;
}

function read(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 6; hop += 1) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const version = JSON.parse(readFileSync(candidate, "utf8")).version;
        if (typeof version === "string" && version !== "") return version;
      } catch {
        // Fall through to the parent directory.
      }
    }
    dir = dirname(dir);
  }
  return "unknown";
}
