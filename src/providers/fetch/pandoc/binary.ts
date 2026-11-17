import { spawn } from "node:child_process";
import { WebSearchError } from "../../../orchestrator/errors.js";
import { MAX_RESPONSE_BODY_BYTES } from "../../../transport/response-body.js";

/** pandoc reads HTML on stdin and writes GFM on stdout; no temp files involved. */
const PANDOC_ARGS = ["-f", "html", "-t", "gfm", "--wrap=none"] as const;

/**
 * The ChildProcess surface this module touches.
 *
 * Structural on purpose: a test stub implements exactly this shape instead of a
 * full ChildProcess, and the real `spawn()` result satisfies it unchanged.
 */
export interface PandocChild {
  readonly stdout: { on(event: "data", listener: (chunk: Buffer) => void): unknown };
  readonly stderr: { on(event: "data", listener: (chunk: Buffer) => void): unknown };
  readonly stdin: {
    end(data: string, encoding?: BufferEncoding): unknown;
    on(event: "error", listener: (error: Error) => void): unknown;
  };
  once(event: "exit", listener: (code: number | null) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(): boolean;
}

/**
 * Spawns the pandoc binary. Injectable so the tests never touch a real process.
 *
 * The binary is resolved from PATH by the OS itself; this module deliberately
 * offers no download, install or path configuration — a missing binary is a
 * plain provider failure that the chain falls back from.
 */
export type SpawnPandoc = (args: readonly string[]) => PandocChild;

export const defaultSpawnPandoc: SpawnPandoc = (args) =>
  spawn("pandoc", [...args], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });

let availability: Promise<boolean> | undefined;

/** Test hook: forget the cached probe so the next check spawns again. */
export function resetPandocAvailability(): void {
  availability = undefined;
}

/**
 * Whether the pandoc binary can be started, probed once per process.
 *
 * The result is cached because PATH does not change mid-session; installing
 * pandoc while pi runs is picked up on the next restart, not on the next call.
 */
export function pandocAvailable(spawnPandoc: SpawnPandoc = defaultSpawnPandoc): Promise<boolean> {
  availability ??= probePandoc(spawnPandoc);
  return availability;
}

function probePandoc(spawnPandoc: SpawnPandoc): Promise<boolean> {
  return new Promise((resolve) => {
    let child: PandocChild;
    try {
      child = spawnPandoc(["--version"]);
    } catch {
      resolve(false);
      return;
    }
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", () => settle(false));
    child.once("exit", (code) => settle(code === 0));
  });
}

/**
 * Convert one HTML body to GFM markdown via the pandoc binary.
 *
 * The body goes to stdin, never to argv, so there is no quoting or injection
 * surface. Output is capped at the same ceiling as a fetched body, a hung
 * conversion is killed through the abort signal, and every failure lands in the
 * provider taxonomy so the chain moves on to the next attempt.
 */
export function convertHtmlToMarkdown(
  html: string,
  spawnPandoc: SpawnPandoc = defaultSpawnPandoc,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: PandocChild;
    try {
      child = spawnPandoc(PANDOC_ARGS);
    } catch (error) {
      reject(new WebSearchError("transport", "pandoc", `pandoc failed to start: ${messageOf(error)}`));
      return;
    }

    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      child.kill();
      reject(new WebSearchError("transport", "pandoc", message));
    };
    const succeed = (markdown: string) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve(markdown);
    };
    const onAbort = () => fail("pandoc conversion aborted");

    let bytes = 0;
    const chunks: Buffer[] = [];
    let stderrTail = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > MAX_RESPONSE_BODY_BYTES) {
        fail(`pandoc output exceeded ${MAX_RESPONSE_BODY_BYTES} bytes`);
        return;
      }
      chunks.push(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-300);
    });
    child.on("error", (error: Error) => fail(`pandoc failed: ${error.message}`));
    child.on("exit", (code: number | null) => {
      if (settled) return;
      if (code === 0) {
        succeed(Buffer.concat(chunks).toString("utf8"));
        return;
      }
      const reason = stderrTail === "" ? "" : `: ${firstLine(stderrTail)}`;
      fail(`pandoc exited with code ${code ?? "signal"}${reason}`);
    });
    // A dead child closes the pipe first; the exit handler reports the failure.
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(html, "utf8");

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function firstLine(message: string): string {
  return (message.split("\n", 1)[0] ?? "").trim().slice(0, 160);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
