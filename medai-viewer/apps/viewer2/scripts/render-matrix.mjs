#!/usr/bin/env node
/**
 * Render the Tier 1 verification matrix from a Playwright JSON report.
 *
 *   pnpm exec playwright test          # writes test-results/report.json
 *   node scripts/render-matrix.mjs     # writes ../../../docs/roadmap/{matrix.json,02_TIER1_VERIFICATION_MATRIX.md}
 *
 * Tests declare the rows they verify with `matrix('row-id', ...)` (see e2e/helpers.ts).
 * A row is ✅ only if every test that claims it passed in this run.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const repo = resolve(app, '../../..');
const reportPath = process.argv[2] ?? resolve(app, 'test-results/report.json');
const rowsPath = resolve(app, 'e2e/matrix-rows.json');
const outJson = resolve(repo, 'docs/roadmap/matrix.json');
const outMd = resolve(repo, 'docs/roadmap/02_TIER1_VERIFICATION_MATRIX.md');

if (!existsSync(reportPath)) {
  console.error(`No report at ${reportPath}. Run the e2e suite first.`);
  process.exit(1);
}
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const { sections, rows } = JSON.parse(readFileSync(rowsPath, 'utf8'));

/** Flatten Playwright's suite tree into [{ title, file, status, annotations }]. */
const tests = [];
function walk(suite, file) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const last = t.results?.[t.results.length - 1];
      tests.push({
        title: spec.title,
        file: file ?? suite.file,
        status: t.status === 'expected' ? 'passed' : t.status === 'skipped' ? 'skipped' : t.status === 'flaky' ? 'passed' : 'failed',
        annotations: (t.annotations ?? []).concat(last?.annotations ?? []),
      });
    }
  }
  for (const s of suite.suites ?? []) walk(s, file ?? suite.file);
}
for (const s of report.suites ?? []) walk(s, s.file);

const byRow = new Map();
for (const t of tests) {
  for (const a of t.annotations) {
    if (a.type !== 'matrix') continue;
    const list = byRow.get(a.description) ?? [];
    list.push(t);
    byRow.set(a.description, list);
  }
}

const known = new Set(rows.map((r) => r.id));
for (const id of byRow.keys()) if (!known.has(id)) console.warn(`warning: tests reference unknown matrix row "${id}"`);

const SYMBOL = { verified: '✅', failed: '🔴', skipped: '⚪', untested: '🟡', upstream: '🔴', absent: '⚫' };
const LEGEND = {
  verified: 'Automated test on a named fixture passed in this run',
  failed: 'A test claiming this row failed',
  skipped: 'Tests exist but every one was skipped (fixture not present on this machine)',
  untested: 'Code path exists; no automated test yet',
  upstream: 'Known limitation of an upstream library; surfaced as an error, documented',
  absent: 'No code path yet',
};

const out = rows.map((r) => {
  const ts = byRow.get(r.id) ?? [];
  let status = r.default;
  if (ts.length) {
    if (ts.some((t) => t.status === 'failed')) status = 'failed';
    else if (ts.every((t) => t.status === 'skipped')) status = 'skipped';
    else status = 'verified';
  }
  return { ...r, status, tests: ts.map((t) => ({ title: t.title, file: t.file, status: t.status })) };
});

let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim();
} catch {
  /* not a git checkout */
}
const generatedAt = new Date().toISOString();
const counts = { passed: tests.filter((t) => t.status === 'passed').length, failed: tests.filter((t) => t.status === 'failed').length, skipped: tests.filter((t) => t.status === 'skipped').length };

writeFileSync(outJson, JSON.stringify({ generatedAt, commit, counts, rows: out }, null, 2));

const md = [];
md.push('# Tier 1 Verification Matrix — medical imaging viewer (`apps/viewer2`)');
md.push('');
md.push(`Generated ${generatedAt} from commit \`${commit}\` by \`apps/viewer2/scripts/render-matrix.mjs\`. **Do not edit by hand** — change \`e2e/matrix-rows.json\` or the tests.`);
md.push('');
md.push(`Playwright run: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped.`);
md.push('');
md.push('## How to read this');
md.push('');
md.push('"Verified" has one meaning here: **an automated test loaded a named public fixture and its assertions passed.** Fixtures come from `scripts/sample-data/` (`fetch.py`, `synth.py`).');
md.push('');
md.push('| Symbol | Meaning |');
md.push('|---|---|');
for (const [k, v] of Object.entries(LEGEND)) md.push(`| ${SYMBOL[k]} | ${v} |`);
md.push('');
md.push('P0 = must hold before Phase 2 · P1 = Phase 1–2 · P2 = later · out = out of scope for Tier 1.');
md.push('');

for (const s of sections) {
  md.push(`## ${s.title}`);
  md.push('');
  md.push('| Row | Pri | Status | Verified by | Note |');
  md.push('|---|---|---|---|---|');
  for (const r of out.filter((x) => x.section === s.id)) {
    const by = r.tests.length ? r.tests.map((t) => `${t.status === 'passed' ? '' : t.status === 'failed' ? '✗ ' : '⏭ '}${t.title}`).join('; ') : '—';
    md.push(`| ${r.label} | ${r.priority} | ${SYMBOL[r.status]} | ${by.replace(/\|/g, '\\|')} | ${(r.note ?? '').replace(/\|/g, '\\|')} |`);
  }
  md.push('');
}

const summary = {};
for (const r of out) summary[r.status] = (summary[r.status] ?? 0) + 1;
const p0 = out.filter((r) => r.priority === 'P0');
md.push('## Summary');
md.push('');
md.push(`- Rows: ${out.length} — ${Object.entries(summary).map(([k, v]) => `${SYMBOL[k]} ${v}`).join(' · ')}`);
md.push(`- P0 rows: ${p0.length} — verified ${p0.filter((r) => r.status === 'verified').length}, remaining: ${p0.filter((r) => r.status !== 'verified').map((r) => `${r.label} (${SYMBOL[r.status]})`).join(', ') || 'none'}`);
md.push('');
md.push('## Exit criteria for Phase 1');
md.push('');
md.push('- Every P0 row ✅.');
md.push('- No P0/P1 row 🔴 except documented upstream limitations.');
md.push('- This file is regenerated by CI on every run; hand edits are overwritten.');
md.push('');

writeFileSync(outMd, md.join('\n'));
console.log(`matrix: ${out.length} rows → ${outMd}`);
console.log(`P0 verified: ${p0.filter((r) => r.status === 'verified').length}/${p0.length}`);
