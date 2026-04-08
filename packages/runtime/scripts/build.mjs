import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const entry = resolve(packageRoot, "src/bootstrap.ts");
const outdir = resolve(packageRoot, "dist");

rmSync(outdir, { recursive: true, force: true });

await build({
  entryPoints: [entry],
  outfile: resolve(outdir, "runtime.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
  external: ["node:*"],
});
