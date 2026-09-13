import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const localPython =
  process.platform === "win32"
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");
const candidates = [
  process.env.MYCART_PYTHON,
  existsSync(localPython) ? localPython : null,
  process.platform === "win32" ? "python" : "python3",
  "python",
].filter(Boolean);

for (const python of [...new Set(candidates)]) {
  const result = spawnSync(
    python,
    ["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
    { cwd: root, stdio: "inherit" }
  );
  if (result.error?.code === "ENOENT") continue;
  process.exit(result.status ?? 1);
}

console.error("Python 3.10+ was not found. Run a MyCart launcher to set up .venv.");
process.exit(1);
