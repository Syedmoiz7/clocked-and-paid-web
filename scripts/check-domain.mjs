import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const manifest = JSON.parse(await readFile(new URL("../domain-manifest.json", import.meta.url), "utf8"));
let failed = false;
for (const [name, expected] of Object.entries(manifest)) {
  for (const prefix of ["../src/", "../../mobile/src/"]) {
    const source = await readFile(new URL(prefix + name, import.meta.url));
    if (createHash("sha256").update(source).digest("hex") !== expected) {
      console.error(`Domain drift: ${prefix}${name}`);
      failed = true;
    }
  }
}
if (failed) process.exitCode = 1;
else console.log(`${Object.keys(manifest).length} pure domain files match the reviewed mobile baseline.`);
