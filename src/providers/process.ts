import { spawnSync } from "node:child_process";

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
    const output = `[dry-run] ${JSON.stringify([command, ...args])}`;
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
