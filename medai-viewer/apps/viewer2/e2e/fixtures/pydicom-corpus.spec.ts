import { expect, test } from '@playwright/test';
import { captureConsole, fixturePath, hasFixture, openLocalFiles, viewport } from '../helpers';

/**
 * Transfer-syntax / IOD edge cases from the pydicom test corpus. One test per
 * file so the matrix can report each row. `kind`:
 *  - image: must display with the given frame count
 *  - derived: must be listed as a non-image object, not displayed, no crash
 *  - error: must surface a readable error, no crash
 */
type Case = { file: string; kind: 'image' | 'derived' | 'error' | 'upstream-bug'; frames?: number; modality?: string; note: string };

const CASES: Case[] = [
  { file: 'CT_small.dcm', kind: 'image', frames: 1, modality: 'CT', note: 'CT explicit little endian' },
  { file: 'MR_small.dcm', kind: 'image', frames: 1, modality: 'MR', note: 'MR explicit little endian' },
  { file: 'MR_small_RLE.dcm', kind: 'image', frames: 1, note: 'RLE lossless' },
  { file: 'MR_small_jp2klossless.dcm', kind: 'image', frames: 1, note: 'JPEG 2000 lossless' },
  { file: 'MR_small_jpeg_ls_lossless.dcm', kind: 'image', frames: 1, note: 'JPEG-LS lossless' },
  { file: 'JPEG2000.dcm', kind: 'image', frames: 1, note: 'JPEG 2000' },
  { file: 'JPEG-LL.dcm', kind: 'image', frames: 1, note: 'JPEG lossless' },
  { file: 'JPEG-lossy.dcm', kind: 'image', frames: 1, note: 'JPEG baseline 12-bit' },
  { file: '693_J2KI.dcm', kind: 'image', frames: 1, note: 'JPEG 2000 lossy' },
  { file: '693_UNCI.dcm', kind: 'image', frames: 1, note: 'uncompressed pair of 693_J2KI' },
  { file: 'emri_small.dcm', kind: 'image', frames: 10, modality: 'MR', note: 'Enhanced MR multi-frame' },
  { file: 'emri_small_RLE.dcm', kind: 'image', frames: 10, note: 'Enhanced MR, RLE' },
  { file: 'emri_small_big_endian.dcm', kind: 'image', frames: 10, note: 'Enhanced MR, big endian' },
  { file: 'emri_small_jpeg_2k_lossless.dcm', kind: 'image', frames: 10, note: 'Enhanced MR, J2K' },
  { file: 'US1_UNCR.dcm', kind: 'image', frames: 1, modality: 'US', note: 'Ultrasound RGB uncompressed' },
  { file: 'US1_J2KR.dcm', kind: 'image', frames: 1, note: 'Ultrasound RGB, J2K reversible' },
  { file: 'US1_J2KI.dcm', kind: 'image', frames: 1, note: 'Ultrasound RGB, J2K irreversible' },
  { file: 'color-pl.dcm', kind: 'image', frames: 1, note: 'RGB planar configuration 1' },
  { file: 'color-px.dcm', kind: 'image', frames: 1, note: 'RGB planar configuration 0' },
  { file: 'color3d_jpeg_baseline.dcm', kind: 'image', frames: 120, note: 'Colour multi-frame, JPEG baseline' },
  { file: 'SC_rgb.dcm', kind: 'image', frames: 1, note: 'Secondary capture RGB' },
  { file: 'SC_rgb_small_odd.dcm', kind: 'upstream-bug', note: 'RGB with odd dimensions — Cornerstone 5.8.2 throws "model.size is not a multiple of numberOfComponents"' },
  { file: 'ExplVR_BigEnd.dcm', kind: 'image', frames: 1, note: 'Explicit VR big endian' },
  { file: 'ExplVR_LitEndNoMeta.dcm', kind: 'error', note: 'No file meta information — unsupported by the 5.x naturalized parser; reported, not crashed' },
  { file: 'no_meta.dcm', kind: 'error', note: 'No preamble, no meta — unsupported by the 5.x naturalized parser; reported, not crashed' },
  { file: 'MR_truncated.dcm', kind: 'error', note: 'Truncated pixel data' },
  { file: 'rtstruct.dcm', kind: 'derived', note: 'RTSTRUCT' },
  { file: 'rtdose.dcm', kind: 'derived', note: 'RTDOSE' },
  { file: 'rtplan.dcm', kind: 'derived', note: 'RTPLAN' },
  { file: 'test-SR.dcm', kind: 'derived', note: 'Structured report' },
  { file: 'waveform_ecg.dcm', kind: 'derived', note: 'ECG waveform' },
];

test.describe('pydicom corpus', () => {
  for (const c of CASES) {
    test(`${c.file} — ${c.note}`, async ({ page }) => {
      test.skip(!hasFixture('pydicom-corpus', c.file), `fixture ${c.file} missing`);
      const cap = captureConsole(page);
      await openLocalFiles(page, [fixturePath('pydicom-corpus', c.file)]);
      const anyError = page.getByTestId('viewer-error').or(page.getByTestId('viewport-error'));

      if (c.kind === 'upstream-bug') {
        // Known Cornerstone limitation: documented in the matrix; the app must not hang.
        await expect(page.getByTestId('viewer-page')).toBeVisible();
        expect(cap.errors.some((e) => /numberOfComponents/.test(e))).toBe(true);
        return;
      }
      if (c.kind === 'error') {
        await expect(anyError).toBeVisible({ timeout: 30_000 });
        expect(cap.errors.filter((e) => /pageerror/.test(e))).toEqual([]);
        return;
      }
      if (c.kind === 'derived') {
        await expect(page.locator('[data-testid="series-item"][data-derived="true"]')).toHaveCount(1);
        await expect(page.getByTestId('viewer-error')).toBeHidden();
        await expect(viewport(page)).toHaveAttribute('data-slice-count', '0');
        expect(cap.errors.filter((e) => /pageerror/.test(e))).toEqual([]);
        return;
      }
      await expect(page.getByTestId('viewer-error')).toBeHidden();
      await expect(viewport(page)).toHaveAttribute('data-slice-count', String(c.frames ?? 1), { timeout: 30_000 });
      await expect(viewport(page).locator('canvas')).toBeVisible();
      if (c.modality) await expect(page.getByTestId('series-item').first()).toHaveAttribute('data-modality', c.modality);
      await expect(page.getByTestId('viewport-error')).toBeHidden();
      expect(cap.errors, cap.errors.join('\n')).toEqual([]);
    });
  }
});
