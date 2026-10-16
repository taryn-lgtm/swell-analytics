/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload hook by design */
// `server-only` is resolved by Next's bundler, not installed as a package, so
// a plain Node run of src/lib/queries/* cannot find it. Map it to an empty
// module for this verifier only.
const Module = require("node:module");
const empty = require.resolve("./empty.cjs");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return empty;
  return orig.call(this, request, ...rest);
};
