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

/** Expand any .zip archives in the selection into their member files (in memory). */
export async function expandArchives(files: File[]): Promise<{ files: File[]; skipped: string[] }> {
  const out: File[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) {
      out.push(f);
      continue;
    }
    try {
      const { unzipSync } = await import('fflate');
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const [path, bytes] of Object.entries(entries)) {
        if (path.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(path) || bytes.length === 0) continue;
        out.push(new File([bytes.slice().buffer as ArrayBuffer], path.split('/').pop() ?? path, { type: 'application/octet-stream' }));
      }
    } catch (e) {
      skipped.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { files: out, skipped };
}

export function takeLocalFiles(token: string): File[] | undefined {
  return staged.get(token);
}

/** Test hook: lets Playwright inject files without a file chooser. */
if (typeof window !== 'undefined') {
  (window as unknown as { __medaiStageFiles?: (files: File[]) => string }).__medaiStageFiles = stageLocalFiles;
}
