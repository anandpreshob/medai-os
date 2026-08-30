/**
 * In-memory staging for files opened from disk. A token in the URL refers to a
 * staged batch so the viewer page can be a plain route. Nothing is persisted.
 */
const staged = new Map<string, File[]>();
let counter = 0;

export function stageLocalFiles(files: File[]): string {
  const token = `L${Date.now().toString(36)}${(counter++).toString(36)}`;
  staged.set(token, files);
  return token;
}

export function takeLocalFiles(token: string): File[] | undefined {
  return staged.get(token);
}

/** Test hook: lets Playwright inject files without a file chooser. */
if (typeof window !== 'undefined') {
  (window as unknown as { __medaiStageFiles?: (files: File[]) => string }).__medaiStageFiles = stageLocalFiles;
}
