import { spawn } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export async function runSwarmCommand(args: string[]): Promise<number> {
  const pkgPath = require.resolve('@shapeshift-labs/frontier-swarm-codex/package.json');
  const cli = path.join(path.dirname(pkgPath), 'dist', 'cli.js');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}
