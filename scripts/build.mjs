#!/usr/bin/env node
// Bundles the page that signs in from the browser (src/browser.ts and the
// OpenID Connect library) into public/browser.js. Everything else in public/
// is committed as it is.
import { build } from "esbuild";

const result = await build({
  entryPoints: ["src/browser.ts"],
  outfile: "public/browser.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  metafile: true,
});
const [[file, { bytes }]] = Object.entries(result.metafile.outputs);
console.log(`${file}: ${(bytes / 1024).toFixed(1)} kB`);
