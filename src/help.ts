export function helpText(): string {
  return `loom - semantic repo collaboration over Frontier

Usage:
  loom init [--name <name>] [--source <glob>] [--exclude <glob>] [--force]
  loom scan [--json]
  loom status [--json]
  loom graph [--json]
  loom diff [--json]
  loom snapshot [-m <message>] [--json]
  loom cat-file <object-id> [--json]
  loom project --to <target> [--out <dir>] [--json]
  loom doctor [--json]
  loom swarm <frontier-swarm-codex args...>

Examples:
  loom init --name emulator --source "src/**/*.ts"
  loom scan
  loom snapshot -m "source graph checkpoint"
  loom cat-file <object-id> --json
  loom project --to rust
  loom swarm collect --run agent-runs/my-run
`;
}
