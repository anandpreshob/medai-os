import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommandError,
  _resetCommandRegistry,
  executeCommand,
  getCommandLog,
  listCommands,
  onCommandExecuted,
  registerCommand,
  setConfirmationHandler,
  toToolDefinitions,
  toolNameToCommandId,
} from '../index';

describe('command registry', () => {
  beforeEach(() => _resetCommandRegistry());

  it('registers and executes a command with validated input', async () => {
    const run = vi.fn((input: { index: number }) => input.index * 2);
    registerCommand({
      id: 'viewer.scrollTo',
      title: 'Scroll to slice',
      description: 'Scroll the active viewport to a slice index.',
      category: 'viewer',
      input: { type: 'object', properties: { index: { type: 'integer', minimum: 0 } }, required: ['index'] },
      run,
    });
    await expect(executeCommand('viewer.scrollTo', { index: 4 })).resolves.toBe(8);
    expect(run).toHaveBeenCalledWith({ index: 4 }, { source: 'ui' });
  });

  it('rejects invalid input before running', async () => {
    const run = vi.fn();
    registerCommand({
      id: 'viewer.scrollTo',
      title: 't',
      description: 'd',
      category: 'viewer',
      input: { type: 'object', properties: { index: { type: 'integer', minimum: 0 } }, required: ['index'] },
      run,
    });
    await expect(executeCommand('viewer.scrollTo', { index: -1 })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(executeCommand('viewer.scrollTo', {})).rejects.toMatchObject({ code: 'invalid_input' });
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses unknown ids and bad id formats', async () => {
    await expect(executeCommand('nope.nothing')).rejects.toMatchObject({ code: 'not_found' });
    expect(() =>
      registerCommand({ id: 'BadId', title: 't', description: 'd', category: 'app', input: { type: 'object' }, run: () => {} }),
    ).toThrow(/dotted/);
  });

  it('enforces confirmation through the installed handler', async () => {
    const run = vi.fn(() => 'done');
    registerCommand({
      id: 'study.deleteLocal',
      title: 't',
      description: 'd',
      category: 'study',
      input: { type: 'object' },
      requiresConfirmation: true,
      run,
    });
    await expect(executeCommand('study.deleteLocal')).rejects.toMatchObject({ code: 'needs_confirmation' });
    setConfirmationHandler(async () => false);
    await expect(executeCommand('study.deleteLocal')).rejects.toMatchObject({ code: 'needs_confirmation' });
    expect(run).not.toHaveBeenCalled();
    setConfirmationHandler(async () => true);
    await expect(executeCommand('study.deleteLocal')).resolves.toBe('done');
  });

  it('logs executions and notifies listeners, including failures', async () => {
    const seen: string[] = [];
    onCommandExecuted((e) => seen.push(`${e.id}:${e.ok}`));
    registerCommand({
      id: 'app.fail',
      title: 't',
      description: 'd',
      category: 'app',
      input: { type: 'object' },
      run: () => {
        throw new Error('boom');
      },
    });
    await expect(executeCommand('app.fail')).rejects.toBeInstanceOf(CommandError);
    expect(seen).toEqual(['app.fail:false']);
    expect(getCommandLog()[0]).toMatchObject({ id: 'app.fail', ok: false, error: 'boom' });
  });

  it('hides unavailable commands and refuses to run them', async () => {
    registerCommand({
      id: 'viewer.nextSlice',
      title: 't',
      description: 'd',
      category: 'viewer',
      input: { type: 'object' },
      isAvailable: () => false,
      run: () => {},
    });
    expect(listCommands({ availableOnly: true })).toHaveLength(0);
    expect(listCommands()).toHaveLength(1);
    await expect(executeCommand('viewer.nextSlice')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('renders LLM tool definitions with API-safe names', () => {
    registerCommand({
      id: 'viewer.loadStudy',
      title: 'Load study',
      description: 'Load a study from the PACS into the viewer.',
      category: 'study',
      input: { type: 'object', properties: { studyInstanceUID: { type: 'string' } }, required: ['studyInstanceUID'] },
      run: () => {},
    });
    const [tool] = toToolDefinitions();
    expect(tool.name).toBe('viewer__loadStudy');
    expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(tool.input_schema.type).toBe('object');
    expect(toolNameToCommandId(tool.name)).toBe('viewer.loadStudy');
  });
});
