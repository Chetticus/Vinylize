/**
 * Start both halves of Vinylize with one command.
 *
 * The app needs a Vite dev server AND the Python engine behind it. Running
 * only one used to fail at the first click with an unhelpful fetch error, so
 * `npm run dev` now starts both and stops both together.
 *
 * The engine is optional in the sense that the app still boots without it —
 * The Vinyl Story is readable, and the UI explains what is missing — so if
 * Python is not set up this script warns and carries on with the web half
 * rather than refusing to start.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const backend = resolve(frontend, "..", "backend");
const isWindows = process.platform === "win32";

/** Prefer the project's virtualenv; fall back to whatever python is on PATH. */
function findPython() {
  const venv = isWindows
    ? join(backend, ".venv", "Scripts", "python.exe")
    : join(backend, ".venv", "bin", "python");
  if (existsSync(venv)) return venv;
  return isWindows ? "python" : "python3";
}

const children = [];
let shuttingDown = false;

function start(name, command, args, cwd, colour) {
  const child = spawn(command, args, { cwd, shell: isWindows, stdio: ["ignore", "pipe", "pipe"] });
  const tag = `\x1b[${colour}m[${name}]\x1b[0m`;

  const relay = (stream) => {
    stream.setEncoding("utf8");
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) console.log(`${tag} ${line}`);
    });
  };
  relay(child.stdout);
  relay(child.stderr);

  child.on("error", (err) => {
    console.log(`${tag} could not start: ${err.message}`);
    if (name === "engine") {
      console.log(
        `${tag} the app will still run, but no audio can be cut until the ` +
          `engine is available. See backend/README.md for setup.`,
      );
    }
  });
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.log(`${tag} exited with code ${code}`);
    if (name === "web") stopAll(code ?? 0);
  });

  children.push(child);
  return child;
}

function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopAll(0));
}

const python = findPython();
if (!existsSync(join(backend, ".venv"))) {
  console.log(
    "\x1b[33m[engine]\x1b[0m no backend/.venv found — falling back to " +
      `"${python}" on PATH. If the engine fails to start, see backend/README.md.`,
  );
}

start("engine", python, ["-m", "uvicorn", "app.main:app", "--port", "8000"], backend, "35");
start("web", isWindows ? "npx.cmd" : "npx", ["vite"], frontend, "36");
