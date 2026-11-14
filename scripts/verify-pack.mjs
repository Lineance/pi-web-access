import { execFileSync } from "node:child_process";

/**
 * Assert the npm tarball contains what it must and nothing it must not.
 *
 * The `files` field is easy to break silently: a wrong entry ships a package with
 * no compiled entry point, or ships the test suite.
 */
/**
 * Run `npm pack --dry-run --json`.
 *
 * Prefers re-invoking npm's own entry script through the current node binary:
 * spawning a bare `npm` differs per platform (npm.cmd on Windows is refused
 * without a shell on recent Node versions).
 */
function packJson() {
  const entry = process.env["npm_execpath"];
  const args = ["pack", "--dry-run", "--json"];
  const raw = entry
    ? execFileSync(process.execPath, [entry, ...args], { encoding: "utf8" })
    : execFileSync("npm", args, { encoding: "utf8", shell: true });
  return raw;
}

const raw = packJson();
const [info] = JSON.parse(raw);
const files = info.files.map((entry) => entry.path);

const required = [
  "dist/index.js",
  "dist/index.d.ts",
  "README.md",
  "LICENSE",
  "docs/config.example.json",
];
const missing = required.filter((path) => !files.includes(path));
const forbidden = files.filter(
  (path) => path.endsWith(".test.js") || path.startsWith("src/") || path.startsWith("test/"),
);

if (missing.length > 0) {
  console.error(`missing from the package: ${missing.join(", ")}`);
  process.exit(1);
}
if (forbidden.length > 0) {
  console.error(`must not be published: ${forbidden.slice(0, 10).join(", ")}`);
  process.exit(1);
}

console.log(`package ok: ${files.length} files, ${(info.size / 1024).toFixed(1)} KB`);
