import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { captureConsole, filesUnder, fixturePath, hasFixture, openLocalFiles, runCommand, viewport, matrix } from '../helpers';

/**
 * Matrix rows: "Measurements: length …", "DICOM folder / zip". Length is checked against known
 * geometry: the synthetic CT has 1.0 mm pixels and is 64 px wide, so a drag of N canvas px on the
 * fitted image must measure N × (64 mm / image height on screen).
 */
const FIX = 'synth/synth-ct-cube';
test.skip(!hasFixture(FIX, 'dicom'), 'fixture missing');
const expected = hasFixture(FIX, 'expected.json') ? JSON.parse(readFileSync(fixturePath(FIX, 'expected.json'), 'utf8')) : {};

test.describe('measurements', () => {
  test('a length measurement reports the correct millimetres and appears in measure.list', async ({ page }) => {
    matrix('cap-measure-tools', 'cap-measure-list', 'cap-commands');
    const cap = captureConsole(page);
    await openLocalFiles(page, filesUnder(fixturePath(FIX, 'dicom')));
    await expect(viewport(page)).toHaveAttribute('data-slice-count', String(expected.slice_count));

    await runCommand(page, 'viewer.setTool', { tool: 'Length' });
    await expect(page.getByTestId('tool-Length')).toHaveAttribute('aria-pressed', 'true');

    // Find the bright cuboid's left/right edges on the rendered canvas (middle row) and measure across it.
    const edges = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="viewport-0"] canvas') as HTMLCanvasElement;
      const off = document.createElement('canvas');
      off.width = el.width;
      off.height = el.height;
      const ctx = off.getContext('2d')!;
      ctx.drawImage(el, 0, 0);
      const rect = el.getBoundingClientRect();
      const scale = rect.width / el.width;
      let bestRow = -1;
      let best: { left: number; right: number } | null = null;
      for (let y = Math.floor(el.height * 0.3); y < el.height * 0.7; y += 4) {
        const row = ctx.getImageData(0, y, el.width, 1).data;
        let left = -1;
        let right = -1;
        for (let x = 0; x < el.width; x++) {
          if (row[x * 4] > 220) {
            if (left < 0) left = x;
            right = x;
          }
        }
        if (left >= 0 && (!best || right - left > best.right - best.left)) {
          best = { left, right };
          bestRow = y;
        }
      }
      if (!best) throw new Error('cuboid not found on canvas');
      return { x0: rect.left + best.left * scale, x1: rect.left + (best.right + 1) * scale, y: rect.top + bestRow * scale };
    });
    const expectedMm = expected.cuboid.edge_lengths_mm_xyz[0]; // 20 mm

    await page.mouse.move(edges.x0, edges.y);
    await page.mouse.down();
    await page.mouse.move((edges.x0 + edges.x1) / 2, edges.y, { steps: 5 });
    await page.mouse.move(edges.x1, edges.y, { steps: 5 });
    await page.mouse.up();
    // Stats are recomputed on the next render; hovering triggers one.
    await page.mouse.move(edges.x1 + 40, edges.y + 40);

    type M = { tool: string; points: number[][]; stats: Record<string, number | string> };
    const handleDistance = (m: M) => Math.hypot(...m.points[0].map((v, i) => v - m.points[1][i]));
    await expect
      .poll(async () => {
        const m = ((await runCommand(page, 'measure.list')) as M[]).find((x) => x.tool === 'Length');
        return m ? Math.abs(Number(m.stats.length) - handleDistance(m)) : Infinity;
      })
      .toBeLessThan(0.05);

    const length = ((await runCommand(page, 'measure.list')) as M[]).find((m) => m.tool === 'Length')!;
    const mm = Number(length.stats.length);
    expect(Math.abs(mm - expectedMm) / expectedMm).toBeLessThan(0.03);
    expect(length.stats.unit ?? 'mm').toBe('mm');

    // Clear-all requires confirmation; the test confirmation handler auto-accepts.
    await page.evaluate(() => {
      (window as unknown as { confirm: () => boolean }).confirm = () => true;
    });
    await runCommand(page, 'measure.clearAll');
    await expect.poll(async () => ((await runCommand(page, 'measure.list')) as unknown[]).length).toBe(0);
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });

  test('a zipped DICOM series opens like a folder', async ({ page }) => {
    matrix('fmt-dicom-zip');
    test.skip(!hasFixture('slicer', 'deidentifiedMRHead-dcm-one-series.zip'), 'fixture missing');
    const cap = captureConsole(page);
    await openLocalFiles(page, [fixturePath('slicer', 'deidentifiedMRHead-dcm-one-series.zip')]);
    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '130', { timeout: 60_000 });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});
