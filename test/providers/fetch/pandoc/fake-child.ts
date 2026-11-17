import { EventEmitter } from "node:events";

import type { SpawnPandoc } from "../../../../src/providers/fetch/pandoc/binary.js";

export class FakeStdin extends EventEmitter {
  writes: string[] = [];
  end(data?: string): void {
    this.writes.push(data ?? "");
  }
}

export class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin = new FakeStdin();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }

  /** Complete the child the way a real exit would, optionally with stderr. */
  finish(code: number | null, stderr = ""): void {
    if (stderr !== "") this.stderr.emit("data", Buffer.from(stderr, "utf8"));
    this.emit("exit", code);
  }

  /** Fail the child the way a spawn ENOENT would. */
  crash(error: Error): void {
    this.emit("error", error);
  }
}

export interface SpawnRecorder {
  spawnFn: SpawnPandoc;
  /** One FakeChild per spawn call, in spawn order: the probe is first. */
  children: FakeChild[];
}

export function spawnRecorder(): SpawnRecorder {
  const children: FakeChild[] = [];
  const spawnFn: SpawnPandoc = () => {
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  return { spawnFn, children };
}

/** Let every pending microtask and one macrotask tick settle. */
export function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
