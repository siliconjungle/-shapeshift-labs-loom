#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs, boolArg, listArg, stringArg, type CliArgs } from './args.js';
import { abs, packageVersion, pathExists, readJson, resolveRoot } from './common.js';
import { readLoomCapabilities } from './capabilities.js';
import { readLoomConfig } from './config.js';
import { helpText } from './help.js';
import { printResult } from './output.js';
import { initLoomProject } from './init.js';
import { scanLoomProject } from './scan.js';
import { readLoomStatus, doctorLoomProject } from './status.js';
import {
  importFrontierRunEvents,
  loomRunGraphSourceKind,
  parseFrontierRunEventsInput,
  readLoomGraph,
  readLoomRunGraph,
  writeLoomRunGraph
} from './graph.js';
import { diffLoomProject } from './diff.js';
import { createLoomProjectionPlan } from './project.js';
import { catLoomObject, snapshotLoomProject } from './snapshot.js';
import { runSwarmCommand } from './swarm.js';
import { isDelegateCommand, runDelegateCommand } from './delegate.js';
import type { LoomCommandResult, LoomLanguage, LoomRunGraph } from './types.js';

export async function runLoomCli(argv = process.argv.slice(2)): Promise<number> {
  const command = argv[0] ?? 'help';
  if (command === 'swarm') return runSwarmCommand(argv.slice(1));
  if (isDelegateCommand(command)) return runDelegateCommand(command, argv.slice(1));
  const args = parseArgs(argv.slice(1));
  const json = boolArg(args.json, false);
  try {
    if (command === 'help' || command === '--help' || command === '-h') {
      process.stdout.write(helpText());
    } else if (command === 'version' || command === '--version' || command === '-v') {
      process.stdout.write(`${await packageVersion('@shapeshift-labs/loom') ?? 'unknown'}\n`);
    } else if (command === 'init') {
      printResult(await initLoomProject({
        name: stringArg(args.name),
        include: listArg(args.source ?? args.include),
        exclude: listArg(args.exclude),
        languages: listArg(args.language) as LoomLanguage[] | undefined,
        force: boolArg(args.force, false)
      }), json);
    } else if (command === 'scan') {
      const result = await scanLoomProject();
      printResult(json ? result : result.graph, json);
    } else if (command === 'status') {
      printResult(await readLoomStatus(), json);
    } else if (command === 'graph') {
      printResult(await readLoomGraph(), json);
    } else if (command === 'run-graph') {
      return await runLoomRunGraphCommand(args, json);
    } else if (command === 'diff') {
      printResult(await diffLoomProject(), json);
    } else if (command === 'snapshot') {
      printResult(await snapshotLoomProject({ message: stringArg(args.m ?? args.message) }), json);
    } else if (command === 'cat-file') {
      const id = args._[0];
      if (!id) throw new Error('cat-file requires <object-id>');
      printResult(await catLoomObject({ id }), true);
    } else if (command === 'project') {
      printResult(await createLoomProjectionPlan({
        target: stringArg(args.to) ?? '',
        outDir: stringArg(args.out ?? args.outDir)
      }), json);
    } else if (command === 'doctor') {
      printResult(await doctorLoomProject(), json);
    } else if (command === 'capabilities') {
      printResult(await readLoomCapabilities(), json);
    } else {
      throw new Error(`unknown command: ${command}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) printResult({ ok: false, message }, true);
    else process.stderr.write(`${message}\n`);
    return 1;
  }
}

async function runLoomRunGraphCommand(args: CliArgs, json: boolean): Promise<number> {
  const subcommand = args._[0] ?? 'status';
  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(runGraphHelpText());
    return 0;
  }
  if (subcommand === 'read') {
    const runId = runGraphRunId(args, 1);
    printResult(await readLoomRunGraph({ root: stringArg(args.root), runId }), true);
    return 0;
  }
  if (subcommand === 'status') {
    printResult(await readLoomRunGraphStatus({ root: stringArg(args.root), runId: runGraphRunId(args, 1) }), json);
    return 0;
  }
  if (subcommand === 'write-json') {
    const input = args._[1] ?? stringArg(args.input);
    if (!input) throw new Error('run-graph write-json requires <file|->');
    const graph = await readRunGraphJson(input);
    const targetRunId = runGraphRunId(args, 2) ?? graph.runId ?? 'current';
    const path = await writeLoomRunGraph(graph, { root: stringArg(args.root), runId: targetRunId });
    printResult({
      ok: true,
      message: `wrote loom run graph ${targetRunId}`,
      path,
      runId: targetRunId,
      present: true,
      graphSummary: graph.summary
    }, json);
    return 0;
  }
  if (subcommand === 'import-frontier-run') {
    const input = args._[1] ?? stringArg(args.input);
    if (!input) throw new Error('run-graph import-frontier-run requires <run-events.jsonl|->');
    const events = parseFrontierRunEventsInput(readTextInput(input));
    const targetRunId = runGraphRunId(args, 2);
    printResult(await importFrontierRunEvents(events, {
      root: stringArg(args.root),
      runId: targetRunId,
      sourcePath: input === '-' ? 'stdin' : input
    }), json);
    return 0;
  }
  throw new Error(`unknown run-graph command: ${subcommand}`);
}

async function readLoomRunGraphStatus(options: { root?: string; runId?: string }): Promise<LoomCommandResult> {
  const root = resolveRoot(options.root);
  const runId = options.runId ?? 'current';
  const label = options.runId ?? 'current';
  let path: string | undefined;
  try {
    const config = await readLoomConfig(root);
    path = abs(root, `${config.generated.graph}/runs/${loomRunGraphFileName(options.runId)}.json`);
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
      runId: label,
      present: false
    };
  }

  if (!(await pathExists(path))) {
    return {
      ok: false,
      message: `missing loom run graph for ${label}`,
      path,
      runId: label,
      present: false
    };
  }

  try {
    const graph = await readLoomRunGraph(options);
    const sourceKind = loomRunGraphSourceKind(graph);
    return {
      ok: true,
      message: `found loom run graph ${graph.runId ?? runId}`,
      path,
      runId: graph.runId ?? runId,
      present: true,
      planId: graph.planId,
      source: graph.source ?? sourceKind,
      sourceKind,
      sourceMetadata: graph.sourceMetadata,
      graphSummary: graph.summary
    };
  } catch (error) {
    return {
      ok: false,
      message: `invalid loom run graph for ${label}: ${errorMessage(error)}`,
      path,
      runId: label,
      present: true
    };
  }
}

function runGraphRunId(args: CliArgs, positionalIndex: number): string | undefined {
  return stringArg(args['run-id'] ?? args.runId ?? args.run ?? args.id) ?? args._[positionalIndex];
}

async function readRunGraphJson(input: string): Promise<LoomRunGraph> {
  return readJsonInput<LoomRunGraph>(input);
}

async function readJsonInput<T = unknown>(input: string): Promise<T> {
  if (input === '-') return JSON.parse(readTextInput(input)) as T;
  return readJson<T>(input);
}

function readTextInput(input: string): string {
  if (input === '-') return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(input, 'utf8');
}

function loomRunGraphFileName(runId = 'current'): string {
  const cleaned = runId.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'current';
}

function runGraphHelpText(): string {
  return `loom run-graph - durable swarm run dependency graph helpers

Usage:
  loom run-graph read [<run-id>] [--run-id <id>]
  loom run-graph status [<run-id>] [--run-id <id>] [--json]
  loom run-graph write-json <file|-> [--run-id <id>] [--json]
  loom run-graph import-frontier-run <run-events.jsonl|-> [--run-id <id>] [--json]

Examples:
  loom run-graph status agent-run-2026 --json
  loom run-graph read agent-run-2026
  loom run-graph write-json loom-run-graph.json --run-id agent-run-2026
  loom run-graph import-frontier-run agent-runs/my-run/run-events.jsonl --run-id agent-runs/my-run
`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  return pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url;
}

if (isCliEntrypoint()) {
  runLoomCli().then((code) => {
    process.exitCode = code;
  });
}
