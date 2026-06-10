export type CliValue = string | boolean | string[];
export type CliArgs = Record<string, CliValue | undefined> & { _: string[] };

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';
    if (token.startsWith('-') && !token.startsWith('--') && token.length === 2) {
      const next = argv[index + 1];
      pushValue(out, token.slice(1), next && !next.startsWith('-') ? argv[++index] ?? true : true);
      continue;
    }
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const body = token.slice(2);
    const equals = body.indexOf('=');
    const key = equals >= 0 ? body.slice(0, equals) : body;
    const next = argv[index + 1];
    const value: string | boolean = equals >= 0
      ? body.slice(equals + 1)
      : next && !next.startsWith('--')
        ? argv[++index] ?? true
        : true;
    pushValue(out, key, value);
  }
  return out;
}

export function stringArg(value: CliValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function boolArg(value: CliValue | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = Array.isArray(value) ? value.at(-1) ?? '' : value;
  return !['false', '0', 'no'].includes(normalized.toLowerCase());
}

export function listArg(value: CliValue | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((item) => item.trim()).filter(Boolean);
}

function pushValue(out: CliArgs, key: string, value: string | boolean): void {
  if (out[key] === undefined) out[key] = value;
  else if (Array.isArray(out[key])) (out[key] as string[]).push(String(value));
  else out[key] = [String(out[key]), String(value)];
}
