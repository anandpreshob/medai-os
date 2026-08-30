import { expect, type Locator, type Page } from '@playwright/test';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repo-root `sample-data/` (gitignored; populated by `scripts/sample-data/fetch.py` + `synth.py`). */
export const SAMPLE_DATA = resolve(HERE, '../../../../sample-data');

export function fixturePath(...parts: string[]): string {
  return join(SAMPLE_DATA, ...parts);
}

export function hasFixture(...parts: string[]): boolean {
  return existsSync(fixturePath(...parts));
}

/** All regular files under a directory (recursive), sorted. */
export function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (!name.startsWith('.')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export interface ConsoleCapture {
  errors: string[];
  warnings: string[];
}

/** Collect page errors and console errors; call before navigation. */
export function captureConsole(page: Page): ConsoleCapture {
  const cap: ConsoleCapture = { errors: [], warnings: [] };
  page.on('pageerror', (e) => cap.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') cap.errors.push(m.text());
    if (m.type() === 'warning') cap.warnings.push(m.text());
  });
  return cap;
}

/** Open local files through the real file input and wait for the viewer to settle. */
export async function openLocalFiles(page: Page, paths: string[]): Promise<void> {
  await page.goto('/local');
  await page.getByTestId('local-file-input').setInputFiles(paths);
  await expect(page).toHaveURL(/\/viewer\?local=/);
  await waitForViewer(page);
}

export async function waitForViewer(page: Page): Promise<void> {
  await expect(page.getByTestId('viewer-page')).toBeVisible();
  await expect(page.getByTestId('loading')).toBeHidden({ timeout: 60_000 });
  // Either an error surfaced or the first viewport rendered something.
  await expect(page.getByTestId('viewer-error').or(page.locator('[data-testid="viewport-0"][data-slice-count]:not([data-slice-count="0"])'))).toBeVisible({
    timeout: 60_000,
  });
}

export function viewport(page: Page, slot = 0): Locator {
  return page.getByTestId(`viewport-${slot}`);
}

export async function sliceInfo(page: Page, slot = 0): Promise<{ index: number; count: number }> {
  const vp = viewport(page, slot);
  return {
    index: Number(await vp.getAttribute('data-slice-index')),
    count: Number(await vp.getAttribute('data-slice-count')),
  };
}

export async function windowLevel(page: Page, slot = 0): Promise<{ width: number; center: number }> {
  const vp = viewport(page, slot);
  return {
    width: Number(await vp.getAttribute('data-window-width')),
    center: Number(await vp.getAttribute('data-window-center')),
  };
}

/** Run a viewer command exactly as the agent would. */
export async function runCommand(page: Page, id: string, input: unknown = {}): Promise<unknown> {
  return page.evaluate(
    async ([cid, cin]) => {
      const w = window as unknown as { __medai: { executeCommand: (id: string, input: unknown, ctx: unknown) => Promise<unknown> } };
      return w.__medai.executeCommand(cid, cin, { source: 'test' });
    },
    [id, input] as const,
  );
}

/** Mean intensity of the rendered viewport canvas inside a normalized rect (0..1 coords). */
export async function canvasMean(page: Page, slot: number, rect: { x: number; y: number; w: number; h: number }): Promise<number> {
  return page.evaluate(
    ([s, r]) => {
      const el = document.querySelector(`[data-testid="viewport-${s}"] canvas`) as HTMLCanvasElement | null;
      if (!el) throw new Error('no canvas');
      const off = document.createElement('canvas');
      off.width = el.width;
      off.height = el.height;
      const ctx = off.getContext('2d')!;
      ctx.drawImage(el, 0, 0);
      const x = Math.floor(r.x * el.width);
      const y = Math.floor(r.y * el.height);
      const w = Math.max(1, Math.floor(r.w * el.width));
      const h = Math.max(1, Math.floor(r.h * el.height));
      const d = ctx.getImageData(x, y, w, h).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return sum / (d.length / 4);
    },
    [slot, rect] as const,
  );
}

/** Read back a rendered pixel's RGB at normalized coords. */
export async function canvasPixel(page: Page, slot: number, x: number, y: number): Promise<[number, number, number]> {
  return page.evaluate(
    ([s, px, py]) => {
      const el = document.querySelector(`[data-testid="viewport-${s}"] canvas`) as HTMLCanvasElement | null;
      if (!el) throw new Error('no canvas');
      const off = document.createElement('canvas');
      off.width = el.width;
      off.height = el.height;
      const ctx = off.getContext('2d')!;
      ctx.drawImage(el, 0, 0);
      const d = ctx.getImageData(Math.floor(px * el.width), Math.floor(py * el.height), 1, 1).data;
      return [d[0], d[1], d[2]] as [number, number, number];
    },
    [slot, x, y] as const,
  );
}
