/** Transpila una edge function de Deno y devuelve su handler, con todo stubbeado. */
import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';

export function loadEdgeFunction(tsPath, { env = {}, createClient, fetchImpl }) {
  let src = fs.readFileSync(tsPath, 'utf8');
  src = src.replace(/^import .*from "jsr:.*";\s*$/m, '');

  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

  let handler = null;
  const logs = { warn: [], error: [] };
  const sandbox = {
    Deno: { env: { get: (k) => env[k] }, serve: (h) => { handler = h; } },
    createClient,
    fetch: fetchImpl,
    Response, Request, URL, JSON, Math, Date, Number, String, Set, Map, Array, Object, Promise, RegExp, Boolean,
    console: {
      log: () => {},
      warn: (...a) => logs.warn.push(a.join(' ')),
      error: (...a) => logs.error.push(a.join(' ')),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  if (!handler) throw new Error(`${tsPath}: no llamó a Deno.serve`);
  return { handler, logs };
}
