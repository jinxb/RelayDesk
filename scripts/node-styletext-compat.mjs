import { createRequire, syncBuiltinESMExports } from "node:module";

const require = createRequire(import.meta.url);
const util = require("node:util");
const originalStyleText = util.styleText;

if (typeof originalStyleText === "function") {
  util.styleText = function patchedStyleText(format, text, options) {
    if (Array.isArray(format)) {
      return format.reduce((current, part) => originalStyleText(part, current, options), text);
    }

    return originalStyleText(format, text, options);
  };

  syncBuiltinESMExports();
}

