/**
 * Command registry types.
 *
 * A command is the single unit of user-visible action in medai-os. Toolbar
 * buttons, keyboard shortcuts, suite defaults, and the agent all invoke the
 * same command through `executeCommand()`. Commands carry a JSON-schema input
 * so that the same definition can be handed to an LLM as a tool definition.
 */

/** Minimal JSON Schema subset we validate against and hand to tool-using LLMs. */
export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: readonly (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

export type CommandCategory = 'viewer' | 'study' | 'layout' | 'measure' | 'overlay' | 'app';

export interface CommandContext {
  /** Who triggered the command. Recorded in the command log. */
  source: 'ui' | 'keyboard' | 'agent' | 'test' | 'system';
  /** Optional correlation id (e.g. agent tool_use id). */
  correlationId?: string;
}

export interface CommandDefinition<I = unknown, R = unknown> {
  /** Dotted, stable id: `viewer.loadStudy`, `layout.set`, `measure.length`. */
  id: string;
  /** Short human label for menus and the command palette. */
  title: string;
  /** What the command does; also the LLM tool description, so write it for both. */
  description: string;
  category: CommandCategory;
  /** JSON schema for `input`. `{type:'object', properties:{}}` for no-arg commands. */
  input: JsonSchema;
  /** If true the caller must obtain explicit user approval before `run`. Enforced by the executor. */
  requiresConfirmation?: boolean;
  /** Default keybinding, e.g. `'w'`, `'shift+r'`, `'mod+z'`. */
  keybinding?: string;
  /** Return false to hide the command from menus and refuse execution. */
  isAvailable?: () => boolean;
  run: (input: I, ctx: CommandContext) => Promise<R> | R;
}

export interface CommandLogEntry {
  id: string;
  input: unknown;
  ctx: CommandContext;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  error?: string;
}

/** Shape accepted by the Anthropic Messages API `tools` parameter. */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: JsonSchema & { type: 'object' };
  strict?: boolean;
}

export class CommandError extends Error {
  constructor(
    public readonly commandId: string,
    message: string,
    public readonly code: 'not_found' | 'unavailable' | 'invalid_input' | 'needs_confirmation' | 'failed',
  ) {
    super(`${commandId}: ${message}`);
    this.name = 'CommandError';
  }
}
