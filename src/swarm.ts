import { runDelegateCommand } from './delegate.js';

export async function runSwarmCommand(args: string[]): Promise<number> {
  return runDelegateCommand('swarm', args);
}
