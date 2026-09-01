import {
  CommandError,
  type CommandContext,
  type CommandDefinition,
  type CommandLogEntry,
  type ToolDefinition,
} from './types';
import { validateAgainstSchema } from './validate';

type Listener = (entry: CommandLogEntry) => void;

const commands = new Map<string, CommandDefinition<any, any>>();
const listeners = new Set<Listener>();
const log: CommandLogEntry[] = [];
const MAX_LOG = 500;

/** Approval hook. The app installs one that shows a confirm UI; tests install a stub. */
let confirmHandler: ((cmd: CommandDefinition, input: unknown, ctx: CommandContext) => Promise<boolean>) | null = null;

export function setConfirmationHandler(handler: typeof confirmHandler): void {
  confirmHandler = handler;
}

export function registerCommand<I, R>(def: CommandDefinition<I, R>): () => void {
  if (!/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(def.id)) {
    throw new Error(`Command id "${def.id}" must be dotted lowerCamel segments, e.g. "viewer.loadStudy"`);
  }
  if (commands.has(def.id)) {
    throw new Error(`Command "${def.id}" is already registered`);
  }
  if (def.input.type !== 'object') {
    throw new Error(`Command "${def.id}" input schema must be an object schema`);
  }
  commands.set(def.id, def);
  return () => {
    commands.delete(def.id);
  };
}

export function registerCommands(defs: CommandDefinition<any, any>[]): () => void {
  const disposers = defs.map((d) => registerCommand(d));
  return () => disposers.forEach((d) => d());
}

export function getCommand(id: string): CommandDefinition | undefined {
  return commands.get(id);
}

export function listCommands(opts: { availableOnly?: boolean } = {}): CommandDefinition[] {
  const all = [...commands.values()];
  return opts.availableOnly ? all.filter((c) => c.isAvailable?.() ?? true) : all;
}

export function hasCommand(id: string): boolean {
  return commands.has(id);
}

/**
 * Execute a command by id. Validates input against the schema, enforces
 * `requiresConfirmation` through the installed handler, records a log entry,
 * and rethrows failures as `CommandError`.
 */
export async function executeCommand<R = unknown>(
  id: string,
  input: unknown = {},
  ctx: CommandContext = { source: 'ui' },
): Promise<R> {
  const cmd = commands.get(id);
  if (!cmd) throw new CommandError(id, 'unknown command', 'not_found');
  if (cmd.isAvailable && !cmd.isAvailable()) throw new CommandError(id, 'not available right now', 'unavailable');

  const problems = validateAgainstSchema(input ?? {}, cmd.input);
  if (problems.length) throw new CommandError(id, problems.join('; '), 'invalid_input');

  if (cmd.requiresConfirmation) {
    if (!confirmHandler) throw new CommandError(id, 'requires confirmation but no confirmation handler is installed', 'needs_confirmation');
    const approved = await confirmHandler(cmd, input, ctx);
    if (!approved) throw new CommandError(id, 'declined by user', 'needs_confirmation');
  }

  const startedAt = Date.now();
  try {
    const result = (await cmd.run(input, ctx)) as R;
    record({ id, input, ctx, startedAt, durationMs: Date.now() - startedAt, ok: true });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    record({ id, input, ctx, startedAt, durationMs: Date.now() - startedAt, ok: false, error: message });
    if (err instanceof CommandError) throw err;
    throw new CommandError(id, message, 'failed');
  }
}

function record(entry: CommandLogEntry): void {
  log.push(entry);
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
  listeners.forEach((l) => l(entry));
}

export function onCommandExecuted(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCommandLog(): readonly CommandLogEntry[] {
  return log;
}

/**
 * Render the registry as LLM tool definitions. Tool names replace dots with
 * double underscores because the Messages API restricts names to `^[a-zA-Z0-9_-]{1,64}$`.
 */
export function toToolDefinitions(opts: { availableOnly?: boolean } = {}): ToolDefinition[] {
  return listCommands(opts).map((c) => ({
    name: commandIdToToolName(c.id),
    description: c.requiresConfirmation ? `${c.description} Requires user confirmation before it runs.` : c.description,
    input_schema: { ...c.input, type: 'object' as const },
  }));
}

export function commandIdToToolName(id: string): string {
  return id.replace(/\./g, '__');
}

export function toolNameToCommandId(name: string): string {
  return name.replace(/__/g, '.');
}

/** Test/HMR helper. */
export function _resetCommandRegistry(): void {
  commands.clear();
  listeners.clear();
  log.length = 0;
  confirmHandler = null;
}
