import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export interface RunLock { release(): void; }
interface LockRecord { pid: number; token: string; createdAt: string; heartbeatAt: string; }

function processIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function acquireRunLock(directory: string, staleAfterMs = 60 * 60 * 1000): RunLock {
  const path = join(directory, "RUN_LOCK.json");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const token = randomUUID();
      const timestamp = new Date().toISOString();
      const descriptor = openSync(path, "wx");
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token, createdAt: timestamp, heartbeatAt: timestamp }) + "\n");
      closeSync(descriptor);
      const heartbeat = setInterval(() => {
        try {
          const current = JSON.parse(readFileSync(path, "utf8")) as LockRecord;
          if (current.token === token) writeFileSync(path, JSON.stringify({ ...current, heartbeatAt: new Date().toISOString() }) + "\n");
        } catch { /* release or replacement owns recovery */ }
      }, Math.min(30_000, Math.max(1_000, Math.floor(staleAfterMs / 3))));
      heartbeat.unref();
      let released = false;
      return { release() {
        if (released) return;
        released = true;
        clearInterval(heartbeat);
        if (!existsSync(path)) return;
        try {
          const current = JSON.parse(readFileSync(path, "utf8")) as LockRecord;
          if (current.token === token) unlinkSync(path);
        } catch { /* never remove a lock whose ownership cannot be proven */ }
      } };
    } catch {
      if (!existsSync(path)) continue;
      let record: LockRecord | undefined;
      try { record = JSON.parse(readFileSync(path, "utf8")) as LockRecord; } catch { /* malformed is stale */ }
      const heartbeatAge = record ? Date.now() - Date.parse(record.heartbeatAt || record.createdAt) : Number.POSITIVE_INFINITY;
      if (attempt === 0 && (!record || heartbeatAge > staleAfterMs) && (!record || !processIsAlive(record.pid))) {
        unlinkSync(path);
        continue;
      }
      throw new Error(`Run already active${record ? ` (pid ${record.pid}, since ${record.createdAt})` : ""}.`);
    }
  }
  throw new Error("Unable to acquire run lock.");
}

export function requestRunCancellation(directory: string): void {
  writeFileSync(join(directory, "CANCEL_REQUESTED"), new Date().toISOString() + "\n");
}

export function cancellationRequested(directory: string): boolean {
  return existsSync(join(directory, "CANCEL_REQUESTED"));
}

export function clearCancellationRequest(directory: string): void {
  const path = join(directory, "CANCEL_REQUESTED");
  if (existsSync(path)) unlinkSync(path);
}

