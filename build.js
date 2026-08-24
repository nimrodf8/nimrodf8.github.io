#!/usr/bin/env node
/* Bundles the app into one self-contained HTML file.
   The multi-file version under js/ stays the source of truth; this is what you
   hand to a host that wants a single file (or paste into a page that cannot
   fetch siblings).

   Usage: node build.js [output.html]          default: standalone.html
          node build.js --artifact [out.html]   page content only, no <html>
                                                wrapper, for hosts that supply
                                                their own document shell */
"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const args = process.argv.slice(2);
const artifactMode = args.includes("--artifact");
const named = args.filter(a => !a.startsWith("--"))[0];
const outPath = path.resolve(root, named || (artifactMode ? "artifact.html" : "standalone.html"));

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "assets", "styles.css"), "utf8");

/* Keep the order the page declares — these scripts depend on each other. */
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (!scripts.length) throw new Error("no scripts found in index.html");

const bundled = scripts.map(src => {
  const code = fs.readFileSync(path.join(root, src), "utf8");
  return "/* ==== " + src + " ==== */\n" + code;
}).join("\n");

let out = html
  .replace('<link rel="stylesheet" href="assets/styles.css">', "<style>\n" + css + "\n</style>")
  .replace(/<script src="[^"]+"><\/script>\n?/g, "")
  .replace("</body>", "<script>\n" + bundled + "\n</script>\n</body>");

if (artifactMode) {
  /* Strip the document shell and keep <title> first, since some hosts only
     scan the opening of the file for it. */
  const title = (out.match(/<title>[\s\S]*?<\/title>/) || [""])[0];
  const style = (out.match(/<style>[\s\S]*?<\/style>/) || [""])[0];
  const body = out.slice(out.indexOf("<body>") + "<body>".length, out.lastIndexOf("</body>"));
  out = title + "\n" + style + "\n" + body.trim() + "\n";
  if (/<\/?(html|head|body)\b|<!DOCTYPE/i.test(out)) {
    throw new Error("document shell survived the artifact bundle");
  }
}

if (out.includes("<script src=") || out.includes('href="assets/')) {
  throw new Error("a reference to an external file survived the bundle");
}

fs.writeFileSync(outPath, out);
console.log("wrote " + path.relative(process.cwd(), outPath) +
  " (" + Math.round(out.length / 1024) + " KB, " + scripts.length + " scripts inlined)");
