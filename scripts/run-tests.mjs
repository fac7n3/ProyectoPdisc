// Corre todos los tests (js/*.test.mjs y supabase/functions/_tests/*.test.mjs) con Node,
// sin depender de `for` de sh: el script anterior de `npm test` no andaba en Windows (cmd).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = ['js', 'supabase/functions/_tests']
  .flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `${dir}/${f}`));
for (const f of files) {
  console.log(`--- ${f}`);
  if (spawnSync(process.execPath, [f], { stdio: 'inherit' }).status !== 0) process.exit(1);
}
console.log(`\n${files.length} archivos de test, todo bien.`);
