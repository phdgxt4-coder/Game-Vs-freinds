// Verifies every relative import resolves to a file that actually exports the imported names.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); } };
walk('src');
const exportsOf = (src) => {
  const s = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').forEach((n) => n.trim() && s.add(n.trim().split(/\s+as\s+/).pop()));
  return s;
};
let bad = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+\w+|\{([^}]*)\}|\w+)\s+from\s+'([^']+)'/g)) {
    const spec = m[2];
    if (!spec.startsWith('.')) { if (spec !== 'three' && !spec.startsWith('three/addons/')) { console.log(`${f}: unknown package '${spec}'`); bad++; } continue; }
    const target = resolve(dirname(f), spec);
    if (!existsSync(target)) { console.log(`${f}: missing file ${spec}`); bad++; continue; }
    if (m[1]) {
      const ex = exportsOf(readFileSync(target, 'utf8'));
      for (const n of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean))
        if (!ex.has(n)) { console.log(`${f}: '${n}' is not exported by ${spec}`); bad++; }
    }
  }
  const r = (await import('node:child_process')).spawnSync('node', ['--check', f]);
  if (r.status !== 0) { console.log(`${f}: syntax error\n${r.stderr}`); bad++; }
}
console.log(`${files.length} modules checked, ${bad} problems`);
process.exit(bad ? 1 : 0);
