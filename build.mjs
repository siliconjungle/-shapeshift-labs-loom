import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(fileURLToPath(import.meta.url));

if (process.env.LOOM_LINK_LOCAL_FRONTIER_DEPS === '1') linkLocalFrontierDependencies();

const typecheck = process.argv.includes('--typecheck');
const tsc = 'node_modules/typescript/bin/tsc';
const args = typecheck ? ['--noEmit', '-p', 'tsconfig.json'] : ['-p', 'tsconfig.json'];

execFileSync(process.execPath, [tsc, ...args], { stdio: 'inherit' });

if (!typecheck) {
  fs.chmodSync('dist/cli.js', 0o755);
}

function linkLocalFrontierDependencies() {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  const dependencies = Object.keys(pkg.dependencies ?? {});
  for (const packageName of dependencies) {
    if (!packageName.startsWith('@shapeshift-labs/')) continue;
    const shortName = packageName.split('/')[1];
    const sibling = path.resolve(packageDir, '..', shortName);
    if (!fs.existsSync(path.join(sibling, 'package.json'))) continue;
    const scopeDir = path.join(packageDir, 'node_modules', '@shapeshift-labs');
    const linkPath = path.join(scopeDir, shortName);
    fs.mkdirSync(scopeDir, { recursive: true });
    if (fs.existsSync(linkPath)) {
      const stat = fs.lstatSync(linkPath);
      if (!stat.isSymbolicLink()) continue;
      const current = fs.readlinkSync(linkPath);
      if (path.resolve(scopeDir, current) === sibling || path.resolve(current) === sibling) continue;
      fs.rmSync(linkPath);
    }
    fs.symlinkSync(sibling, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
  }
}
