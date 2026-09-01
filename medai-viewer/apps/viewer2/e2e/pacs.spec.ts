import { expect, test, request as pwRequest } from '@playwright/test';
import { captureConsole, filesUnder, fixturePath, hasFixture, runCommand, viewport, waitForViewer, matrix } from './helpers';

/**
 * PACS path: STOW-RS upload → QIDO study list → WADO-RS retrieval → MPR.
 * Needs a reachable Orthanc (ORTHANC_URL, default http://localhost:8042); skips otherwise.
 * Leaves Orthanc as it found it (deletes the synthetic patient afterwards).
 */
const ORTHANC = process.env.ORTHANC_URL ?? 'http://localhost:8042';
const PATIENT_ID = 'SYNTH-001';

async function orthancUp(): Promise<boolean> {
  const ctx = await pwRequest.newContext();
  try {
    const r = await ctx.get(`${ORTHANC}/system`, { timeout: 3000 });
    return r.ok();
  } catch {
    return false;
  } finally {
    await ctx.dispose();
  }
}

async function deleteSyntheticPatient(): Promise<void> {
  const ctx = await pwRequest.newContext();
  try {
    const r = await ctx.post(`${ORTHANC}/tools/find`, { data: { Level: 'Patient', Query: { PatientID: PATIENT_ID } } });
    if (r.ok()) for (const id of (await r.json()) as string[]) await ctx.delete(`${ORTHANC}/patients/${id}`);
  } finally {
    await ctx.dispose();
  }
}

test.describe('PACS round trip', () => {
  test.beforeAll(async () => {
    test.skip(!(await orthancUp()), `Orthanc not reachable at ${ORTHANC}`);
    test.skip(!hasFixture('synth/synth-ct-cube/dicom'), 'fixture missing');
    await deleteSyntheticPatient();
  });
  test.afterAll(async () => {
    if (await orthancUp()) await deleteSyntheticPatient();
  });

  test('upload with STOW-RS, find with QIDO, open with WADO-RS, reformat', async ({ page }) => {
    matrix('cap-pacs-stow', 'cap-pacs-qido', 'cap-pacs-wado');
    test.setTimeout(180_000);
    const cap = captureConsole(page);
    await page.goto('/upload');
    await page.getByTestId('upload-file-input').setInputFiles(filesUnder(fixturePath('synth/synth-ct-cube/dicom')));
    await expect(page.getByTestId('upload-status')).toContainText(/Stored 32 instances/, { timeout: 60_000 });

    await page.goto('/');
    const row = page.locator('[data-testid="study-row"]', { hasText: 'SYNTH PHANTOM' });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('CT');
    await row.click();
    await expect(page).toHaveURL(/\/viewer\?studyUID=/);
    await waitForViewer(page);

    await expect(page.getByTestId('viewer-error')).toBeHidden();
    await expect(page.getByTestId('series-item')).toHaveCount(1);
    await expect(page.getByTestId('series-item').first()).toHaveAttribute('data-volumetric', 'true');
    await expect(viewport(page)).toHaveAttribute('data-slice-count', '32', { timeout: 60_000 });
    await expect(viewport(page)).toHaveAttribute('data-window-width', '400');
    await expect(page.getByTestId('overlay-top-left')).toContainText(PATIENT_ID);
    await expect(page.getByTestId('orient-right')).toHaveText('L');

    await runCommand(page, 'layout.set', { layout: 'mpr' });
    await expect(page.locator('[data-testid="viewport-2"] [data-testid="orient-top"]')).toHaveText('S', { timeout: 60_000 });
    await page.screenshot({ path: 'test-results/pacs-mpr.png' });
    expect(cap.errors, cap.errors.join('\n')).toEqual([]);
  });
});
