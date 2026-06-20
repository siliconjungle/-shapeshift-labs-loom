import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(root, 'frontier.source-policy.json'), 'utf8'));
const files = [];

for (const pattern of policy.sourceGlobs ?? []) {
  const base = pattern.split('/**/')[0] ?? pattern.split('/*')[0] ?? '.';
  walk(path.join(root, base), files);
}

const unique = [...new Set(files)]
  .filter((file) => !ignored(path.relative(root, file).replaceAll(path.sep, '/')))
  .sort();
const failures = [];

for (const file of unique) {
  const text = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  const limits = limitsFor(relative);
  const lines = text.split(/\r?\n/).length;
  if (lines > limits.maxLines) failures.push(`${relative}: ${lines} lines > ${limits.maxLines}`);
  if (text.length > limits.maxCharacters) {
    failures.push(`${relative}: ${text.length} chars > ${limits.maxCharacters}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`source policy ok (${unique.length} files)`);
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    if (/\.(ts|tsx|mjs|js)$/.test(dir)) out.push(dir);
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(child, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(child);
  }
}

function ignored(relative) {
  return (policy.ignoreGlobs ?? []).some((glob) => {
    const prefix = glob.replace('/**', '');
    return relative === prefix || relative.startsWith(`${prefix}/`);
  });
}

function limitsFor(relative) {
  const override = (policy.limitOverrides ?? []).find((item) => item && item.path === relative);
  return {
    maxLines: override?.maxLines ?? policy.maxLines,
    maxCharacters: override?.maxCharacters ?? policy.maxCharacters
  };
}
