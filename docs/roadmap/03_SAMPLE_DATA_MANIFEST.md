# Sample Data Manifest

Date: 2026-08-30 · Companion to the [Tier 1 verification matrix](02_TIER1_VERIFICATION_MATRIX.md).

Every fixture below is **public, de-identified, and redistributable under the stated licence.** Nothing is committed; `scripts/download-sample-data.sh` is to be replaced by a manifest-driven fetcher (`scripts/sample-data/manifest.json` + `fetch.py` with checksums, `--tier`, `--fixture`, `--upload-to-orthanc`). The current script downloads nothing usable (it prints a 27 GB URL and fetches a placeholder MD5).

Priority: **P0** needed for Phase 1 exit · **P1** Phase 1–2 · **P2** Phase 3+ · **corpus** = small edge-case files used by unit tests.

## 1. Core fixtures by matrix row

| ID | Modality / format | Source | Licence | Size | Pri | Exercises |
|---|---|---|---|---|---|---|
| `pydicom-corpus` | DICOM edge cases (see §2) | pydicom test data (`pydicom-data` GitHub repo) | Public test files (mixed, permissive) | ~50 MB | corpus | Transfer syntaxes, photometric, multi-frame, RT, SR, US, waveform, big-endian, truncated |
| `msd-spleen` | CT NIfTI + labels (Task09_Spleen, 41 cases) | Medical Segmentation Decathlon (`msd-for-monai` S3 bucket; `monai.apps.DecathlonDataset`) | CC BY-SA 4.0 | ~1.5 GB | P0 | NIfTI load, gzip, RAS→LPS, TotalSegmentator/BiomedParse targets, volumetrics |
| `msd-brain` | 4-channel MR NIfTI (Task01_BrainTumour, subset) | MSD | CC BY-SA 4.0 | pick 5 cases | P1 | 4D NIfTI, multi-sequence, neuro suite |
| `totalseg-ct` | CT NIfTI + 117 labels (subset) | TotalSegmentator dataset v2 (Zenodo) | CC BY 4.0 | pick 10 cases | P0 | Auto-seg ground truth, DICOM-SEG round-trip, analytics |
| `slicer-mrhead` | MR NRRD | 3D Slicer SampleData (`SlicerTestingData` GitHub releases) | Public / BSD | 5 MB | P0 | NRRD loader, MR presets |
| `slicer-ctchest` | CT NRRD | 3D Slicer SampleData | Public / BSD | 30 MB | P0 | NRRD loader, CT presets, MPR |
| `slicer-ctchest-dcm` | CT DICOM series | 3D Slicer SampleData (DICOM samples) | Public / BSD | 30 MB | P0 | Local DICOM folder, Orthanc upload, PACS load |
| `slicer-dti` | DTI NRRD | 3D Slicer SampleData (`DTIBrain`) | Public / BSD | 20 MB | P2 | Multi-component NRRD |
| `itk-mha` | MHA/MHD+RAW | ITK test data or converted from `slicer-mrhead` | Apache-2.0 / derived | 5 MB | P1 | MHA loader, `.mhd`+`.raw` pair |
| `tiff-stack` | 3D TIFF | Converted from `msd-spleen` (ITK) | derived | 20 MB | P2 | TIFF loader |
| `lidc-ct-dicom` | Chest CT DICOM (2–3 studies) | TCIA LIDC-IDRI (via `idc-index`) | CC BY 3.0 | ~300 MB | P0 | Multi-series study, series picker, PACS QIDO/WADO-RS, oblique/gantry-tilt edge cases |
| `qin-prostate-mr` | Multi-parametric MR DICOM + DICOM-SEG | IDC QIN-PROSTATE-Repeatability | CC BY 3.0 | ~200 MB | P0 | MR, multi-sequence, **DICOM-SEG display** |
| `nsclc-radiomics-rtstruct` | CT + RTSTRUCT + SEG (2 cases) | TCIA/IDC NSCLC-Radiomics (Lung1) | CC BY-NC 3.0 | ~200 MB | P0 | **RTSTRUCT display**, SEG, RT suite, radiomics |
| `head-neck-petct-rt` | PET/CT + RTSTRUCT | TCIA Head-Neck-PET-CT | CC BY 3.0 | ~400 MB | P1 | PET/CT fusion + RT contours |
| `autopet-fdg` | Whole-body FDG PET/CT DICOM (2 cases) | TCIA FDG-PET-CT-Lesions (AutoPET) | CC BY 4.0 | ~600 MB | P0 | **Real SUV** (weight, dose, decay), fusion, oncology suite |
| `lung-pet-ct-dx` | PET/CT DICOM | TCIA Lung-PET-CT-Dx | CC BY 4.0 | pick 1 | P1 | Second PET vendor/header variant |
| `rsna-pneumonia-dx` | Chest DX DICOM (20 files) | RSNA Pneumonia Detection Challenge (Kaggle) | Non-commercial research | 50 MB | P0 | CR/DX load, chest X-ray suite, MedGemma |
| `vindr-cxr` | Chest DX DICOM with **JPEG-compressed** pixel data + bounding-box labels | PhysioNet VinDr-CXR (credentialed) | PhysioNet Credentialed Health Data Licence | pick 20 | P0 | Compressed CR/DX; honest detector ground truth |
| `nih-cxr14-png` | Chest X-ray PNG | NIH ChestX-ray14 | Public | pick 10 | P1 | PNG path, 2D annotation |
| `cbis-ddsm` | Mammography DICOM (MONOCHROME1, 4-view) | TCIA CBIS-DDSM | CC BY 3.0 | pick 2 exams | P1 | **MONOCHROME1**, MG hanging (CC/MLO L/R), J2K |
| `prostate-mri-us` | MR + **US** DICOM | TCIA Prostate-MRI-US-Biopsy | CC BY 4.0 | pick 1 | P1 | Ultrasound RGB/multi-frame |
| `ohif-demo-xa` | XA/RF cine, US cine, multi-frame | OHIF public DICOMweb demo server (the one behind viewer.ohif.org) | Demo use | streamed | P1 | **Cine**, multi-frame, WADO-RS against a foreign server |
| `orthanc-demo` | Mixed studies | Orthanc public demo server | Demo use | streamed | P1 | Second DICOMweb implementation |
| `sunnybrook-cine` | Cardiac cine MR DICOM | Sunnybrook Cardiac Data | Public (CC0-style) | pick 2 | P1 | **4D cine**, cardiac suite |
| `acdc-nifti` | Cardiac cine 4D NIfTI + labels | ACDC challenge | CC BY-NC-SA 4.0 | pick 5 | P2 | 4D NIfTI, EF ground truth |
| `ixi-t1` / `ixi-t2` / `ixi-pd` | Brain MR NIfTI, same subjects | IXI dataset | CC BY-SA 3.0 | pick 5 subjects | P1 | Multi-sequence hanging, neuro suite, registration |
| `isles-2022` | DWI/ADC/FLAIR NIfTI + lesion masks | ISLES 2022 (Zenodo) | CC BY 4.0 | pick 5 | P2 | Stroke workflow, DWI presets |
| `verse-spine` | Spine CT NIfTI + vertebra labels | VerSe 2020 (OSF) | CC BY 4.0 | pick 3 | P2 | Vertebra pipeline, surgical suite |
| `kits23` | Kidney CT NIfTI + labels | KiTS23 | CC BY-NC-SA 4.0 | pick 3 | P2 | Oncology volumetrics |
| `qin-breast-dce` | DCE-MRI 4D DICOM | TCIA QIN-Breast | CC BY 3.0 | pick 1 | P2 | 4D DCE, breast agent |
| `idc-nm` | NM planar/SPECT DICOM | IDC portal, filter `Modality = NM` | per collection | pick 1 | P2 | NM row |
| `idc-sr` | DICOM SR (TID 1500 measurements) | IDC (e.g. collections with dcmqi SR) | per collection | pick 2 | P2 | SR row |

**Fetch tooling:** TCIA/IDC fixtures are best pulled with `idc-index` (`pip install idc-index`; `idc download --collection ... --patient ...`), which gives free GCS egress and deterministic selection by SOP/series UID for the manifest. Kaggle fixtures need `kaggle` CLI + accepted terms; PhysioNet needs credentialing — the fetcher should print instructions and skip, never embed credentials.

## 2. `pydicom-corpus` — edge-case files to include

From the pydicom test-data repository (verify names against its current index):

| File | Exercises |
|---|---|
| `CT_small.dcm`, `MR_small.dcm` | Baseline uncompressed CT/MR |
| `MR_small_RLE.dcm`, `MR_small_jp2klossless.dcm`, `MR_small_jpeg_ls_lossless.dcm` | RLE, J2K lossless, JPEG-LS |
| `JPEG2000.dcm`, `JPEG-LL.dcm`, `JPEG-lossy.dcm`, `693_J2KI.dcm`, `693_UNCI.dcm` | J2K, JPEG lossless, JPEG baseline; compressed vs uncompressed pair |
| `emri_small.dcm`, `emri_small_RLE.dcm`, `emri_small_big_endian.dcm`, `emri_small_jpeg_2k_lossless.dcm` | **Enhanced MR multi-frame** in four encodings |
| `US1_UNCR.dcm`, `US1_J2KR.dcm`, `US1_J2KI.dcm` | Ultrasound RGB, uncompressed vs J2K |
| `SC_rgb.dcm`, `SC_rgb_small_odd.dcm`, `color-pl.dcm`, `color-px.dcm`, `color3d_jpeg_baseline.dcm` | RGB planar/pixel interleave, YBR, colour multi-frame |
| `rtstruct.dcm`, `rtdose.dcm`, `rtplan.dcm` | RT objects |
| `test-SR.dcm` | Structured report |
| `waveform_ecg.dcm` | Waveform (should be rejected gracefully) |
| `ExplVR_BigEnd.dcm`, `ExplVR_LitEndNoMeta.dcm`, `no_meta.dcm`, `MR_truncated.dcm` | Big-endian, missing meta, truncated — error-path tests |

## 3. Synthetic fixtures (generated in-repo, deterministic)

Generated by a script (`scripts/sample-data/synth.py`) so geometry is known exactly:

| ID | What | Asserts |
|---|---|---|
| `synth-ct-cube` | 64×64×32 CT NIfTI with a bright cuboid (the Vertex smoke test already builds this) | Volumetrics = known mm³; measurement length = known mm; slice count |
| `synth-anisotropic` | Same with 0.5×0.5×3.0 mm spacing | Spacing honoured in MPR and scale bar |
| `synth-oblique` | Same with a 20° rotated direction matrix | Orientation labels; oblique reslice |
| `synth-mono1` | DX with MONOCHROME1 | Inversion applied |
| `synth-multiframe` | 30-frame XA cine | Frame count; cine playback |
| `synth-seg` | DICOM-SEG referencing `synth-ct-cube` (via `highdicom`) | SEG overlay aligns with cuboid |
| `synth-rtstruct` | RTSTRUCT contour of the cuboid | Contour → labelmap round-trip |

## 4. Coverage map (matrix row → fixture)

| Matrix row | Primary fixture | Secondary |
|---|---|---|
| NIfTI | `msd-spleen` | `totalseg-ct`, `ixi-*` |
| NRRD | `slicer-mrhead` | `slicer-ctchest` |
| MHA | `itk-mha` | — |
| PNG/JPEG | `nih-cxr14-png` | existing `cysts1.jpeg` |
| DICOM local file / folder | `slicer-ctchest-dcm` | `pydicom-corpus` |
| CT uncompressed | `lidc-ct-dicom` | `slicer-ctchest-dcm` |
| CT compressed | `pydicom-corpus` | `vindr-cxr` (DX) |
| MR | `qin-prostate-mr` | `ixi-*` |
| Enhanced MR | `pydicom-corpus` (`emri_*`) | — |
| PET / SUV / fusion | `autopet-fdg` | `lung-pet-ct-dx`, `head-neck-petct-rt` |
| CR/DX | `rsna-pneumonia-dx` | `vindr-cxr` |
| MG | `cbis-ddsm` | `synth-mono1` |
| US | `pydicom-corpus` (`US1_*`) | `prostate-mri-us` |
| XA/RF cine | `ohif-demo-xa` | `synth-multiframe` |
| 4D cardiac | `sunnybrook-cine` | `acdc-nifti` |
| DICOM-SEG | `qin-prostate-mr` | `nsclc-radiomics-rtstruct`, `synth-seg` |
| RTSTRUCT | `nsclc-radiomics-rtstruct` | `head-neck-petct-rt`, `synth-rtstruct` |
| RTDOSE / RTPLAN / SR | `pydicom-corpus` | `idc-sr` |
| NM | `idc-nm` | — |
| Error paths | `pydicom-corpus` (truncated/no-meta) | — |

## 5. Rules

- No PHI, ever. All sources above are de-identified; the fetcher refuses files whose `PatientName`/`PatientID` look non-synthetic unless `--allow-unverified` is passed.
- `sample-data/` stays gitignored; `manifest.json` records URL, SHA-256, licence, citation for every file.
- Each P0 fixture gets a Playwright spec named after its ID; the matrix generator keys on that ID.
- Licence attribution is written to `sample-data/SOURCES.md` on fetch (keep the current script's behaviour).
