/**
 * Lets `node --test scripts/guide-samples` run this package's tests on every
 * Node the repo uses. Node 20 searches a directory argument for test files;
 * Node 22 instead runs it as a module, which resolves to this file. Named
 * index.js, not *.test.*, so Node 20's search never runs the suite twice.
 */
const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

for (const file of readdirSync(__dirname)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()) {
  import(pathToFileURL(join(__dirname, file)).href);
}
