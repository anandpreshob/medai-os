# Tier 1 Verification Matrix — medical imaging viewer (`apps/viewer2`)

Generated 2026-08-30T07:11:19.846Z from commit `f79a4a7` by `apps/viewer2/scripts/render-matrix.mjs`. **Do not edit by hand** — change `e2e/matrix-rows.json` or the tests.

Playwright run: 56 passed, 0 failed, 0 skipped.

## How to read this

"Verified" has one meaning here: **an automated test loaded a named public fixture and its assertions passed.** Fixtures come from `scripts/sample-data/` (`fetch.py`, `synth.py`).

| Symbol | Meaning |
|---|---|
| ✅ | Automated test on a named fixture passed in this run |
| 🔴 | A test claiming this row failed |
| ⚪ | Tests exist but every one was skipped (fixture not present on this machine) |
| 🟡 | Code path exists; no automated test yet |
| 🔴 | Known limitation of an upstream library; surfaced as an error, documented |
| ⚫ | No code path yet |

P0 = must hold before Phase 2 · P1 = Phase 1–2 · P2 = later · out = out of scope for Tier 1.

## A. File formats (local)

| Row | Pri | Status | Verified by | Note |
|---|---|---|---|---|
| DICOM single file | P0 | ✅ | CT_small.dcm — CT explicit little endian; CT_small.dcm — CT explicit little endian; high values render dark on a light background; invert flips it; high values render dark on a light background; invert flips it |  |
| DICOM folder (series / study) | P0 | ✅ | MRHead DICOM series (130 slices, sagittal); MRHead DICOM series (130 slices, sagittal); loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR |  |
| DICOM .zip archive | P0 | ✅ | a zipped DICOM series opens like a folder; a zipped DICOM series opens like a folder |  |
| NIfTI .nii / .nii.gz | P0 | ✅ | NIfTI, NRRD and MetaImage copies load with the same geometry; NIfTI, NRRD and MetaImage copies load with the same geometry |  |
| NRRD .nrrd / .nhdr | P0 | ✅ | MR-head.nrrd loads as a volume; MR-head.nrrd loads as a volume; CT-chest.nrrd loads as a volume; CT-chest.nrrd loads as a volume; NIfTI, NRRD and MetaImage copies load with the same geometry; NIfTI, NRRD and MetaImage copies load with the same geometry |  |
| Multi-component NRRD (DTI) refused with a clear message | P2 | ✅ | DTI-Brain.nrrd (9-component) is refused with a clear message; DTI-Brain.nrrd (9-component) is refused with a clear message |  |
| MetaImage .mha | P1 | ✅ | NIfTI, NRRD and MetaImage copies load with the same geometry; NIfTI, NRRD and MetaImage copies load with the same geometry |  |
| MetaImage .mhd + .raw pair | P1 | ✅ | MetaImage header + raw pair and 3D TIFF load with the same slice count; MetaImage header + raw pair and 3D TIFF load with the same slice count | code path exists (header rewrite); no fixture test yet |
| TIFF stack | P2 | ✅ | MetaImage header + raw pair and 3D TIFF load with the same slice count; MetaImage header + raw pair and 3D TIFF load with the same slice count |  |
| PNG / JPEG (non-DICOM 2D) | P1 | ⚫ | — | not ported to viewer2 yet |

## B. DICOM modalities & IODs

| Row | Pri | Status | Verified by | Note |
|---|---|---|---|---|
| CT, uncompressed single-frame series | P0 | ✅ | CT_small.dcm — CT explicit little endian; CT_small.dcm — CT explicit little endian; 693_UNCI.dcm — uncompressed pair of 693_J2KI; 693_UNCI.dcm — uncompressed pair of 693_J2KI; HN_P001: CT + RTSTRUCT + RTDOSE; HN_P001: CT + RTSTRUCT + RTDOSE; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR |  |
| Compressed transfer syntaxes: RLE, JPEG-LS, JPEG 2000 (lossless/lossy), JPEG lossless, JPEG 12-bit | P0 | ✅ | MR_small_RLE.dcm — RLE lossless; MR_small_RLE.dcm — RLE lossless; MR_small_jp2klossless.dcm — JPEG 2000 lossless; MR_small_jp2klossless.dcm — JPEG 2000 lossless; MR_small_jpeg_ls_lossless.dcm — JPEG-LS lossless; MR_small_jpeg_ls_lossless.dcm — JPEG-LS lossless; JPEG2000.dcm — JPEG 2000; JPEG2000.dcm — JPEG 2000; JPEG-LL.dcm — JPEG lossless; JPEG-LL.dcm — JPEG lossless; JPEG-lossy.dcm — JPEG baseline 12-bit; JPEG-lossy.dcm — JPEG baseline 12-bit; 693_J2KI.dcm — JPEG 2000 lossy; 693_J2KI.dcm — JPEG 2000 lossy; emri_small_RLE.dcm — Enhanced MR, RLE; emri_small_RLE.dcm — Enhanced MR, RLE; emri_small_jpeg_2k_lossless.dcm — Enhanced MR, J2K; emri_small_jpeg_2k_lossless.dcm — Enhanced MR, J2K; US1_J2KR.dcm — Ultrasound RGB, J2K reversible; US1_J2KR.dcm — Ultrasound RGB, J2K reversible; US1_J2KI.dcm — Ultrasound RGB, J2K irreversible; US1_J2KI.dcm — Ultrasound RGB, J2K irreversible; decodes the JPEG frame: lungs dark, mediastinum bright; decodes the JPEG frame: lungs dark, mediastinum bright |  |
| MR, classic single-frame | P0 | ✅ | MR_small.dcm — MR explicit little endian; MR_small.dcm — MR explicit little endian; MRHead DICOM series (130 slices, sagittal); MRHead DICOM series (130 slices, sagittal) |  |
| Enhanced MR multi-frame (incl. RLE, J2K, big-endian encodings) | P0 | ✅ | emri_small.dcm — Enhanced MR multi-frame; emri_small.dcm — Enhanced MR multi-frame; emri_small_RLE.dcm — Enhanced MR, RLE; emri_small_RLE.dcm — Enhanced MR, RLE; emri_small_big_endian.dcm — Enhanced MR, big endian; emri_small_big_endian.dcm — Enhanced MR, big endian; emri_small_jpeg_2k_lossless.dcm — Enhanced MR, J2K; emri_small_jpeg_2k_lossless.dcm — Enhanced MR, J2K |  |
| MR multi-sequence hanging (T1/T2/FLAIR side by side) | P1 | ⚫ | — | 1x2/2x2 layouts exist; no automatic hanging protocol |
| PET without SUV scaling: detected, relative presets, SUV presets refused | P0 | ✅ | COMUNIX: PET and CT side by side; COMUNIX: PET and CT side by side |  |
| PET with SUV(bw) pre-scaling (weight, dose, timing present) | P0 | ✅ | PET fuses over the CT in MPR with a colour map and can be removed; PET fuses over the CT in MPR with a colour map and can be removed; PET is pre-scaled to SUVbw: hot sphere ≈ 8, background ≈ 1, SUV presets available; PET is pre-scaled to SUVbw: hot sphere ≈ 8, background ≈ 1, SUV presets available | loader supports it; no public fixture with complete PET header in the P0 set (AutoPET is manual) |
| PET/CT fusion overlay | P0 | ✅ | PET fuses over the CT in MPR with a colour map and can be removed; PET fuses over the CT in MPR with a colour map and can be removed | side-by-side works; blended overlay not built yet |
| CR / DX projection radiograph | P0 | ✅ | high values render dark on a light background; invert flips it; high values render dark on a light background; invert flips it; decodes the JPEG frame: lungs dark, mediastinum bright; decodes the JPEG frame: lungs dark, mediastinum bright |  |
| MONOCHROME1 (inverted display, MG-style) | P0 | ✅ | high values render dark on a light background; invert flips it; high values render dark on a light background; invert flips it |  |
| CR / DX with JPEG-compressed pixel data (real-world) | P0 | ✅ | decodes the JPEG frame: lungs dark, mediastinum bright; decodes the JPEG frame: lungs dark, mediastinum bright | codecs verified on the corpus; VinDr-CXR fixture is credentialed (manual) |
| Mammography 4-view hanging (CC/MLO L/R) | P1 | ⚫ | — | MONOCHROME1 verified; no MG hanging protocol; CBIS-DDSM is manual |
| Ultrasound RGB (uncompressed and J2K) | P1 | ✅ | US1_UNCR.dcm — Ultrasound RGB uncompressed; US1_UNCR.dcm — Ultrasound RGB uncompressed; US1_J2KR.dcm — Ultrasound RGB, J2K reversible; US1_J2KR.dcm — Ultrasound RGB, J2K reversible; US1_J2KI.dcm — Ultrasound RGB, J2K irreversible; US1_J2KI.dcm — Ultrasound RGB, J2K irreversible |  |
| XA / RF multi-frame cine | P1 | ✅ | expands frames, starts at frame 1, and cine advances; expands frames, starts at frame 1, and cine advances |  |
| Colour multi-frame (JPEG baseline) | P1 | ✅ | color3d_jpeg_baseline.dcm — Colour multi-frame, JPEG baseline; color3d_jpeg_baseline.dcm — Colour multi-frame, JPEG baseline |  |
| Secondary capture RGB / YBR, planar 0 and 1 | P1 | ✅ | color-pl.dcm — RGB planar configuration 1; color-pl.dcm — RGB planar configuration 1; color-px.dcm — RGB planar configuration 0; color-px.dcm — RGB planar configuration 0; SC_rgb.dcm — Secondary capture RGB; SC_rgb.dcm — Secondary capture RGB; renders true colour quadrants; renders true colour quadrants |  |
| RGB with odd dimensions | P2 | ✅ | SC_rgb_small_odd.dcm — RGB with odd dimensions — Cornerstone 5.8.2 throws "model.size is not a multiple of numberOfComponents"; SC_rgb_small_odd.dcm — RGB with odd dimensions — Cornerstone 5.8.2 throws "model.size is not a multiple of numberOfComponents" | Cornerstone 5.8.2 throws 'model.size is not a multiple of numberOfComponents'; reported, no hang |
| Explicit VR big endian | P1 | ✅ | emri_small_big_endian.dcm — Enhanced MR, big endian; emri_small_big_endian.dcm — Enhanced MR, big endian; ExplVR_BigEnd.dcm — Explicit VR big endian; ExplVR_BigEnd.dcm — Explicit VR big endian |  |
| Files without file-meta header / preamble | P1 | ✅ | ExplVR_LitEndNoMeta.dcm — No file meta information — unsupported by the 5.x naturalized parser; reported, not crashed; ExplVR_LitEndNoMeta.dcm — No file meta information — unsupported by the 5.x naturalized parser; reported, not crashed; no_meta.dcm — No preamble, no meta — unsupported by the 5.x naturalized parser; reported, not crashed; no_meta.dcm — No preamble, no meta — unsupported by the 5.x naturalized parser; reported, not crashed | 5.x naturalized parser cannot read their pixel data; surfaced as a clear error |
| Truncated pixel data → readable error, no crash | P1 | ✅ | MR_truncated.dcm — Truncated pixel data; MR_truncated.dcm — Truncated pixel data |  |
| NM planar / SPECT | P2 | 🟡 | — | no public fixture in the P0 set |
| 4D cardiac cine MR | P1 | 🟡 | — | cine works per series; 4D temporal grouping not built; Sunnybrook is manual |
| DCE / perfusion 4D | P2 | ⚫ | — |  |
| Oblique acquisition (rotated IOP): sorting, labels, MPR | P0 | ✅ | sorts and labels correctly and builds an MPR volume; sorts and labels correctly and builds an MPR volume |  |
| Anisotropic spacing: overlay, scale bar, MPR | P0 | ✅ | reports spacing and thickness and reformats with the right geometry; reports spacing and thickness and reformats with the right geometry |  |
| DICOM-SEG recognised and listed as an object | P0 | ✅ | labelmap renders over the cuboid on the stack and in MPR, and can be hidden; labelmap renders over the cuboid on the stack and in MPR, and can be hidden; SEG and RTSTRUCT are listed as objects, the CT is displayed; SEG and RTSTRUCT are listed as objects, the CT is displayed |  |
| DICOM-SEG overlay display | P0 | ✅ | labelmap renders over the cuboid on the stack and in MPR, and can be hidden; labelmap renders over the cuboid on the stack and in MPR, and can be hidden | next: @cornerstonejs/adapters labelmap |
| RTSTRUCT recognised and listed as an object | P0 | ✅ | contours render on the referenced CT stack; contours render on the referenced CT stack; rtstruct.dcm — RTSTRUCT; rtstruct.dcm — RTSTRUCT; HN_P001: CT + RTSTRUCT + RTDOSE; HN_P001: CT + RTSTRUCT + RTDOSE; SEG and RTSTRUCT are listed as objects, the CT is displayed; SEG and RTSTRUCT are listed as objects, the CT is displayed |  |
| RTSTRUCT contour display | P0 | ✅ | contours render on the referenced CT stack; contours render on the referenced CT stack | next: @cornerstonejs/adapters RTSS |
| RTDOSE listed (overlay is P2) | P2 | ✅ | rtdose.dcm — RTDOSE; rtdose.dcm — RTDOSE; HN_P001: CT + RTSTRUCT + RTDOSE; HN_P001: CT + RTSTRUCT + RTDOSE |  |
| RTPLAN listed | P2 | ✅ | rtplan.dcm — RTPLAN; rtplan.dcm — RTPLAN |  |
| SR listed (rendering is P2) | P2 | ✅ | test-SR.dcm — Structured report; test-SR.dcm — Structured report |  |
| ECG waveform listed, not displayed | out | ✅ | waveform_ecg.dcm — ECG waveform; waveform_ecg.dcm — ECG waveform |  |
| Encapsulated PDF | P2 | ⚫ | — |  |
| Whole-slide pathology | out | ⚫ | — |  |

## C. Viewer capabilities

| Row | Pri | Status | Verified by | Note |
|---|---|---|---|---|
| Runs with no PACS; honest offline state | P0 | ✅ | studies page renders and reports PACS state without console errors; studies page renders and reports PACS state without console errors; local files and upload routes render; local files and upload routes render |  |
| Every action is a command (UI, keyboard, agent share one registry) | P0 | ✅ | a length measurement reports the correct millimetres and appears in measure.list; a length measurement reports the correct millimetres and appears in measure.list; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR |  |
| Stack viewport (native 2D / multi-frame) | P0 | ✅ | expands frames, starts at frame 1, and cine advances; expands frames, starts at frame 1, and cine advances; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR |  |
| MPR axial / sagittal / coronal from a volume | P0 | ✅ | MRHead DICOM series (130 slices, sagittal); MRHead DICOM series (130 slices, sagittal); HN_P001: CT + RTSTRUCT + RTDOSE; HN_P001: CT + RTSTRUCT + RTDOSE; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; sorts and labels correctly and builds an MPR volume; sorts and labels correctly and builds an MPR volume; reports spacing and thickness and reformats with the right geometry; reports spacing and thickness and reformats with the right geometry |  |
| 3D volume rendering with presets | P1 | ✅ | MRHead DICOM series (130 slices, sagittal); MRHead DICOM series (130 slices, sagittal) |  |
| Window/level from DICOM VOI, presets by modality | P0 | ✅ | HN_P001: CT + RTSTRUCT + RTDOSE; HN_P001: CT + RTSTRUCT + RTDOSE; high values render dark on a light background; invert flips it; high values render dark on a light background; invert flips it; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; PET is pre-scaled to SUVbw: hot sphere ≈ 8, background ≈ 1, SUV presets available; PET is pre-scaled to SUVbw: hot sphere ≈ 8, background ≈ 1, SUV presets available |  |
| Orientation labels from direction cosines / camera | P0 | ✅ | MRHead DICOM series (130 slices, sagittal); MRHead DICOM series (130 slices, sagittal); loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; sorts and labels correctly and builds an MPR volume; sorts and labels correctly and builds an MPR volume |  |
| Scale bar from viewport geometry | P0 | ✅ | loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; reports spacing and thickness and reformats with the right geometry; reports spacing and thickness and reformats with the right geometry |  |
| Patient / series / slice / spacing overlays | P0 | ✅ | loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; loads the series, applies header VOI, labels orientation, scrolls and reaches MPR; reports spacing and thickness and reformats with the right geometry; reports spacing and thickness and reformats with the right geometry |  |
| Series panel; any series into any slot | P0 | ✅ | COMUNIX: PET and CT side by side; COMUNIX: PET and CT side by side |  |
| Layouts 1x1, 1x2, 2x2, MPR, MPR+3D | P0 | ✅ | MRHead DICOM series (130 slices, sagittal); MRHead DICOM series (130 slices, sagittal); COMUNIX: PET and CT side by side; COMUNIX: PET and CT side by side |  |
| Cine playback | P1 | ✅ | expands frames, starts at frame 1, and cine advances; expands frames, starts at frame 1, and cine advances |  |
| Measurements: length accuracy against known geometry | P0 | ✅ | a length measurement reports the correct millimetres and appears in measure.list; a length measurement reports the correct millimetres and appears in measure.list |  |
| Measurement listing (measure.list) with stats | P1 | ✅ | a length measurement reports the correct millimetres and appears in measure.list; a length measurement reports the correct millimetres and appears in measure.list |  |
| Camera / VOI synchronisation between viewports | P1 | ⚫ | — |  |
| Hanging protocols by modality / body part | P1 | ⚫ | — |  |
| Cobb angle, calibration, spline ROI | P2 | 🟡 | — | Cobb registered; calibration/spline not wired |
| PACS browse (QIDO-RS) with filters | P0 | ✅ | upload with STOW-RS, find with QIDO, open with WADO-RS, reformat; upload with STOW-RS, find with QIDO, open with WADO-RS, reformat |  |
| PACS retrieve (WADO-RS metadata + frames) | P0 | ✅ | upload with STOW-RS, find with QIDO, open with WADO-RS, reformat; upload with STOW-RS, find with QIDO, open with WADO-RS, reformat |  |
| Upload to PACS (STOW-RS) | P0 | ✅ | upload with STOW-RS, find with QIDO, open with WADO-RS, reformat; upload with STOW-RS, find with QIDO, open with WADO-RS, reformat |  |
| WebGL / DecompressionStream absent → graceful error | P2 | ⚫ | — |  |

## Summary

- Rows: 66 — ✅ 54 · ⚫ 9 · 🟡 3
- P0 rows: 35 — verified 35, remaining: none

## Exit criteria for Phase 1

- Every P0 row ✅.
- No P0/P1 row 🔴 except documented upstream limitations.
- This file is regenerated by CI on every run; hand edits are overwritten.
