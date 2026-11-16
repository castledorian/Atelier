// Lance les tests sans dépendance supplémentaire : esbuild (déjà installé avec Vite) assemble chaque fichier,
// puis l'exécuteur de tests intégré à Node (node:test) les exécute.   Usage : npm test
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';

const out = '.test-build';
rmSync(out, { recursive: true, force: true });
const entries = readdirSync('tests').filter((f) => f.endsWith('.test.ts')).map((f) => `tests/${f}`);
await build({ entryPoints: entries, outdir: out, bundle: true, platform: 'node', format: 'esm', outExtension: { '.js': '.mjs' }, logLevel: 'warning' });
const files = readdirSync(out).filter((f) => f.endsWith('.mjs')).map((f) => `${out}/${f}`);
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
