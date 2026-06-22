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
- `.loom/graph/runs/` stores durable swarm run graphs by run id.
- `.loom/projections/` stores target-language projection plans.
- `loom swarm ...` delegates to Frontier Swarm / Codex worker orchestration.
- `loom ui ...` opens the dark Loom dashboard against a swarm run or collected
  swarm collection for inspecting and steering workers.
- `loom lang ...` delegates to Frontier Lang parsing, source import, slicing,
  projection, and universal AST commands.
- `loom frontier ...` delegates to Frontier Framework app, evidence, harness,
  and build commands.

Loom stays small by delegating specialized capabilities to Frontier packages.

## Quick Start

```sh
loom init --name my-app --source "src/**/*.ts" --source "packages/**/*.ts"
loom scan
loom status --json
loom snapshot -m "initial semantic graph"
loom diff --json
loom run-graph status my-run --json
loom run-graph import-frontier-run agent-runs/my-run/run-events.jsonl --run-id my-run
loom project --to python
loom capabilities
loom version
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

Default source globs cover common app layouts and text assets, including
`src`, `app`, `pages`, `components`, `packages`, `test`, and `public` files
such as `.js`, `.jsx`, `.ts`, `.tsx`, `.css`, `.json`, `.html`, `.svg`, `.md`,
and `.txt`.

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
semantic HEAD/ref information, installed Frontier package versions, delegate
command availability, and UI launch hints for detected local swarm runs or
collections.

```sh
loom status [--json]
```

`--json` includes a `uiLaunch` block with canonical `loom ui ...` and
`loom swarm dashboard ...` commands. When Loom sees local run evidence under
`agent-runs/` or `.loom/runs/`, it reports ready-to-copy targets with both bare
path commands and explicit `--run` or `--collection` forms.

### `loom graph`

Prints `.loom/graph/current.json`.

```sh
loom graph [--json]
```

### `loom run-graph`

Reads and writes durable run dependency graphs stored under
`.loom/graph/runs/`. Run ids are sanitized into stable filenames, so a run id
such as `agent-runs/my-run` is stored as
`.loom/graph/runs/agent-runs_my-run.json`.

```sh
loom run-graph read [<run-id>] [--run-id <id>]
loom run-graph status [<run-id>] [--run-id <id>] [--json]
loom run-graph write-json <file|-> [--run-id <id>] [--json]
loom run-graph import-frontier-run <run-events.jsonl|-> [--run-id <id>] [--json]
```

`read` prints the stored `loom.run-graph` JSON. `status` reports whether the
graph file is missing, present, or present but invalid without surfacing a raw
stack trace. `write-json` stores a JSON `loom.run-graph` document using the
existing Loom run graph writer; pass `-` to read from stdin. `import-frontier-run`
normalizes the current `frontier-run` `run-events.jsonl` stream into Loom's
durable `.loom/graph/runs/` model. Imported graphs are stored as
`loom.run-graph` documents with `source: "frontier-run"`, `sourceKind`, and
`sourceMetadata` pointing back to the event log path. Native Loom graphs can use
`source: "loom-native"`; `status --json` includes `sourceKind` so tools can
distinguish native and imported graphs without parsing free-form metadata.

`loom.run-graph` also accepts an optional `decisionGraph` section for typed
durable decision graphs. The `graph.nodes: string[]` and dependency indexes are
the compact job graph for simple readers, while `decisionGraph` stores typed
nodes, edges, events, snapshots, indexes, and records for evidence, gates,
semantic changes, merge candidates, tournaments, panels, replays, and
improvement loops. Built-in node kinds include `intent`, `task`, `worker`,
`candidate`, `evidence`, `gate`, `decision`, `merge`, `replay`, and `rsi`.
`frontier-run` imports populate this section alongside the compact job graph.

Typed summaries include `summary.typedCounts` when imported data contains
recognizable intents, tasks, workers, candidates, gates, evidence, merges,
panels, tournaments, RSI loops, or semantic changes. `status` prints a compact
`typed graph:` line for non-JSON output. The JavaScript API also exports
projection and chunk helpers so UI/read-models can be derived from graph truth
instead of becoming separate sources of truth:

```ts
const chain = buildRunGraphChainChunk(['intent:demo', 'task:demo', 'worker:demo']);
const mergeGate = buildRunGraphPatternChunk('merge-gate', [
  'candidate:demo',
  'gate:tests',
  'merge:demo'
]);
const panels = createLoomRunGraphPanelRecords(runGraph.decisionGraph);
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

Checks required package resolution and reports delegate availability.

```sh
loom doctor [--json]
```

Required packages are Frontier core, Frontier Lang, Frontier Lang CLI, Frontier
Lang compiler, Frontier Swarm, Frontier Swarm Codex, Frontier Loom UI, and
Frontier Framework.

Plain output lists missing packages and delegate availability. `--json` also
includes `packageName`, `binName`, `required`, `available`, `version`, `cliPath`,
`resolution`, `pathRequired`, `pathAvailable`, and resolution `error` fields.
Delegates resolve from installed package bins, so raw `frontier-swarm` or
`frontier-lang` binaries do not need to be on `PATH` when `loom ...` works.
For local package development, override a delegate with
`LOOM_DELEGATE_<COMMAND>_CLI=/path/to/dist/cli.js` or
`LOOM_DELEGATE_<COMMAND>_PACKAGE_ROOT=/path/to/package`; hyphenated commands
use underscores, such as `LOOM_DELEGATE_SWARM_CODEX_CLI`.

### `loom capabilities`

Lists the front-door capability surface Loom exposes after installation.

```sh
loom capabilities [--json]
```

The report contains `nativeCommands` for Loom-owned behavior and `delegates`
for lower-level CLIs reachable through Loom. Each delegate includes
availability, required/optional status, version, path, and resolution errors.
`pathRequired: false` means Loom can invoke the delegate through its package
installation even if the underlying binary is not globally installed.

### `loom version`

Prints the installed Loom package version.

```sh
loom version
loom --version
```

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
loom swarm dashboard agent-runs/my-run/collected
loom swarm ui agent-runs/my-run --open
loom ui agent-runs/my-run
loom swarm continue --collection agent-runs/my-run/collected --backlog swarm-backlog.json --routing-policy model-routing-policy.json
LOOM_DELEGATE_SWARM_CODEX_CLI=../frontier-swarm-codex/dist/cli.js loom swarm-codex continue --collection agent-runs/my-run/collected
loom swarm query --run agent-runs/my-run --semantic --readiness ready
loom swarm tournament show --run agent-runs/my-run
```

This exposes swarm planning, run/resume/stop, collect/query, merge admission,
semantic sidecar inspection, adaptive/tournament scheduling, continuation from
collected child backlogs/model-routing feedback, scoring, cleanup, repair-links,
and verification commands provided by
`@shapeshift-labs/frontier-swarm-codex`.

### `loom ui`

Delegates to the installed Frontier Loom UI package. `loom swarm dashboard` and
`loom swarm ui` are aliases that keep the dashboard discoverable from swarm
workflows. A bare path is treated as `--run` unless it looks like a collected
swarm collection directory or `collection.json`, in which case Loom forwards it
as `--collection`.

```sh
loom ui [<run-or-collection>] [frontier-loom-ui options...]
loom swarm dashboard [<run-or-collection>] [frontier-loom-ui options...]
loom swarm ui [<run-or-collection>] [frontier-loom-ui options...]
```

Examples:

```sh
loom ui agent-runs/my-run
loom swarm dashboard agent-runs/my-run --open
loom swarm ui agent-runs/my-run --port 4173
loom swarm dashboard agent-runs/my-run/collected
loom ui --collection agent-runs/my-run/collected --continuation agent-runs/my-run/continuation
```

The UI reads dashboard snapshots from `@shapeshift-labs/frontier-swarm-codex`
and projects shared substrate records from `@shapeshift-labs/frontier-run`,
`@shapeshift-labs/frontier-lease`, `@shapeshift-labs/frontier-test`, and
`@shapeshift-labs/frontier-swarm-git`. Steering intent files still route back
to the coordinator; the snapshot schema, substrate contracts, and steering API
stay in the Frontier packages rather than inside the UI. Run
`loom status --json` to discover local `uiLaunch.detected` run and collection
commands before opening a dashboard.

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

Delegates to the installed Frontier Framework CLI.

```sh
loom frontier <frontier args...>
loom framework <frontier args...>
```

Examples:

```sh
loom frontier init
loom frontier doctor --json
loom frontier build --target evidence --json
loom frontier harness --json
loom frontier loop --strict --json
```

This exposes app scaffolding, builds, config validation, auth and migration
manifests, documentation evidence, surface coverage, harness gates, agent
bundles, fuzz/bench gates, deploy plans, and static dev serving.

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
  importFrontierRunEvents,
  normalizeFrontierRunEvents,
  parseFrontierRunEventsInput,
  buildRunGraphChainChunk,
  buildRunGraphPatternChunk,
  createLoomRunGraphPanelRecords,
  readLoomRunGraph,
  readLoomCapabilities,
  runDelegateCommand,
  writeLoomRunGraph
} from '@shapeshift-labs/loom';

await initLoomProject({ name: 'demo', include: ['src/**/*.ts'] });
const scan = await scanLoomProject();
const snapshot = await snapshotLoomProject({ message: 'semantic checkpoint' });
const diff = await diffLoomProject();
const projection = await createLoomProjectionPlan({ target: 'python' });
await writeLoomRunGraph({
  kind: 'loom.run-graph',
  version: 1,
  generatedAt: new Date().toISOString(),
  root: process.cwd(),
  runId: 'demo',
  summary: { nodes: 1, edges: 0, roots: 1, leaves: 1, issues: 0 },
  graph: {
    nodes: ['task-1'],
    edges: [],
    dependentsByJobId: { 'task-1': [] },
    dependenciesByJobId: { 'task-1': [] },
    roots: ['task-1'],
    leaves: ['task-1'],
    issues: []
  }
});
const runGraph = await readLoomRunGraph({ runId: 'demo' });
const events = parseFrontierRunEventsInput(runEventsJsonl);
const normalized = normalizeFrontierRunEvents(events, {
  runId: 'agent-runs/demo',
  sourcePath: 'agent-runs/demo/run-events.jsonl'
});
const imported = await importFrontierRunEvents(events, { runId: 'agent-runs/demo' });
const capabilities = await readLoomCapabilities();
await runDelegateCommand('lang', ['import', 'src/app.ts', '--sidecar']);
```

## Current Boundaries

Loom is the umbrella CLI and semantic workspace layer. It does not replace the
lower-level packages:

Frontier Lang owns language parsing, universal ASTs, projections, and semantic
sidecars. Frontier Swarm owns worker queues, evidence, adaptive scheduling,
tournament feedback, and merge admission. Frontier Framework owns app
build/evidence/harness workflows. Frontier core owns patch/diff
primitives.
