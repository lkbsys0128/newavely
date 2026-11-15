import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as entities from "entities";

const nativeRequire = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));

/** Isolated app modules with explicit fake I/O; never reads deployment credentials. */
export function createPrayerModuleLoader({ mocks = {}, env = {}, fetch: request = globalThis.fetch } = {}) {
  const cache = new Map();
  function load(path) {
    const absolute = resolve(root, path);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const source = readFileSync(absolute, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const module = { exports: {} };
    cache.set(absolute, module);
    const context = vm.createContext({
      exports: module.exports, module,
      require(specifier) {
        if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
        if (specifier === "entities") return entities;
        if (specifier.startsWith("@/") || specifier.startsWith(".")) {
          const base = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2)) : resolve(dirname(absolute), specifier);
          const file = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
          if (file) return load(file);
        }
        return nativeRequire(specifier);
      },
      process: { env }, fetch: request, Request, Response, Headers, URL, URLSearchParams, AbortSignal,
      setTimeout, clearTimeout, TextEncoder, TextDecoder, Buffer, console,
    });
    new vm.Script(compiled, { filename: absolute }).runInContext(context);
    return module.exports;
  }
  return load;
}
