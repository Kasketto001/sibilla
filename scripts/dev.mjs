// Runs the API server and the web UI together for development. Ctrl+C stops both.
import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const procs = ["server", "web"].map((w) => spawn(npm, ["run", "dev", "-w", w], { stdio: "inherit" }));

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill();
  process.exitCode = code;
};
for (const p of procs) p.on("exit", (code) => stop(code ?? 0)); // if one dies, don't leave the other running alone
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
