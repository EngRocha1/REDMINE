#!/usr/bin/env node
/** Assemble gantt.js from gantt.js.sNN.b64 parts (Node — works on Windows without Python) */
const fs = require("fs");
const path = require("path");
const dir = __dirname;
const parts = fs
  .readdirSync(dir)
  .filter((f) => /^gantt\.js\.s\d+\.b64$/.test(f))
  .sort();
if (!parts.length) {
  console.error("No gantt.js.sNN.b64 parts found");
  process.exit(1);
}
const b64 = parts.map((f) => fs.readFileSync(path.join(dir, f), "utf8").trim()).join("");
const buf = Buffer.from(b64, "base64");
fs.writeFileSync(path.join(dir, "gantt.js"), buf);
console.log("OK gantt.js", buf.length, "bytes from", parts.length, "parts");
