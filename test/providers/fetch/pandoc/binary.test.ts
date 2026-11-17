import { describe, expect, it, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

import { WebSearchError } from "../../../../src/orchestrator/errors.js";
import {
  convertHtmlToMarkdown,
  defaultSpawnPandoc,
  pandocAvailable,
  resetPandocAvailability,
  type SpawnPandoc,
} from "../../../../src/providers/fetch/pandoc/binary.js";

class FakeStdin extends EventEmitter {
  writes: string[] = [];
  end(data?: string): void {
    this.writes.push(data ?? "");
  }
}

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = new FakeStdin();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }

  finish(code: number | null, stderr = ""): void {
    if (stderr !== "") this.stderr.emit("data", Buffer.from(stderr, "utf8"));
    this.emit("exit", code);
  }

  crash(error: Error): void {
    this.emit("error", error);
  }
}

interface ScriptedChild {
  child: FakeChild;
  spawnFn: SpawnPandoc;
  args: string[][];
}

function scripted(): ScriptedChild {
  const args: string[][] = [];
  const child = new FakeChild();
  const spawnFn: SpawnPandoc = (commandArgs) => {
    args.push([...commandArgs]);
    return child;
  };
  return { child, spawnFn, args };
}

beforeEach(() => {
  resetPandocAvailability();
});

describe("pandocAvailable", () => {
  it("reports available when the probe exits zero", async () => {
    const { child, spawnFn } = scripted();

    const pending = pandocAvailable(spawnFn);
    child.finish(0);

    await expect(pending).resolves.toBe(true);
    expect(child.stdin.writes).toEqual([]);
  });

  it("reports unavailable when the binary cannot be spawned", async () => {
    const { child, spawnFn } = scripted();

    const pending = pandocAvailable(spawnFn);
    child.crash(new Error("spawn ENOENT"));

    await expect(pending).resolves.toBe(false);
  });

  it("reports unavailable when the spawn function throws synchronously", async () => {
    const throwing: SpawnPandoc = () => {
      throw new Error("no exec");
    };

    await expect(pandocAvailable(throwing)).resolves.toBe(false);
  });

  it("probes once per process and caches the answer", async () => {
    const { child, spawnFn, args } = scripted();

    const first = pandocAvailable(spawnFn);
    child.finish(0);
    await first;

    await expect(pandocAvailable(spawnFn)).resolves.toBe(true);
    await expect(pandocAvailable(spawnFn)).resolves.toBe(true);
    expect(args).toHaveLength(1);
  });
});

describe("convertHtmlToMarkdown", () => {
  it("passes the HTML through stdin and resolves the stdout text", async () => {
    const { child, spawnFn, args } = scripted();

    const pending = convertHtmlToMarkdown("<p>hi</p>", spawnFn);
    child.stdin.emit("data", Buffer.from("<p>hi</p>", "utf8"));
    child.stdout.emit("data", Buffer.from("# hi", "utf8"));
    child.finish(0);

    await expect(pending).resolves.toBe("# hi");
    expect(child.stdin.writes).toEqual(["<p>hi</p>"]);
    expect(args[0]).toEqual(["-f", "html", "-t", "gfm", "--wrap=none"]);
  });

  it("reports a non-zero exit with the first stderr line", async () => {
    const { child, spawnFn } = scripted();

    const pending = convertHtmlToMarkdown("<p>hi</p>", spawnFn);
    child.finish(1, "couldn't parse\nsecond line\nthird line");

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WebSearchError);
    expect((error as WebSearchError).kind).toBe("transport");
    expect((error as WebSearchError).message).toBe("pandoc exited with code 1: couldn't parse");
  });

  it("reports a signal exit without a code", async () => {
    const { child, spawnFn } = scripted();

    const pending = convertHtmlToMarkdown("<p>hi</p>", spawnFn);
    child.finish(null);

    const error = await pending.catch((caught: unknown) => caught);
    expect((error as WebSearchError).message).toBe("pandoc exited with code signal");
  });

  it("reports a synchronous spawn failure", async () => {
    const throwing: SpawnPandoc = () => {
      throw new Error("permission denied");
    };

    const error = await convertHtmlToMarkdown("<p>hi</p>", throwing).catch(
      (caught: unknown) => caught,
    );
    expect((error as WebSearchError).message).toBe("pandoc failed to start: permission denied");
  });

  it("kills the child and fails when output exceeds the cap", async () => {
    const { child, spawnFn } = scripted();

    const pending = convertHtmlToMarkdown("<p>hi</p>", spawnFn);
    child.stdout.emit("data", Buffer.alloc(11 * 1024 * 1024));

    const error = await pending.catch((caught: unknown) => caught);
    expect((error as WebSearchError).message).toContain("exceeded 10485760 bytes");
    expect(child.killed).toBe(true);
  });

  it("kills the child and fails when the signal aborts", async () => {
    const { child, spawnFn } = scripted();
    const controller = new AbortController();

    const pending = convertHtmlToMarkdown("<p>hi</p>", spawnFn, controller.signal);
    controller.abort();

    const error = await pending.catch((caught: unknown) => caught);
    expect((error as WebSearchError).message).toBe("pandoc conversion aborted");
    expect(child.killed).toBe(true);
  });

  it("ignores stdin pipe errors after the child died", async () => {
    const { child, spawnFn } = scripted();

    const pending = convertHtmlToMarkdown("<p>hi</p>", spawnFn);
    child.stdin.emit("error", new Error("EPIPE"));
    child.finish(1, "bad input");

    const error = await pending.catch((caught: unknown) => caught);
    expect((error as WebSearchError).message).toBe("pandoc exited with code 1: bad input");
  });

  it("exposes a default spawn that starts the real binary shape", () => {
    // The default must be usable as-is; the check only asserts wiring, never runs pandoc.
    expect(typeof defaultSpawnPandoc).toBe("function");
  });
});
