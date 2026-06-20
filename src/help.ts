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
  loom capabilities [--json]
  loom version
  loom swarm <frontier-swarm-codex args...>
  loom swarm dashboard [<run-or-collection>] [frontier-loom-ui options...]
  loom swarm ui [<run-or-collection>] [frontier-loom-ui options...]
  loom swarm-codex <frontier-swarm-codex args...>
  loom ui [<run-or-collection>] [frontier-loom-ui options...]
  loom lang <frontier-lang args...>
  loom frontier <frontier args...>
  loom framework <frontier args...>

Examples:
  loom init --name emulator --source "src/**/*.ts"
  loom scan
  loom snapshot -m "source graph checkpoint"
  loom cat-file <object-id> --json
  loom project --to rust
  loom capabilities --json
  loom swarm collect --run agent-runs/my-run
  loom swarm dashboard agent-runs/my-run/collected --open
  loom swarm ui agent-runs/my-run --port 4173
  loom ui --collection agent-runs/my-run/collected --open
  loom ui --continuation agent-runs/my-run/continuation --open
  LOOM_DELEGATE_SWARM_CODEX_CLI=../frontier-swarm-codex/dist/cli.js loom swarm-codex continue --collection agent-runs/my-run/collected
  loom lang import src/app.ts --sidecar --out .loom/semantic-imports.json
  loom frontier doctor --json

UI shortcuts:
  loom status prints UI target dashboard commands, URL behavior, data source, run health, landed/applied counts, and active artifact paths.
  loom status --json reports uiLaunch commands, dashboard URL hints, health, artifacts, and detected local run/collection targets.
  loom ui <path> forwards --run unless <path> looks like a collection.
  loom swarm dashboard <path> and loom swarm ui <path> use the same run/collection inference.
  Use --run, --collection, --continuation, --host, --port, --steering-out-dir, --open, and --json for explicit UI control.
  Space and equals forms are accepted for UI options, for example --run agent-runs/my-run or --run=agent-runs/my-run.

Delegate overrides:
  LOOM_DELEGATE_<COMMAND>_CLI=/path/to/dist/cli.js
  LOOM_DELEGATE_<COMMAND>_PACKAGE_ROOT=/path/to/package
`;
}
