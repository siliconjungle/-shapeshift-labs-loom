# Loom

![.loom package hero](https://raw.githubusercontent.com/siliconjungle/-shapeshift-labs-loom/main/assets/loom-hero.png)

`@shapeshift-labs/loom` is the project-level CLI for semantic source graphs,
agent swarm coordination, and Frontier language tooling.

Think of it as a `.git`-like workspace layer for AI-assisted software work:
`loom init` creates a `.loom/` directory, `loom scan` imports source into a
semantic graph, `loom snapshot` writes content-addressed checkpoints, and the
delegate commands expose the lower-level Frontier tools without making users
remember each package name.

## Install

Run with npm:

```sh
npx @shapeshift-labs/loom help
```

Install globally:

```sh
npm install -g @shapeshift-labs/loom
loom init
```

## What It Does

Loom gives a repository a durable semantic workspace:

- `.loom/objects/` stores content-addressed graph and snapshot objects.
- `.loom/index.json` records the current imported source graph.
- `.loom/refs/` and `.loom/HEAD` track semantic graph snapshots.
- `.loom/graph/current.json` is the current machine-readable source graph.
- `.loom/projections/` stores target-language projection plans.
- `loom swarm ...` delegates to Frontier Swarm / Codex worker orchestration.
- `loom lang ...` delegates to Frontier Lang parsing, source import, slicing,
  projection, and universal AST commands.
- `loom frontier ...` delegates to Frontier Framework when that optional
  package is installed in the project.

Loom stays small by delegating specialized capabilities to Frontier packages.

## Quick Start

```sh
loom init --name my-app --source "src/**/*.ts" --source "packages/**/*.ts"
loom scan
loom status --json
loom snapshot -m "initial semantic graph"
loom diff --json
loom project --to python
loom capabilities
loom swarm doctor
loom lang import src/app.ts --language typescript --sidecar
```

## Command Reference

### `loom init`

Creates `loom.json`, `.loomignore`, and the `.loom/` object/ref layout.

```sh
loom init [--name <name>] [--source <glob>] [--exclude <glob>] [--language <name>] [--force]
```

Options:

- `--name <name>`: project name written to `loom.json`.
- `--source <glob>` or `--include <glob>`: source glob. Repeatable.
- `--exclude <glob>`: ignored path or glob. Repeatable.
- `--language <name>`: expected language. Repeatable.
- `--force`: replace an existing `loom.json`.

### `loom scan`

Imports configured source files through Frontier Lang and writes the current
semantic graph.

```sh
loom scan [--json]
```

Output: `.loom/graph/current.json`, `.loom/index.json`,
`.loom/objects/source-index.json`, and a content-addressed graph object.

### `loom status`

Reports whether the project has Loom config, a current graph, git dirtiness,
semantic HEAD/ref information, installed Frontier package versions, and
delegate command availability.

```sh
loom status [--json]
```

### `loom graph`

Prints `.loom/graph/current.json`.

```sh
loom graph [--json]
```

### `loom diff`

Compares the saved graph with the current source tree without mutating `.loom/`.

```sh
loom diff [--json]
```

Output fields: `added`, `changed`, and `deleted`.

### `loom snapshot`

Scans source, stores a tree object and snapshot object, updates `HEAD`, and
writes a reflog entry.

```sh
loom snapshot [-m <message>] [--json]
```

Options: `-m <message>` or `--message <message>`.

### `loom cat-file`

Prints a stored Loom object by id.

```sh
loom cat-file <object-id> [--json]
```

Objects are JSON records with `kind`, `type`, and content fields.

### `loom project`

Creates a target-language projection plan from the current semantic graph.

```sh
loom project --to <target> [--out <dir>] [--json]
```

Options: `--to <target>` is required. `--out <dir>` defaults to
`.loom/projections`.

### `loom doctor`

Checks required package resolution and reports optional delegates.

```sh
loom doctor [--json]
```

Required packages are Frontier core, Frontier Lang, Frontier Lang CLI, Frontier
Lang compiler, Frontier Swarm, and Frontier Swarm Codex. Frontier Framework is
reported as an optional delegate.

Plain output lists missing packages and delegate availability. `--json` also
includes `packageName`, `binName`, `required`, `available`, `version`, `cliPath`,
and resolution `error` fields.

### `loom capabilities`

Lists the front-door capability surface Loom exposes after installation.

```sh
loom capabilities [--json]
```

The report contains `nativeCommands` for Loom-owned behavior and `delegates`
for lower-level CLIs reachable through Loom. Each delegate includes
availability, required/optional status, version, path, and resolution errors.

### `loom swarm`

Delegates to the published Frontier Swarm Codex CLI.

```sh
loom swarm <frontier-swarm-codex args...>
loom swarm-codex <frontier-swarm-codex args...>
```

Examples:

```sh
loom swarm doctor
loom swarm plan --manifest agent-ownership.json --tasks work-queue.json --outDir agent-runs/plan
loom swarm run --manifest agent-ownership.json --tasks work-queue.json --workspace copy --concurrency 8
loom swarm collect --run agent-runs/my-run
loom swarm query --run agent-runs/my-run --semantic --readiness ready
loom swarm tournament show --run agent-runs/my-run
```

This exposes swarm planning, run/resume/stop, collect/query, merge admission,
semantic sidecar inspection, adaptive/tournament scheduling, scoring, cleanup,
repair-links, and verification commands provided by
`@shapeshift-labs/frontier-swarm-codex`.

### `loom lang`

Delegates to the published Frontier Lang CLI.

```sh
loom lang <frontier-lang args...>
loom frontier-lang <frontier-lang args...>
```

Examples:

```sh
loom lang parse model.frontier
loom lang check model.frontier --strict-effects
loom lang ast model.frontier
loom lang import src/app.ts --language typescript --sidecar
loom lang native-diff before.ts --after after.ts --language typescript
loom lang slice src/app.ts --symbol updateState --focused-command "npm test"
loom lang emit-python model.frontier
loom lang emit-rust model.frontier
```

This exposes parsing, checking, hashing, universal AST output, native source
import, semantic sidecar generation, projection, slicing, test-slice, roundtrip,
corpus-roundtrip, and target emitters from Frontier Lang.

### `loom frontier`

Delegates to Frontier Framework when `@shapeshift-labs/frontier-framework` is
installed in the project.

```sh
loom frontier <frontier args...>
loom framework <frontier args...>
```

Examples once the optional package is installed:

```sh
loom frontier init
loom frontier doctor --json
loom frontier build --target evidence --json
loom frontier harness --json
loom frontier loop --strict --json
```

If the optional framework package is missing, Loom exits with a clear install
message instead of failing during package installation.

## Graph Shape

`loom scan` produces a graph shaped for agents and tools:

```json
{
  "kind": "loom.graph",
  "version": 1,
  "root": "/repo",
  "generatedAt": "2026-06-10T00:00:00.000Z",
  "summary": {
    "files": 2,
    "symbols": 18,
    "ownershipRegions": 12,
    "patchHints": 7
  },
  "files": [
    {
      "path": "src/app.ts",
      "language": "typescript",
      "hash": "sha256:...",
      "semantic": {
        "symbols": 12,
        "ownershipRegions": 9,
        "patchHints": 4
      }
    }
  ],
  "objectId": "sha256..."
}
```

The graph is intentionally language-neutral. Native source import adapters map
language syntax into symbols, ownership regions, patch hints, and projection
metadata. Target emitters can then project the graph into language-specific
code or evidence plans.

## JavaScript API

```ts
import {
  initLoomProject,
  scanLoomProject,
  snapshotLoomProject,
  diffLoomProject,
  createLoomProjectionPlan,
  readLoomCapabilities,
  runDelegateCommand
} from '@shapeshift-labs/loom';

await initLoomProject({ name: 'demo', include: ['src/**/*.ts'] });
const scan = await scanLoomProject();
const snapshot = await snapshotLoomProject({ message: 'semantic checkpoint' });
const diff = await diffLoomProject();
const projection = await createLoomProjectionPlan({ target: 'python' });
const capabilities = await readLoomCapabilities();
await runDelegateCommand('lang', ['import', 'src/app.ts', '--sidecar']);
```

## Current Boundaries

Loom is the umbrella CLI and semantic workspace layer. It does not replace the
lower-level packages:

Frontier Lang owns language parsing, universal ASTs, projections, and semantic
sidecars. Frontier Swarm owns worker queues, evidence, adaptive scheduling,
tournament feedback, and merge admission. Frontier Framework owns app
build/evidence/harness workflows when installed. Frontier core owns patch/diff
primitives.

That split keeps Loom stable while each specialist package evolves.
