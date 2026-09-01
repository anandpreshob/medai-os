# Tier 1 manual load checklist

Hands-on verification with your own images, on top of the automated matrix. Open
`http://localhost:3100` → **Open local files** (drop a folder, a `.zip`, or files),
or upload to Orthanc and open from the studies list. Tick `[x]` and note the
source you used; anything wrong goes into the *Result* column verbatim.

Legend for **Auto**: ✅ verified by a CI test on a public/synthetic fixture · 🟡 code path, no test · ⚫ not built yet.

## A. File formats

| # | What to load | What to look for in your own files | Auto | What to check on screen | Done | Result |
|---|---|---|---|---|---|---|
| A1 | One DICOM file (`.dcm`) | Any single slice or a single projection | ✅ | Renders; patient/series overlay; W/L from header | [ ] | |
| A2 | A DICOM **folder** with one series | Any CT/MR export folder | ✅ | Slice count matches; sorted (scroll through, no jumps); MPR works | [ ] | |
| A3 | A DICOM folder with a **whole study** (several series, ideally several modalities) | PET/CT export, CT + RTSTRUCT, MR with localizer + several sequences | ✅ | Series panel lists all; each opens; derived objects shown as SEG/RTSTRUCT/… | [ ] | |
| A4 | A DICOM **.zip** | Zip an A2/A3 folder | ✅ | Same as the folder | [ ] | |
| A5 | NIfTI `.nii` and `.nii.gz` | Research volumes, MSD, segmentation outputs | ✅ | Orientation labels sensible (RAS→LPS handled); slice count | [ ] | |
| A6 | NRRD `.nrrd` / `.nhdr` | Slicer exports | ✅ | Same as A5 | [ ] | |
| A7 | MetaImage `.mha`, and `.mhd` + `.raw` (drop both files) | ITK / Elastix outputs | ✅ | Same as A5 | [ ] | |
| A8 | TIFF stack | Microscopy / converted volumes | ✅ | Loads; spacing is 1 mm unless the TIFF carries resolution | [ ] | |
| A9 | PNG / JPEG | Screenshots, exported X-rays | ⚫ | Not in the new viewer yet — expect a "nothing displayable" message | [ ] | |

## B. Modalities and encodings (DICOM)

| # | What to load | What to look for | Auto | What to check on screen | Done | Result |
|---|---|---|---|---|---|---|
| B1 | **CT** series, uncompressed | Any scanner export | ✅ | HU correct: air ≈ −1000 with `viewer.sampleValue` / probe; presets Lung/Bone/Brain; MPR + 3D | [ ] | |
| B2 | CT/MR with **compressed** pixel data | PACS exports are often JPEG 2000 / JPEG-LS / RLE; check Transfer Syntax in the file | ✅ | Decodes; no "Cannot decode" banner; looks identical to an uncompressed copy if you have one | [ ] | |
| B3 | **MR** classic single-frame (T1/T2/FLAIR) | Any brain/spine/knee MR | ✅ | Presets are relative (Full / Tight); sagittal/coronal acquisitions label S/I/A/P correctly | [ ] | |
| B4 | **Enhanced MR/CT** (one multi-frame file per series) | Philips/Siemens enhanced exports, `NumberOfFrames` > 1 | ✅ | Frame count = slices; scroll works; MPR works | [ ] | |
| B5 | MR **multi-sequence** study | T1 + T2 + FLAIR (+ DWI) in one study | ⚫ hanging | Each opens in its own slot via 2×2; no automatic hanging yet | [ ] | |
| B6 | **PET** with full header | Clinical FDG PET: PatientWeight, dose, injection time present | ✅ | Overlay says `SUV (bw)`; SUV presets 0–10 available; liver ≈ SUV 2–3 with `viewer.sampleValue` in MPR | [ ] | |
| B7 | **PET** without weight/dose | Research/phantom PET, anonymised exports | ✅ | Overlay says `raw counts — no SUV scaling`; SUV presets refused with a reason; relative presets work | [ ] | |
| B8 | **PET/CT** pair (same FrameOfReference) | Any PET/CT study | ✅ | Open CT → MPR → click **fuse** on the PT row: hot spots red, background clear; unfuse | [ ] | |
| B9 | **CR / DX** chest | Any chest X-ray in DICOM | ✅ | Looks right without touching W/L; presets Lung/Bone | [ ] | |
| B10 | **MONOCHROME1** image | Common in mammography and some CR; `PhotometricInterpretation = MONOCHROME1` | ✅ | Displayed correctly (bone bright, air dark) — not inverted | [ ] | |
| B11 | CR/DX with **JPEG-compressed** pixels | Many portable/ED exports | ✅ | Decodes cleanly | [ ] | |
| B12 | **Mammography** 4-view exam | CC/MLO L/R | ⚫ hanging | Each view opens; no automatic 4-view hanging yet | [ ] | |
| B13 | **Ultrasound** (RGB, possibly cine) | Echo, abdominal US, Doppler | ✅ | True colour; cine plays for multi-frame | [ ] | |
| B14 | **XA / RF** cine | Angio runs, fluoroscopy | ✅ | Frame count; Space plays; frames differ | [ ] | |
| B15 | **Secondary capture** / screenshots in DICOM (RGB) | Dose reports, 3D renders saved as SC | ✅ | Colour correct | [ ] | |
| B16 | **NM** planar / SPECT | Bone scan, MUGA, SPECT | 🟡 | Loads? Multi-frame planar handled? Record what happens | [ ] | |
| B17 | **4D cardiac cine MR** | Short-axis cine (one series, many phases per slice) | 🟡 | Loads as a stack; phases and slices are interleaved — note whether scrolling feels wrong (4D grouping not built) | [ ] | |
| B18 | **DCE / perfusion** 4D | Breast DCE, CT perfusion | ⚫ | Loads as one long stack; no time grouping | [ ] | |
| B19 | **Oblique** acquisition | Angled MR (cardiac, spine), tilted-gantry CT | ✅ | Slices sort correctly; labels; MPR | [ ] | |
| B20 | **Anisotropic** / thick-slice series | 5 mm CT, 0.3 mm in-plane MR | ✅ | Spacing text and `T` thickness right; scale bar right; MPR not squashed | [ ] | |
| B21 | Series with **missing slices** or irregular spacing | Partial exports | ✅ (design) | Listed with a warning; shows as a stack; MPR disabled with the reason | [ ] | |
| B22 | **DICOM-SEG** + its source series | AI/segmentation outputs, TotalSegmentator SEG | ✅ | Listed as SEG; click → overlay aligns with anatomy on stack and MPR; hide works | [ ] | |
| B23 | **RTSTRUCT** + its CT | Radiotherapy planning export | ✅ | Listed; click → contours on the right slices, right colours; MPR shows them only in the acquisition plane (by design for now) | [ ] | |
| B24 | **RTDOSE**, **RTPLAN** | Same RT export | ✅ listed | Listed as objects, not displayed (P2) | [ ] | |
| B25 | **SR** (structured report), **encapsulated PDF** | Dose SRs, measurement SRs, scanned documents | ✅ listed / ⚫ | SR listed, not rendered; PDF not handled | [ ] | |
| B26 | Big-endian / no-preamble / truncated files | Old GE exports, damaged downloads | ✅ | Big-endian renders; the other two show a clear error, no crash | [ ] | |
| B27 | Non-ASCII patient names, private tags, very long series | Non-English sites, 1000+ slice CTs | 🟡 | Names render; performance acceptable; memory OK | [ ] | |

## C. Viewer capabilities (use any of the above)

| # | Check | Auto | Done | Result |
|---|---|---|---|---|
| C1 | No PACS running → studies page shows an honest offline card; local files still work | ✅ | [ ] | |
| C2 | Keyboard: W/P/Z tools, L/A/B/E/R/C/O measurements, 1–8 presets, I invert, Shift+R reset, ↑↓ PgUp/PgDn Home/End scroll, Space cine, Delete | ✅ (commands) | [ ] | |
| C3 | Mouse: wheel scroll, left = active tool, middle = pan, right = zoom, Ctrl+left pan, Shift+left zoom, Alt+left scroll | 🟡 | [ ] | |
| C4 | Layouts 1×1 / 1×2 / 2×2 / MPR / MPR+3D; any series into any slot; active slot highlight | ✅ | [ ] | |
| C5 | MPR crosshairs (X) in MPR layout | 🟡 | [ ] | |
| C6 | 3D render presets (CT bone default) | ✅ | [ ] | |
| C7 | Length measurement on a known object (ruler / phantom / your own calibration) | ✅ | [ ] | |
| C8 | Other measurement tools draw and delete | 🟡 | [ ] | |
| C9 | Overlays toggle: Info, LRAP, Scale | ✅ | [ ] | |
| C10 | PACS: upload a folder, find it in the studies list, open it, MPR | ✅ | [ ] | |
| C11 | Volume streaming: progress bar on large series; reformats fill in | ✅ | [ ] | |

## Where the automated fixtures came from (if you want the same files)

`python3 scripts/sample-data/fetch.py --list` — pydicom corpus (all codecs, Enhanced MR, US, SC, RT, SR, ECG), Slicer MR head (DICOM + NRRD), Slicer CT chest (NRRD), Orthanc demo `HN_P001` (CT + RTSTRUCT + RTDOSE) and `COMUNIX` (PET/CT, no SUV header), plus the synthetic set in `sample-data/synth/` (CT cube in every format, oblique, anisotropic, MONOCHROME1 DX, JPEG DX, 30-frame XA, RGB, SEG, RTSTRUCT, PET/CT with SUV header).
