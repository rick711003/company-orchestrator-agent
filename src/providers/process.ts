import { spawn, spawnSync } from "node:child_process";

export function commandExists(command: string): boolean {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

export function runCommand(
  command: string,
  args: string[],
  cwd: string,
  dryRun: boolean,
): { exitCode: number; output: string } {
  if (dryRun) {
    const task = args.at(-1) ?? "";
    const output = `[dry-run] ${JSON.stringify([command, ...args.slice(0, -1), `<task omitted: ${task.length} chars>`])}`;
    console.log(output);
    return { exitCode: 0, output };
  }

  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return { exitCode: result.status ?? 1, output: `${stdout}${stderr}` };
}

export function runCommandAsync(
  command: string,
  args: string[],
  cwd: string,
  dryRun: boolean,
  timeoutMs = 30 * 60 * 1000,
  signal?: AbortSignal,
): Promise<{ exitCode: number; output: string }> {
  if (dryRun) {
    const task = args.at(-1) ?? "";
    const output = `[dry-run] ${JSON.stringify([command, ...args.slice(0, -1), `<task omitted: ${task.length} chars>`])}`;
    console.log(output);
    return Promise.resolve({ exitCode: 0, output });
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    let terminationReason: "timeout" | "cancelled" | undefined;
    const terminate = (reason: "timeout" | "cancelled") => {
      if (settled) return;
      terminationReason = reason;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    };
    const timer = setTimeout(() => terminate("timeout"), timeoutMs);
    const abort = () => terminate("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; process.stdout.write(text); });
    child.stderr.on("data", (chunk: Buffer) => { const text = chunk.toString(); output += text; process.stderr.write(text); });
    child.on("error", (error) => { if (!settled) { settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(error); } });
    child.on("close", (code, processSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (terminationReason) output += `\nProcess terminated: ${terminationReason}.\n`;
      else if (processSignal) output += `\nProcess terminated by ${processSignal}.\n`;
      resolvePromise({ exitCode: code ?? 1, output });
    });
  });
}
