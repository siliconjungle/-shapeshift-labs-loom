#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs, boolArg, listArg, stringArg } from './args.js';
import { packageVersion } from './common.js';
import { readLoomCapabilities } from './capabilities.js';
import { helpText } from './help.js';
import { printResult } from './output.js';
import { initLoomProject } from './init.js';
import { scanLoomProject } from './scan.js';
import { readLoomStatus, doctorLoomProject } from './status.js';
import { readLoomGraph } from './graph.js';
import { diffLoomProject } from './diff.js';
import { createLoomProjectionPlan } from './project.js';
import { catLoomObject, snapshotLoomProject } from './snapshot.js';
import { runSwarmCommand } from './swarm.js';
import { isDelegateCommand, runDelegateCommand } from './delegate.js';
import type { LoomLanguage } from './types.js';

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

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  return pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url;
}

if (isCliEntrypoint()) {
  runLoomCli().then((code) => {
    process.exitCode = code;
  });
}
