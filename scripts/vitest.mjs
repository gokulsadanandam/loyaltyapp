// Launches Vitest from the canonical path. On Windows a lowercase drive letter in
// the cwd (VS Code terminals often open `d:\...`) makes Vite load `vitest` twice
// under two spellings, and every describe() fails with "reading 'config'".
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { join } from "node:path";

const cwd = realpathSync.native(process.cwd());
const bin = join(cwd, "node_modules", "vitest", "vitest.mjs");
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  cwd,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
