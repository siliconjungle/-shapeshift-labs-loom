import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const typecheck = process.argv.includes('--typecheck');
const tsc = 'node_modules/typescript/bin/tsc';
const args = typecheck ? ['--noEmit', '-p', 'tsconfig.json'] : ['-p', 'tsconfig.json'];

execFileSync(process.execPath, [tsc, ...args], { stdio: 'inherit' });

if (!typecheck) {
  fs.chmodSync('dist/cli.js', 0o755);
}
