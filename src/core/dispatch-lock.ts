import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface DispatchLock {
  path: string;
  release: () => void;
}

interface LockRecord { pid: number; createdAt: string; }

function processIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function acquireDispatchLock(runDirectory: string, staleAfterMs = 60 * 60 * 1000): DispatchLock {
  const path = join(runDirectory, "DISPATCH_LOCK.json");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(path, "wx");
      writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`);
      closeSync(descriptor);
      let released = false;
      return {
        path,
        release: () => {
          if (released) return;
          released = true;
          if (existsSync(path)) unlinkSync(path);
        },
      };
    } catch (error) {
      if (!existsSync(path)) continue;
      let record: LockRecord | undefined;
      try { record = JSON.parse(readFileSync(path, "utf8")) as LockRecord; } catch { /* stale malformed lock */ }
      const age = record ? Date.now() - Date.parse(record.createdAt) : Number.POSITIVE_INFINITY;
      if (attempt === 0 && (!record || age > staleAfterMs) && (!record || !processIsAlive(record.pid))) {
        unlinkSync(path);
        continue;
      }
      throw new Error(`Dispatch already active for this run${record ? ` (pid ${record.pid}, since ${record.createdAt})` : ""}.`);
    }
  }
  throw new Error("Unable to acquire dispatch lock.");
}
