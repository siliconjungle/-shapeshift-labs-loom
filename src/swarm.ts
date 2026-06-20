import { runDelegateCommand } from './delegate.js';

export async function runSwarmCommand(args: string[]): Promise<number> {
  if (args[0] === 'dashboard' || args[0] === 'ui') return runDelegateCommand('ui', args.slice(1));
  return runDelegateCommand('swarm', args);
}
