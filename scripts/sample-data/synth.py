#!/usr/bin/env python3
"""
Deterministic synthetic fixtures for MedAI-OS (manifest doc section 3).

    python3 scripts/sample-data/synth.py            # writes sample-data/synth/<id>/
    python3 scripts/sample-data/synth.py --only synth-mono1 --only synth-rgb

Everything is seeded and dated with constants, so re-running yields
byte-identical files (see sample-data/synth/checksums.json). Every output is
re-opened with pydicom / nibabel / SimpleITK and its geometry asserted against
the values written to each fixture's expected.json.

Requires: numpy, pydicom>=3, nibabel, SimpleITK. highdicom and Pillow are
optional (synth-seg / synth-dx-jpeg are skipped with a message if missing).
The JPEG bytes of synth-dx-jpeg are stable for a given Pillow/libjpeg build.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import nibabel as nib
import pydicom
import SimpleITK as sitk
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.sequence import Sequence
from pydicom.uid import (
    CTImageStorage,
    DigitalXRayImageStorageForPresentation,
    ExplicitVRLittleEndian,
    JPEGBaseline8Bit,
    PositronEmissionTomographyImageStorage,
    RTStructureSetStorage,
    SecondaryCaptureImageStorage,
    XRayAngiographicImageStorage,
    generate_uid,
)

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
DEFAULT_OUT = REPO_ROOT / "sample-data" / "synth"

SEED = 20260830
DATE = "20260101"
TIME = "120000.000000"
PATIENT_NAME = "SYNTH^PHANTOM"
PATIENT_ID = "SYNTH-001"
MANUFACTURER = "MedAI-OS synth.py"

# CT phantom geometry (voxel indices, half-open ranges) ----------------------
NX, NY, NZ = 64, 64, 32
CUB_X = (16, 36)   # 20 voxels
CUB_Y = (20, 50)   # 30 voxels
CUB_Z = (8, 24)    # 16 slices
BODY_RADII = (28.0, 26.0)  # voxel-unit ellipse radii (x, y)
HU_AIR, HU_BODY, HU_CUBOID = -1000, 0, 300
CUBOID_THRESHOLD_HU = 150
RESCALE_INTERCEPT = -1024
WINDOW_CENTER, WINDOW_WIDTH = 40, 400


def uid(*parts: str) -> str:
    """Deterministic UID from a list of strings."""
    return generate_uid(entropy_srcs=["medai-os-synth"] + [str(p) for p in parts])


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def base_dataset(fixture: str, sop_class: str, sop_uid: str, modality: str, series_number: int,
                 series_desc: str, patient: tuple[str, str] = (PATIENT_NAME, PATIENT_ID)) -> Dataset:
    ds = Dataset()
    ds.file_meta = FileMetaDataset()
    ds.file_meta.MediaStorageSOPClassUID = sop_class
    ds.file_meta.MediaStorageSOPInstanceUID = sop_uid
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.SOPClassUID = sop_class
    ds.SOPInstanceUID = sop_uid
    ds.SpecificCharacterSet = "ISO_IR 100"
    ds.PatientName, ds.PatientID = patient
    ds.PatientBirthDate = ""
    ds.PatientSex = "O"
    ds.StudyInstanceUID = uid(fixture, "study")
    ds.SeriesInstanceUID = uid(fixture, "series", series_number)
    ds.StudyID = "SYNTH"
    ds.AccessionNumber = ""
    ds.ReferringPhysicianName = ""
    ds.StudyDescription = f"MedAI-OS synthetic {fixture}"
    ds.SeriesDescription = series_desc
    ds.SeriesNumber = series_number
    ds.Modality = modality
    ds.Manufacturer = MANUFACTURER
    ds.ManufacturerModelName = "synth.py"
    ds.SoftwareVersions = "1.0"
    ds.StudyDate = DATE
    ds.SeriesDate = DATE
    ds.ContentDate = DATE
    ds.StudyTime = TIME
    ds.SeriesTime = TIME
    ds.ContentTime = TIME
    return ds


def save(ds: Dataset, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ds.save_as(path, enforce_file_format=True)


# ----------------------------------------------------------------------------
# CT phantom
# ----------------------------------------------------------------------------
def make_phantom(rng: np.random.Generator) -> np.ndarray:
    """HU volume indexed [z, y, x]."""
    y, x = np.mgrid[0:NY, 0:NX]
    body = ((x - (NX - 1) / 2) / BODY_RADII[0]) ** 2 + ((y - (NY - 1) / 2) / BODY_RADII[1]) ** 2 <= 1.0
    hu = np.full((NZ, NY, NX), HU_AIR, dtype=np.int16)
    hu[:, body] = HU_BODY
    hu[CUB_Z[0]:CUB_Z[1], CUB_Y[0]:CUB_Y[1], CUB_X[0]:CUB_X[1]] = HU_CUBOID
    noise = rng.normal(0.0, 3.0, hu.shape).round().astype(np.int16)
    return np.clip(hu.astype(np.int32) + noise, -1024, 3071).astype(np.int16)


def cuboid_mask() -> np.ndarray:
    m = np.zeros((NZ, NY, NX), dtype=bool)
    m[CUB_Z[0]:CUB_Z[1], CUB_Y[0]:CUB_Y[1], CUB_X[0]:CUB_X[1]] = True
    return m


class CTGeometry:
    """DICOM (LPS) geometry: row/col direction cosines, spacing, first-slice origin."""

    def __init__(self, spacing: tuple[float, float, float], rot_z_deg: float = 0.0,
                 shape: tuple[int, int, int] = (NX, NY, NZ)):
        self.spacing = spacing  # (x, y, z) mm
        self.shape = shape      # (nx, ny, nz) voxels
        nx, ny, nz = shape
        th = math.radians(rot_z_deg)
        self.row_dir = np.array([math.cos(th), math.sin(th), 0.0])   # direction of increasing column index (x)
        self.col_dir = np.array([-math.sin(th), math.cos(th), 0.0])  # direction of increasing row index (y)
        self.normal = np.cross(self.row_dir, self.col_dir)
        sx, sy, sz = spacing
        # centre the volume on the origin
        centre_offset = (self.row_dir * (nx - 1) / 2 * sx + self.col_dir * (ny - 1) / 2 * sy
                         + self.normal * (nz - 1) / 2 * sz)
        self.origin = -centre_offset
        self.rot_z_deg = rot_z_deg

    def ipp(self, k: int) -> np.ndarray:
        return self.origin + self.normal * k * self.spacing[2]

    def iop(self) -> list[float]:
        return [float(v) for v in np.concatenate([self.row_dir, self.col_dir])]

    def affine_lps(self) -> np.ndarray:
        sx, sy, sz = self.spacing
        m = np.eye(4)
        m[:3, 0] = self.row_dir * sx
        m[:3, 1] = self.col_dir * sy
        m[:3, 2] = self.normal * sz
        m[:3, 3] = self.origin
        return m

    def affine_ras(self) -> np.ndarray:
        flip = np.diag([-1.0, -1.0, 1.0, 1.0])
        return flip @ self.affine_lps()

    def voxel_to_lps(self, i: float, j: float, k: float) -> np.ndarray:
        return (self.affine_lps() @ np.array([i, j, k, 1.0]))[:3]


def write_ct_series(fixture: str, out_dir: Path, hu: np.ndarray, geo: CTGeometry,
                    patient: tuple[str, str] = (PATIENT_NAME, PATIENT_ID)) -> list[Dataset]:
    stored = (hu.astype(np.int32) - RESCALE_INTERCEPT).astype("<u2")
    frame_uid = uid(fixture, "frame-of-reference")
    nz, ny, nx = hu.shape
    datasets = []
    for k in range(nz):
        sop = uid(fixture, "ct", k)
        ds = base_dataset(fixture, CTImageStorage, sop, "CT", 1, f"{fixture} CT", patient=patient)
        ds.FrameOfReferenceUID = frame_uid
        ds.PositionReferenceIndicator = ""
        ds.ImageType = ["ORIGINAL", "PRIMARY", "AXIAL"]
        ds.PatientPosition = "HFS"
        ds.KVP = 120
        ds.AcquisitionNumber = 1
        ds.InstanceNumber = k + 1
        ds.ImagePositionPatient = [float(round(v, 6)) for v in geo.ipp(k)]
        ds.ImageOrientationPatient = [round(v, 8) for v in geo.iop()]
        ds.PixelSpacing = [geo.spacing[1], geo.spacing[0]]  # row spacing (y), column spacing (x)
        ds.SliceThickness = geo.spacing[2]
        ds.SpacingBetweenSlices = geo.spacing[2]
        ds.SliceLocation = float(round(float(np.dot(geo.ipp(k), geo.normal)), 6))
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.Rows, ds.Columns = ny, nx
        ds.BitsAllocated, ds.BitsStored, ds.HighBit = 16, 16, 15
        ds.PixelRepresentation = 0
        ds.RescaleIntercept = RESCALE_INTERCEPT
        ds.RescaleSlope = 1
        ds.RescaleType = "HU"
        ds.WindowCenter = WINDOW_CENTER
        ds.WindowWidth = WINDOW_WIDTH
        ds.PixelData = stored[k].tobytes()
        save(ds, out_dir / f"ct_{k + 1:03d}.dcm")
        datasets.append(ds)
    return datasets


def write_nifti(path: Path, hu: np.ndarray, geo: CTGeometry) -> None:
    data = np.ascontiguousarray(hu.transpose(2, 1, 0))  # [x, y, z]
    img = nib.Nifti1Image(data.astype(np.int16), geo.affine_ras())
    img.header.set_xyzt_units("mm")
    img.header.set_qform(geo.affine_ras(), code=1)
    img.header.set_sform(geo.affine_ras(), code=1)
    img.header["descrip"] = b"MedAI-OS synthetic CT phantom"
    nib.save(img, str(path))


def ct_expected(fixture: str, geo: CTGeometry) -> dict:
    sx, sy, sz = geo.spacing
    nx, ny, nz = CUB_X[1] - CUB_X[0], CUB_Y[1] - CUB_Y[0], CUB_Z[1] - CUB_Z[0]
    lo = geo.voxel_to_lps(CUB_X[0] - 0.5, CUB_Y[0] - 0.5, CUB_Z[0] - 0.5)
    hi = geo.voxel_to_lps(CUB_X[1] - 0.5, CUB_Y[1] - 0.5, CUB_Z[1] - 0.5)
    return {
        "fixture": fixture,
        "volume_shape_xyz": [NX, NY, NZ],
        "slice_count": NZ,
        "spacing_mm_xyz": [sx, sy, sz],
        "image_orientation_patient": geo.iop(),
        "rotation_about_z_deg": geo.rot_z_deg,
        "first_slice_image_position_patient": [float(v) for v in geo.ipp(0)],
        "rescale_intercept": RESCALE_INTERCEPT,
        "rescale_slope": 1,
        "window_center": WINDOW_CENTER,
        "window_width": WINDOW_WIDTH,
        "hu": {"air": HU_AIR, "body": HU_BODY, "cuboid": HU_CUBOID, "noise_sigma": 3, "cuboid_threshold": CUBOID_THRESHOLD_HU},
        "cuboid": {
            "voxel_index_ranges_half_open_xyz": [list(CUB_X), list(CUB_Y), list(CUB_Z)],
            "voxel_counts_xyz": [nx, ny, nz],
            "voxel_count": nx * ny * nz,
            "edge_lengths_mm_xyz": [nx * sx, ny * sy, nz * sz],
            "volume_mm3": nx * ny * nz * sx * sy * sz,
            "bounding_box_lps_mm_min_corner": [float(v) for v in lo],
            "bounding_box_lps_mm_max_corner": [float(v) for v in hi],
            "diagonal_length_mm": math.sqrt((nx * sx) ** 2 + (ny * sy) ** 2 + (nz * sz) ** 2),
            "slices_containing_cuboid_instance_numbers": [CUB_Z[0] + 1, CUB_Z[1]],
        },
        "patient": {"name": PATIENT_NAME, "id": PATIENT_ID},
    }


def verify_ct(fixture: str, out_dir: Path, exp: dict, geo: CTGeometry, hu: np.ndarray) -> None:
    sx, sy, sz = geo.spacing
    # pydicom
    files = sorted(out_dir.glob("dicom/ct_*.dcm"))
    assert len(files) == NZ, f"{fixture}: expected {NZ} slices, found {len(files)}"
    d0 = pydicom.dcmread(files[0])
    assert float(d0.RescaleIntercept) == RESCALE_INTERCEPT and float(d0.RescaleSlope) == 1
    assert [float(v) for v in d0.PixelSpacing] == [sy, sx]
    assert float(d0.SliceThickness) == sz
    assert np.allclose([float(v) for v in d0.ImageOrientationPatient], geo.iop(), atol=1e-6)
    d1 = pydicom.dcmread(files[1])
    step = np.array(d1.ImagePositionPatient, float) - np.array(d0.ImagePositionPatient, float)
    assert np.isclose(np.linalg.norm(step), sz), f"{fixture}: slice step {np.linalg.norm(step)} != {sz}"
    vol = np.stack([pydicom.dcmread(f).pixel_array.astype(np.int32) + RESCALE_INTERCEPT for f in files])
    assert np.array_equal(vol, hu), f"{fixture}: DICOM round trip changed HU"
    n_cub = int((vol > CUBOID_THRESHOLD_HU).sum())
    assert n_cub == exp["cuboid"]["voxel_count"], f"{fixture}: cuboid voxels {n_cub}"
    assert np.isclose(n_cub * sx * sy * sz, exp["cuboid"]["volume_mm3"])
    # SimpleITK series
    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(out_dir / "dicom")))
    img = reader.Execute()
    assert img.GetSize() == (NX, NY, NZ), img.GetSize()
    assert np.allclose(img.GetSpacing(), (sx, sy, sz), atol=1e-6), img.GetSpacing()
    dirm = np.array(img.GetDirection()).reshape(3, 3)
    assert np.allclose(dirm[:, 0], geo.row_dir, atol=1e-6) and np.allclose(dirm[:, 1], geo.col_dir, atol=1e-6)
    arr = sitk.GetArrayFromImage(img)
    assert np.array_equal(arr, hu), f"{fixture}: SimpleITK series read differs"
    # nibabel
    nii = nib.load(str(out_dir / f"{fixture}.nii.gz"))
    assert nii.shape == (NX, NY, NZ), nii.shape
    assert np.allclose(nii.header.get_zooms(), (sx, sy, sz), atol=1e-6), nii.header.get_zooms()
    ndata = np.asanyarray(nii.dataobj)
    assert np.array_equal(ndata.transpose(2, 1, 0), hu), f"{fixture}: NIfTI data differs"
    # NIfTI RAS of voxel (0,0,0) must equal DICOM IPP of slice 1 with x,y negated
    ras0 = nii.affine @ np.array([0, 0, 0, 1.0])
    assert np.allclose(ras0[:3], np.array(d0.ImagePositionPatient, float) * [-1, -1, 1], atol=1e-4), ras0
    n_cub_nii = int((ndata > CUBOID_THRESHOLD_HU).sum())
    assert n_cub_nii * float(np.prod(nii.header.get_zooms())) == exp["cuboid"]["volume_mm3"] or \
        np.isclose(n_cub_nii * float(np.prod(nii.header.get_zooms())), exp["cuboid"]["volume_mm3"])


def write_itk_copies(fixture: str, out_dir: Path, hu: np.ndarray, geo: CTGeometry) -> dict:
    reader = sitk.ImageSeriesReader()
    reader.SetFileNames(sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(out_dir / "dicom")))
    img = reader.Execute()
    written = {}
    for ext in (".nrrd", ".mha", ".mhd"):
        p = out_dir / f"{fixture}{ext}"
        sitk.WriteImage(img, str(p), useCompression=False)
        back = sitk.ReadImage(str(p))
        assert back.GetSize() == img.GetSize() and np.allclose(back.GetSpacing(), img.GetSpacing(), atol=1e-6)
        assert np.allclose(back.GetOrigin(), img.GetOrigin(), atol=1e-4), (ext, back.GetOrigin(), img.GetOrigin())
        assert np.allclose(back.GetDirection(), img.GetDirection(), atol=1e-6)
        assert np.array_equal(sitk.GetArrayFromImage(back), hu), f"{ext} pixel data differs"
        written[ext] = p.name
    assert (out_dir / f"{fixture}.raw").exists(), "MHD writer did not produce a .raw sidecar"
    written[".raw"] = f"{fixture}.raw"
    # 3D TIFF: stored values (uint16 = HU + 1024); TIFF keeps only in-plane resolution
    tif = out_dir / f"{fixture}.tif"
    stored = sitk.Cast(img - RESCALE_INTERCEPT, sitk.sitkUInt16)
    sitk.WriteImage(stored, str(tif))
    back = sitk.ReadImage(str(tif))
    assert back.GetSize() == img.GetSize()
    assert np.array_equal(sitk.GetArrayFromImage(back).astype(np.int32) + RESCALE_INTERCEPT, hu), "TIFF pixel data differs"
    written[".tif"] = tif.name
    return written


def gen_ct_fixture(fixture: str, out_root: Path, spacing: tuple[float, float, float], rot_z: float, hu: np.ndarray,
                   itk_copies: bool) -> tuple[Path, list[Dataset], CTGeometry]:
    out_dir = out_root / fixture
    geo = CTGeometry(spacing, rot_z)
    datasets = write_ct_series(fixture, out_dir / "dicom", hu, geo)
    write_nifti(out_dir / f"{fixture}.nii.gz", hu, geo)
    exp = ct_expected(fixture, geo)
    exp["files"] = {"dicom_dir": "dicom/", "nifti": f"{fixture}.nii.gz"}
    if itk_copies:
        exp["files"].update(write_itk_copies(fixture, out_dir, hu, geo))
        exp["tiff_note"] = "TIFF holds stored values (HU + 1024) as uint16; only in-plane resolution survives the TIFF round trip"
    (out_dir / "expected.json").write_text(json.dumps(exp, indent=2) + "\n")
    verify_ct(fixture, out_dir, exp, geo, hu)
    print(f"  {fixture}: {NZ} CT slices + NIfTI{' + NRRD/MHA/MHD+RAW/TIFF' if itk_copies else ''}; "
          f"cuboid {exp['cuboid']['edge_lengths_mm_xyz']} mm = {exp['cuboid']['volume_mm3']} mm3")
    return out_dir, datasets, geo


# ----------------------------------------------------------------------------
# DX MONOCHROME1
# ----------------------------------------------------------------------------
def gen_mono1(out_root: Path, rng: np.random.Generator) -> None:
    fixture = "synth-mono1"
    out_dir = out_root / fixture
    rows = cols = 512
    bg, sq = 200, 3500
    r0, r1, c0, c1 = 160, 352, 160, 352
    px = np.full((rows, cols), bg, dtype=np.int32)
    px[r0:r1, c0:c1] = sq
    px += rng.integers(-20, 21, px.shape)
    px = np.clip(px, 0, 4095).astype("<u2")
    sop = uid(fixture, "dx")
    ds = base_dataset(fixture, DigitalXRayImageStorageForPresentation, sop, "DX", 1, "synth MONOCHROME1 DX")
    ds.ImageType = ["ORIGINAL", "PRIMARY"]
    ds.PresentationIntentType = "FOR PRESENTATION"
    ds.InstanceNumber = 1
    ds.PatientOrientation = ["L", "F"]
    ds.ViewPosition = "PA"
    ds.BodyPartExamined = "CHEST"
    ds.ImagerPixelSpacing = [0.2, 0.2]
    ds.PixelSpacing = [0.2, 0.2]
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME1"
    ds.Rows, ds.Columns = rows, cols
    ds.BitsAllocated, ds.BitsStored, ds.HighBit = 16, 12, 11
    ds.PixelRepresentation = 0
    ds.PixelIntensityRelationship = "LOG"
    ds.PixelIntensityRelationshipSign = 1
    ds.RescaleIntercept = 0
    ds.RescaleSlope = 1
    ds.RescaleType = "US"
    ds.WindowCenter = 1850
    ds.WindowWidth = 3700
    ds.BurnedInAnnotation = "NO"
    ds.LossyImageCompression = "00"
    ds.PixelData = px.tobytes()
    save(ds, out_dir / f"{fixture}.dcm")
    exp = {
        "fixture": fixture, "photometric_interpretation": "MONOCHROME1", "rows": rows, "columns": cols,
        "bits_stored": 12, "background_value": bg, "square_value": sq,
        "square_rows_half_open": [r0, r1], "square_cols_half_open": [c0, c1],
        "noise_uniform_range": [-20, 20], "window_center": 1850, "window_width": 3700,
        "expected_rendering": "MONOCHROME1: low values are white, high values are black. The square has the HIGH value and must render DARK on a LIGHT background; if it renders bright the viewer forgot to invert.",
    }
    (out_dir / "expected.json").write_text(json.dumps(exp, indent=2) + "\n")
    back = pydicom.dcmread(out_dir / f"{fixture}.dcm")
    assert back.PhotometricInterpretation == "MONOCHROME1" and back.Rows == rows and back.Columns == cols
    arr = back.pixel_array
    assert arr[256, 256] > 3000 and arr[10, 10] < 400
    print(f"  {fixture}: 512x512 MONOCHROME1 DX, square value {sq} (renders dark) on {bg} (renders light)")


# ----------------------------------------------------------------------------
# XA multi-frame
# ----------------------------------------------------------------------------
def gen_multiframe(out_root: Path, rng: np.random.Generator) -> None:
    fixture = "synth-multiframe"
    out_dir = out_root / fixture
    n, rows, cols, radius = 30, 256, 256, 20
    yy, xx = np.mgrid[0:rows, 0:cols]
    frames = np.zeros((n, rows, cols), dtype=np.uint8)
    centres = []
    for i in range(n):
        ang = 2 * math.pi * i / n
        cx, cy = 128 + 60 * math.cos(ang), 128 + 60 * math.sin(ang)
        centres.append([round(cx, 3), round(cy, 3)])
        f = np.full((rows, cols), 40, dtype=np.int32)
        f[(xx - cx) ** 2 + (yy - cy) ** 2 <= radius ** 2] = 220
        f += rng.integers(-8, 9, f.shape)
        frames[i] = np.clip(f, 0, 255)
    sop = uid(fixture, "xa")
    ds = base_dataset(fixture, XRayAngiographicImageStorage, sop, "XA", 1, "synth XA cine")
    ds.ImageType = ["ORIGINAL", "PRIMARY", "SINGLE PLANE"]
    ds.InstanceNumber = 1
    ds.PatientOrientation = ""
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.Rows, ds.Columns = rows, cols
    ds.BitsAllocated, ds.BitsStored, ds.HighBit = 8, 8, 7
    ds.PixelRepresentation = 0
    ds.NumberOfFrames = n
    ds.FrameIncrementPointer = 0x00181063  # FrameTime
    ds.FrameTime = "33.333333"
    ds.CineRate = 30
    ds.RecommendedDisplayFrameRate = 30
    ds.PositionerPrimaryAngle = 0.0
    ds.PositionerSecondaryAngle = 0.0
    ds.ImagerPixelSpacing = [0.3, 0.3]
    ds.KVP = 80
    ds.PixelData = frames.tobytes()
    save(ds, out_dir / f"{fixture}.dcm")
    exp = {"fixture": fixture, "number_of_frames": n, "rows": rows, "columns": cols, "frame_time_ms": 33.333333,
           "cine_rate_fps": 30, "disc_radius_px": radius, "disc_value": 220, "background_value": 40,
           "disc_centre_xy_per_frame": centres,
           "expected_rendering": "cine of a bright disc moving clockwise around a circle of radius 60 px; every frame differs"}
    (out_dir / "expected.json").write_text(json.dumps(exp, indent=2) + "\n")
    back = pydicom.dcmread(out_dir / f"{fixture}.dcm")
    assert int(back.NumberOfFrames) == n and back.pixel_array.shape == (n, rows, cols)
    assert np.isclose(float(back.FrameTime), 33.333333)
    arr = back.pixel_array
    assert all(not np.array_equal(arr[i], arr[i + 1]) for i in range(n - 1)), "frames must differ"
    print(f"  {fixture}: {n}-frame XA cine {rows}x{cols}")


# ----------------------------------------------------------------------------
# RGB secondary capture
# ----------------------------------------------------------------------------
def gen_rgb(out_root: Path) -> None:
    fixture = "synth-rgb"
    out_dir = out_root / fixture
    rows = cols = 256
    img = np.zeros((rows, cols, 3), dtype=np.uint8)
    quads = {"top_left": ([0, 128], [0, 128], [255, 0, 0]), "top_right": ([0, 128], [128, 256], [0, 255, 0]),
             "bottom_left": ([128, 256], [0, 128], [0, 0, 255]), "bottom_right": ([128, 256], [128, 256], [255, 255, 0])}
    for (r, c, colour) in quads.values():
        img[r[0]:r[1], c[0]:c[1]] = colour
    sop = uid(fixture, "sc")
    ds = base_dataset(fixture, SecondaryCaptureImageStorage, sop, "OT", 1, "synth RGB secondary capture")
    ds.ImageType = ["DERIVED", "SECONDARY"]
    ds.ConversionType = "WSD"
    ds.InstanceNumber = 1
    ds.SamplesPerPixel = 3
    ds.PhotometricInterpretation = "RGB"
    ds.PlanarConfiguration = 0
    ds.Rows, ds.Columns = rows, cols
    ds.BitsAllocated, ds.BitsStored, ds.HighBit = 8, 8, 7
    ds.PixelRepresentation = 0
    ds.PixelData = img.tobytes()
    save(ds, out_dir / f"{fixture}.dcm")
    exp = {"fixture": fixture, "rows": rows, "columns": cols, "photometric_interpretation": "RGB", "planar_configuration": 0,
           "quadrants_rgb": {k: {"rows_half_open": v[0], "cols_half_open": v[1], "rgb": v[2]} for k, v in quads.items()}}
    (out_dir / "expected.json").write_text(json.dumps(exp, indent=2) + "\n")
    back = pydicom.dcmread(out_dir / f"{fixture}.dcm")
    arr = back.pixel_array
    assert arr.shape == (rows, cols, 3) and back.PhotometricInterpretation == "RGB"
    assert list(arr[10, 10]) == [255, 0, 0] and list(arr[10, 200]) == [0, 255, 0]
    assert list(arr[200, 10]) == [0, 0, 255] and list(arr[200, 200]) == [255, 255, 0]
    print(f"  {fixture}: {rows}x{cols} RGB SC, red/green/blue/yellow quadrants")


# ----------------------------------------------------------------------------
# DICOM-SEG (highdicom)
# ----------------------------------------------------------------------------
def gen_seg(out_root: Path, ct_datasets: list[Dataset], ct_dir: Path) -> bool:
    fixture = "synth-seg"
    out_dir = out_root / fixture
    try:
        import highdicom as hd
        from highdicom.seg import SegmentAlgorithmTypeValues, Segmentation, SegmentationTypeValues, SegmentDescription
        from pydicom.sr.codedict import codes
    except ImportError as exc:
        print(f"  {fixture}: SKIPPED (highdicom not importable: {exc}); install with `uv pip install highdicom`")
        return False
    mask = cuboid_mask().astype(np.uint8)  # [z, y, x] == one frame per source CT slice, in InstanceNumber order
    family = None
    for name in ("ArtificialIntelligence", "ManualProcessing", "Thresholding"):
        family = getattr(codes.cid7162, name, None)
        if family is not None:
            break
    alg = hd.AlgorithmIdentificationSequence(name="synth.py", family=family, version="1.0")
    seg_desc = SegmentDescription(
        segment_number=1, segment_label="cuboid",
        segmented_property_category=codes.SCT.MorphologicallyAbnormalStructure,
        segmented_property_type=codes.SCT.Mass,
        algorithm_type=SegmentAlgorithmTypeValues.AUTOMATIC, algorithm_identification=alg,
        tracking_uid=uid(fixture, "tracking"), tracking_id="synth-cuboid",
    )
    seg = Segmentation(
        source_images=ct_datasets, pixel_array=mask, segmentation_type=SegmentationTypeValues.BINARY,
        segment_descriptions=[seg_desc], series_instance_uid=uid(fixture, "series"), series_number=2,
        sop_instance_uid=uid(fixture, "sop"), instance_number=1, manufacturer=MANUFACTURER,
        manufacturer_model_name="synth.py", software_versions="1.0", device_serial_number="0",
        omit_empty_frames=False, series_description="synth cuboid SEG", content_label="CUBOID",
    )
    for attr in ("ContentDate", "SeriesDate", "InstanceCreationDate", "StudyDate"):
        if attr in seg:
            setattr(seg, attr, DATE)
    for attr in ("ContentTime", "SeriesTime", "InstanceCreationTime", "StudyTime"):
        if attr in seg:
            setattr(seg, attr, TIME)
    # highdicom stamps wall-clock times and random UIDs; pin them for byte-determinism
    for item in seg.get("ContributingEquipmentSequence", []):
        if "ContributionDateTime" in item:
            item.ContributionDateTime = f"{DATE}{TIME}"
    dim_uid = uid(fixture, "dimension-organization")
    for item in seg.get("DimensionOrganizationSequence", []):
        item.DimensionOrganizationUID = dim_uid
    for item in seg.get("DimensionIndexSequence", []):
        item.DimensionOrganizationUID = dim_uid
    seg.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    out_dir.mkdir(parents=True, exist_ok=True)
    seg.save_as(out_dir / f"{fixture}.dcm", enforce_file_format=True)
    exp = {"fixture": fixture, "references": "synth-ct-cube", "referenced_series_instance_uid": ct_datasets[0].SeriesInstanceUID,
           "referenced_frame_of_reference_uid": ct_datasets[0].FrameOfReferenceUID,
           "segment_count": 1, "segment_label": "cuboid", "segmentation_type": "BINARY", "number_of_frames": NZ,
           "cuboid_voxel_count": int(mask.sum()), "cuboid_volume_mm3": float(mask.sum()) * 1.0 * 1.0 * 2.0,
           "expected_rendering": "SEG overlay must coincide exactly with the bright cuboid of synth-ct-cube"}
    (out_dir / "expected.json").write_text(json.dumps(exp, indent=2) + "\n")
    # verify via pydicom and highdicom round trip
    back = pydicom.dcmread(out_dir / f"{fixture}.dcm")
    assert back.Modality == "SEG" and int(back.NumberOfFrames) == NZ and len(back.SegmentSequence) == 1
    rs = hd.seg.segread(out_dir / f"{fixture}.dcm")
    sops = [d.SOPInstanceUID for d in ct_datasets]
    pix = rs.get_pixels_by_source_instance(source_sop_instance_uids=sops, segment_numbers=[1])
    assert pix.shape == (NZ, NY, NX, 1), pix.shape
    assert np.array_equal(pix[..., 0].astype(bool), mask.astype(bool)), "SEG round trip mask differs"
    print(f"  {fixture}: DICOM-SEG, {NZ} frames, cuboid {int(mask.sum())} voxels (highdicom {hd.__version__})")
    return True


# ----------------------------------------------------------------------------
# RTSTRUCT (pydicom)
# ----------------------------------------------------------------------------
def gen_rtstruct(out_root: Path, ct_datasets: list[Dataset], geo: CTGeometry) -> None:
    fixture = "synth-rtstruct"
    out_dir = out_root / fixture
    ct0 = ct_datasets[0]
    sop = uid(fixture, "sop")
    ds = base_dataset("synth-ct-cube", RTStructureSetStorage, sop, "RTSTRUCT", 3, "synth cuboid RTSTRUCT")
    ds.SeriesInstanceUID = uid(fixture, "series")
    ds.InstanceNumber = 1
    ds.StructureSetLabel = "SYNTH_CUBOID"
    ds.StructureSetName = "synth cuboid"
    ds.StructureSetDate = DATE
    ds.StructureSetTime = TIME
    ds.OperatorsName = ""
    # referenced frame of reference -> study -> series -> images
    ci = Sequence()
    for d in ct_datasets:
        item = Dataset()
        item.ReferencedSOPClassUID = d.SOPClassUID
        item.ReferencedSOPInstanceUID = d.SOPInstanceUID
        ci.append(item)
    series = Dataset()
    series.SeriesInstanceUID = ct0.SeriesInstanceUID
    series.ContourImageSequence = ci
    study = Dataset()
    study.ReferencedSOPClassUID = "1.2.840.10008.3.1.2.3.1"  # Detached Study Management (conventional for RT)
    study.ReferencedSOPInstanceUID = ct0.StudyInstanceUID
    study.RTReferencedSeriesSequence = Sequence([series])
    ref_for = Dataset()
    ref_for.FrameOfReferenceUID = ct0.FrameOfReferenceUID
    ref_for.RTReferencedStudySequence = Sequence([study])
    ds.ReferencedFrameOfReferenceSequence = Sequence([ref_for])
    roi = Dataset()
    roi.ROINumber = 1
    roi.ReferencedFrameOfReferenceUID = ct0.FrameOfReferenceUID
    roi.ROIName = "cuboid"
    roi.ROIGenerationAlgorithm = "AUTOMATIC"
    ds.StructureSetROISequence = Sequence([roi])
    # contours: one closed planar rectangle per slice containing the cuboid
    contours = Sequence()
    x0, x1 = CUB_X[0] - 0.5, CUB_X[1] - 0.5
    y0, y1 = CUB_Y[0] - 0.5, CUB_Y[1] - 0.5
    for k in range(CUB_Z[0], CUB_Z[1]):
        pts = [geo.voxel_to_lps(x0, y0, k), geo.voxel_to_lps(x1, y0, k), geo.voxel_to_lps(x1, y1, k), geo.voxel_to_lps(x0, y1, k)]
        c = Dataset()
        img = Dataset()
        img.ReferencedSOPClassUID = ct_datasets[k].SOPClassUID
        img.ReferencedSOPInstanceUID = ct_datasets[k].SOPInstanceUID
        c.ContourImageSequence = Sequence([img])
        c.ContourGeometricType = "CLOSED_PLANAR"
        c.NumberOfContourPoints = 4
        c.ContourNumber = k - CUB_Z[0] + 1
        c.ContourData = [float(round(float(v), 5)) for p in pts for v in p]
        contours.append(c)
    rc = Dataset()
    rc.ROIDisplayColor = [255, 0, 0]
    rc.ReferencedROINumber = 1
    rc.ContourSequence = contours
    ds.ROIContourSequence = Sequence([rc])
    obs = Dataset()
    obs.ObservationNumber = 1
    obs.ReferencedROINumber = 1
    obs.ROIObservationLabel = "cuboid"
    obs.RTROIInterpretedType = "ORGAN"
    obs.ROIInterpreter = ""
    ds.RTROIObservationsSequence = Sequence([obs])
    ds.ApprovalStatus = "UNAPPROVED"
    save(ds, out_dir / f"{fixture}.dcm")
    sx, sy, sz = geo.spacing
    exp = {"fixture": fixture, "references": "synth-ct-cube", "roi_name": "cuboid", "contour_count": CUB_Z[1] - CUB_Z[0],
           "points_per_contour": 4, "contour_area_mm2": (CUB_X[1] - CUB_X[0]) * sx * (CUB_Y[1] - CUB_Y[0]) * sy,
           "contour_z_positions_lps": [float(round(float(geo.voxel_to_lps(0, 0, k)[2]), 5)) for k in range(CUB_Z[0], CUB_Z[1])],
           "rasterized_volume_mm3": (CUB_X[1] - CUB_X[0]) * (CUB_Y[1] - CUB_Y[0]) * (CUB_Z[1] - CUB_Z[0]) * sx * sy * sz,
           "expected_rendering": "one red rectangle per slice 9..24 exactly outlining the bright cuboid; contour->labelmap must give the cuboid mask"}
    (out_dir / "expected.json").write_text(json.dumps(exp, indent=2) + "\n")
    back = pydicom.dcmread(out_dir / f"{fixture}.dcm")
    assert back.Modality == "RTSTRUCT" and len(back.StructureSetROISequence) == 1
    cs = back.ROIContourSequence[0].ContourSequence
    assert len(cs) == CUB_Z[1] - CUB_Z[0]
    for c in cs:
        pts = np.array(c.ContourData, float).reshape(-1, 3)
        assert pts.shape[0] == 4 and c.ContourGeometricType == "CLOSED_PLANAR"
        # shoelace area
        area = 0.5 * abs(np.dot(pts[:, 0], np.roll(pts[:, 1], -1)) - np.dot(pts[:, 1], np.roll(pts[:, 0], -1)))
        assert np.isclose(area, exp["contour_area_mm2"], atol=1e-3), area
    print(f"  {fixture}: RTSTRUCT with {len(cs)} closed planar contours of {exp['contour_area_mm2']} mm2")


# ----------------------------------------------------------------------------
# PET/CT pair (SUVbw + fusion)
# ----------------------------------------------------------------------------
PETCT_PATIENT = ("SYNTH^PETCT", "SYNTH-002")
PETCT_CT_SHAPE, PETCT_CT_SPACING = (64, 64, 32), (2.0, 2.0, 3.0)
PETCT_PT_SHAPE, PETCT_PT_SPACING = (32, 32, 32), (4.0, 4.0, 3.0)   # same 128x128x96 mm extent as the CT
PETCT_BODY_RADII_MM = (52.0, 46.0, 40.0)      # soft-tissue ellipsoid centred on the LPS origin
PETCT_SPHERE_CENTRE_LPS = (20.0, -12.0, 0.0)  # hot sphere (PET) / faint lesion (CT)
PETCT_SPHERE_RADIUS_MM = 12.0
PETCT_CT_LESION_HU = 60
PETCT_WEIGHT_KG, PETCT_HEIGHT_M = 70, 1.75
PETCT_DOSE_BQ = 370000000                     # RadionuclideTotalDose (10 mCi)
PETCT_HALF_LIFE_S = 6586.2                    # F-18
PETCT_INJECTION_TIME = "110000.000000"        # RadiopharmaceuticalStartTime
PETCT_SCAN_TIME = TIME                        # SeriesTime: 60 min post injection
PETCT_ACQ_TIME = "120130.000000"              # AcquisitionTime: 90 s after SeriesTime
PETCT_FRAME_DURATION_MS = 180000
PETCT_PT_SLOPE = 0.5                          # RescaleSlope: Bq/mL = stored * 0.5
PETCT_SUV_BACKGROUND, PETCT_SUV_HOT = 1.0, 8.0
PETCT_PT_NOISE_FRACTION = 0.01                # Gaussian sigma as a fraction of the background stored value


def tm_seconds(tm: str) -> float:
    """DICOM TM (HHMMSS.ffffff) -> seconds since midnight."""
    return int(tm[0:2]) * 3600 + int(tm[2:4]) * 60 + float(tm[4:])


def decay_factor(scan_tm: str, injection_tm: str, half_life_s: float) -> float:
    return math.exp(-math.log(2) * (tm_seconds(scan_tm) - tm_seconds(injection_tm)) / half_life_s)


def grid_lps(geo: CTGeometry) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """LPS coordinates (mm) of every voxel centre; each array is indexed [z, y, x]."""
    nx, ny, nz = geo.shape
    k, j, i = np.mgrid[0:nz, 0:ny, 0:nx]
    a = geo.affine_lps()
    return tuple(a[r, 0] * i + a[r, 1] * j + a[r, 2] * k + a[r, 3] for r in range(3))


def petct_masks(geo: CTGeometry) -> tuple[np.ndarray, np.ndarray]:
    """(body ellipsoid, hot sphere) masks on the given grid, defined in physical (LPS) space."""
    x, y, z = grid_lps(geo)
    rx, ry, rz = PETCT_BODY_RADII_MM
    body = (x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2 <= 1.0
    cx, cy, cz = PETCT_SPHERE_CENTRE_LPS
    sphere = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= PETCT_SPHERE_RADIUS_MM ** 2
    return body, sphere


def write_pt_series(fixture: str, out_dir: Path, stored: np.ndarray, geo: CTGeometry, frame_uid: str,
                    window: tuple[float, float]) -> list[Dataset]:
    nz, ny, nx = stored.shape
    datasets = []
    for k in range(nz):
        sop = uid(fixture, "pt", k)
        ds = base_dataset(fixture, PositronEmissionTomographyImageStorage, sop, "PT", 2, f"{fixture} PT",
                          patient=PETCT_PATIENT)
        ds.FrameOfReferenceUID = frame_uid
        ds.PositionReferenceIndicator = ""
        ds.ImageType = ["ORIGINAL", "PRIMARY"]
        ds.PatientPosition = "HFS"
        ds.PatientWeight = PETCT_WEIGHT_KG
        ds.PatientSize = PETCT_HEIGHT_M
        ds.AcquisitionDate = DATE
        ds.AcquisitionTime = PETCT_ACQ_TIME
        ds.AcquisitionNumber = 1
        ds.InstanceNumber = k + 1
        ds.ImageIndex = k + 1
        ds.ImagePositionPatient = [float(round(v, 6)) for v in geo.ipp(k)]
        ds.ImageOrientationPatient = [round(v, 8) for v in geo.iop()]
        ds.PixelSpacing = [geo.spacing[1], geo.spacing[0]]
        ds.SliceThickness = geo.spacing[2]
        ds.SpacingBetweenSlices = geo.spacing[2]
        ds.SliceLocation = float(round(float(np.dot(geo.ipp(k), geo.normal)), 6))
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.Rows, ds.Columns = ny, nx
        ds.BitsAllocated, ds.BitsStored, ds.HighBit = 16, 16, 15
        ds.PixelRepresentation = 0
        ds.RescaleIntercept = 0
        ds.RescaleSlope = PETCT_PT_SLOPE
        ds.WindowCenter = window[0]
        ds.WindowWidth = window[1]
        # PET Series / PET Image modules
        ds.Units = "BQML"
        ds.CountsSource = "EMISSION"
        ds.SeriesType = ["STATIC", "IMAGE"]
        ds.NumberOfSlices = nz
        ds.NumberOfTimeSlices = 1
        ds.CorrectedImage = ["DECY", "ATTN"]
        ds.DecayCorrection = "START"
        ds.ReconstructionMethod = "SYNTHETIC"
        ds.CollimatorType = "NONE"
        ds.RandomsCorrectionMethod = "NONE"
        ds.AttenuationCorrectionMethod = "CT"
        ds.ScatterCorrectionMethod = "NONE"
        ds.DoseCalibrationFactor = 1.0
        ds.FrameReferenceTime = 0.0            # ms from scan start; decay corrected to START
        ds.ActualFrameDuration = PETCT_FRAME_DURATION_MS
        rp = Dataset()
        rp.Radiopharmaceutical = "Fludeoxyglucose F^18^"
        rp.RadiopharmaceuticalStartTime = PETCT_INJECTION_TIME
        rp.RadiopharmaceuticalStartDateTime = DATE + PETCT_INJECTION_TIME
        rp.RadionuclideTotalDose = PETCT_DOSE_BQ
        rp.RadionuclideHalfLife = PETCT_HALF_LIFE_S
        nuc = Dataset()
        nuc.CodeValue, nuc.CodingSchemeDesignator, nuc.CodeMeaning = "C-111A1", "SRT", "^18^Fluorine"
        rp.RadionuclideCodeSequence = Sequence([nuc])
        agent = Dataset()
        agent.CodeValue, agent.CodingSchemeDesignator, agent.CodeMeaning = "C-B1031", "SRT", "Fluorodeoxyglucose F^18^"
        rp.RadiopharmaceuticalCodeSequence = Sequence([agent])
        ds.RadiopharmaceuticalInformationSequence = Sequence([rp])
        ds.PixelData = stored[k].tobytes()
        save(ds, out_dir / f"pt_{k + 1:03d}.dcm")
        datasets.append(ds)
    return datasets


def gen_petct(out_root: Path, rng: np.random.Generator) -> None:
    fixture = "synth-petct"
    out_dir = out_root / fixture
    ct_geo = CTGeometry(PETCT_CT_SPACING, 0.0, PETCT_CT_SHAPE)
    pt_geo = CTGeometry(PETCT_PT_SPACING, 0.0, PETCT_PT_SHAPE)
    # CT: soft-tissue ellipsoid in air, faint lesion where the PET sphere sits (fusion landmark)
    body, sphere = petct_masks(ct_geo)
    hu = np.full(body.shape, HU_AIR, dtype=np.int32)
    hu[body] = HU_BODY
    hu[sphere] = PETCT_CT_LESION_HU
    hu = np.clip(hu + rng.normal(0.0, 3.0, hu.shape).round().astype(np.int32), -1024, 3071).astype(np.int16)
    # PET: activity concentration chosen so that SUVbw(background) = 1 and SUVbw(sphere) = 8 using SeriesTime
    weight_g = PETCT_WEIGHT_KG * 1000
    df_series = decay_factor(PETCT_SCAN_TIME, PETCT_INJECTION_TIME, PETCT_HALF_LIFE_S)
    df_acq = decay_factor(PETCT_ACQ_TIME, PETCT_INJECTION_TIME, PETCT_HALF_LIFE_S)
    suv_per_bqml = weight_g / (PETCT_DOSE_BQ * df_series)
    bqml_per_suv = 1.0 / suv_per_bqml
    stored_bg = int(round(PETCT_SUV_BACKGROUND * bqml_per_suv / PETCT_PT_SLOPE))
    stored_hot = int(round(PETCT_SUV_HOT * bqml_per_suv / PETCT_PT_SLOPE))
    pbody, psphere = petct_masks(pt_geo)
    act = np.zeros(pbody.shape, dtype=np.float64)
    act[pbody] = stored_bg
    act[psphere] = stored_hot
    act += rng.normal(0.0, PETCT_PT_NOISE_FRACTION * stored_bg, act.shape)
    stored = np.clip(act.round(), 0, 65535).astype("<u2")
    frame_uid = uid(fixture, "frame-of-reference")
    window = (round(5.0 * bqml_per_suv, 3), round(10.0 * bqml_per_suv, 3))  # SUV 0..10 in Bq/mL
    ct_ds = write_ct_series(fixture, out_dir / "dicom" / "ct", hu, ct_geo, patient=PETCT_PATIENT)
    pt_ds = write_pt_series(fixture, out_dir / "dicom" / "pt", stored, pt_geo, frame_uid, window)
    assert ct_ds[0].FrameOfReferenceUID == frame_uid

    bq = stored.astype(np.float64) * PETCT_PT_SLOPE
    bg_mask = pbody & ~psphere

    def suv_block(df: float, scan_tag: str, scan_time: str) -> dict:
        f = weight_g / (PETCT_DOSE_BQ * df)
        return {
            "scan_time_source": scan_tag, "scan_time": scan_time,
            "elapsed_since_injection_s": tm_seconds(scan_time) - tm_seconds(PETCT_INJECTION_TIME),
            "decay_factor": df,
            "suv_per_bq_per_ml": f,
            "suv_per_stored_unit": f * PETCT_PT_SLOPE,
            "sphere_suv_max": float(bq[psphere].max() * f),
            "sphere_suv_mean": float(bq[psphere].mean() * f),
            "sphere_suv_min": float(bq[psphere].min() * f),
            "background_suv_mean": float(bq[bg_mask].mean() * f),
            "background_suv_std": float(bq[bg_mask].std() * f),
        }

    ext = [n * s for n, s in zip(PETCT_CT_SHAPE, PETCT_CT_SPACING)]
    exp = {
        "fixture": fixture,
        "patient": {"name": PETCT_PATIENT[0], "id": PETCT_PATIENT[1], "weight_kg": PETCT_WEIGHT_KG, "size_m": PETCT_HEIGHT_M},
        "study_instance_uid": ct_ds[0].StudyInstanceUID,
        "frame_of_reference_uid": frame_uid,
        "physical_extent_mm_xyz": ext,
        "ct": {
            "series_instance_uid": ct_ds[0].SeriesInstanceUID, "sop_class_uid": CTImageStorage, "modality": "CT",
            "volume_shape_xyz": list(PETCT_CT_SHAPE), "slice_count": PETCT_CT_SHAPE[2], "spacing_mm_xyz": list(PETCT_CT_SPACING),
            "image_orientation_patient": ct_geo.iop(),
            "first_slice_image_position_patient": [float(v) for v in ct_geo.ipp(0)],
            "rescale_intercept": RESCALE_INTERCEPT, "rescale_slope": 1, "window_center": WINDOW_CENTER, "window_width": WINDOW_WIDTH,
            "hu": {"air": HU_AIR, "body": HU_BODY, "lesion": PETCT_CT_LESION_HU, "noise_sigma": 3},
            "body_ellipsoid_radii_mm_xyz": list(PETCT_BODY_RADII_MM), "body_ellipsoid_centre_lps_mm": [0.0, 0.0, 0.0],
            "lesion_voxel_count": int(sphere.sum()),
        },
        "pt": {
            "series_instance_uid": pt_ds[0].SeriesInstanceUID, "sop_class_uid": PositronEmissionTomographyImageStorage, "modality": "PT",
            "grid": "32x32x32 at 4x4x3 mm: same FrameOfReferenceUID and the same 128x128x96 mm physical extent as the CT, "
                    "half the in-plane sampling (one PET voxel covers 2x2 CT voxels); the PET origin is therefore +1 mm in x and y "
                    "from the CT origin and the same in z. Fusion must resample, not assume matching index grids.",
            "volume_shape_xyz": list(PETCT_PT_SHAPE), "slice_count": PETCT_PT_SHAPE[2], "spacing_mm_xyz": list(PETCT_PT_SPACING),
            "image_orientation_patient": pt_geo.iop(),
            "first_slice_image_position_patient": [float(v) for v in pt_geo.ipp(0)],
            "pixel_dtype": "uint16", "rescale_slope": PETCT_PT_SLOPE, "rescale_intercept": 0,
            "units": "BQML", "decay_correction": "START", "corrected_image": ["DECY", "ATTN"],
            "frame_reference_time_ms": 0.0, "actual_frame_duration_ms": PETCT_FRAME_DURATION_MS,
            "window_center_bq_per_ml": window[0], "window_width_bq_per_ml": window[1],
            "stored_value_background": stored_bg, "stored_value_hot": stored_hot,
            "noise_sigma_stored": PETCT_PT_NOISE_FRACTION * stored_bg,
            "activity_bq_per_ml_background_nominal": stored_bg * PETCT_PT_SLOPE,
            "activity_bq_per_ml_hot_nominal": stored_hot * PETCT_PT_SLOPE,
        },
        "suv_bw": {
            "formula": "SUVbw = C_Bq_per_mL * weight_g / (injected_dose_Bq * decay_factor); "
                       "decay_factor = exp(-ln2 * (scan_time - injection_time) / half_life_s); "
                       "C_Bq_per_mL = stored * RescaleSlope + RescaleIntercept",
            "weight_g": weight_g, "injected_dose_bq": PETCT_DOSE_BQ, "half_life_s": PETCT_HALF_LIFE_S,
            "radionuclide": {"code_value": "C-111A1", "coding_scheme_designator": "SRT", "code_meaning": "^18^Fluorine"},
            "injection_time": PETCT_INJECTION_TIME, "series_time": PETCT_SCAN_TIME, "acquisition_time": PETCT_ACQ_TIME,
            "date": DATE,
            "primary": suv_block(df_series, "SeriesTime", PETCT_SCAN_TIME),
            "alternative_acquisition_time": suv_block(df_acq, "AcquisitionTime", PETCT_ACQ_TIME),
            "note": "DecayCorrection=START and SeriesTime <= AcquisitionTime, so the QIBA SUV pseudo-code uses SeriesTime as the "
                    "scan time ('primary'); tools that use AcquisitionTime get the 'alternative' values (about 1.6% higher).",
        },
        "hot_sphere": {
            "centre_lps_mm": list(PETCT_SPHERE_CENTRE_LPS), "radius_mm": PETCT_SPHERE_RADIUS_MM,
            "volume_mm3_analytic": 4.0 / 3.0 * math.pi * PETCT_SPHERE_RADIUS_MM ** 3,
            "pet_voxel_count": int(psphere.sum()), "pet_voxel_volume_mm3": int(psphere.sum()) * float(np.prod(PETCT_PT_SPACING)),
            "ct_voxel_count": int(sphere.sum()), "ct_voxel_volume_mm3": int(sphere.sum()) * float(np.prod(PETCT_CT_SPACING)),
            "membership": "voxel centre within radius (no partial-volume weighting)",
        },
        "background": {"region": "inside body ellipsoid, outside sphere", "pet_voxel_count": int(bg_mask.sum())},
        "files": {"ct_dicom_dir": "dicom/ct/", "pt_dicom_dir": "dicom/pt/"},
        "expected_rendering": "PET/CT fusion: the hot sphere (SUVbw ~8) must sit exactly on the faint +60 HU lesion at LPS "
                              "(20, -12, 0) mm; body background SUVbw ~1; air ~0. A viewer that ignores RescaleSlope shows "
                              "SUV twice too high; one that ignores decay shows SUV ~0.68x.",
    }
    (out_dir / "expected.json").write_text(json.dumps(exp, indent=2) + "\n")
    verify_petct(fixture, out_dir, exp, hu, stored, pt_geo)
    p = exp["suv_bw"]["primary"]
    print(f"  {fixture}: CT {PETCT_CT_SHAPE} @ {PETCT_CT_SPACING} mm + PT {PETCT_PT_SHAPE} @ {PETCT_PT_SPACING} mm, one frame of "
          f"reference; SUVbw sphere max {p['sphere_suv_max']:.3f} / mean {p['sphere_suv_mean']:.3f}, "
          f"background {p['background_suv_mean']:.3f} (decay factor {p['decay_factor']:.5f})")


def verify_petct(fixture: str, out_dir: Path, exp: dict, hu: np.ndarray, stored: np.ndarray, pt_geo: CTGeometry) -> None:
    ct_files = sorted((out_dir / "dicom" / "ct").glob("ct_*.dcm"))
    pt_files = sorted((out_dir / "dicom" / "pt").glob("pt_*.dcm"))
    assert len(ct_files) == PETCT_CT_SHAPE[2] and len(pt_files) == PETCT_PT_SHAPE[2], (len(ct_files), len(pt_files))
    c0, p0 = pydicom.dcmread(ct_files[0]), pydicom.dcmread(pt_files[0])
    assert c0.FrameOfReferenceUID == p0.FrameOfReferenceUID == exp["frame_of_reference_uid"]
    assert c0.StudyInstanceUID == p0.StudyInstanceUID and c0.SeriesInstanceUID != p0.SeriesInstanceUID
    assert c0.Modality == "CT" and c0.SOPClassUID == CTImageStorage
    assert p0.Modality == "PT" and p0.SOPClassUID == "1.2.840.10008.5.1.4.1.1.128"
    assert str(c0.PatientName) == str(p0.PatientName) == PETCT_PATIENT[0] and c0.PatientID == p0.PatientID == PETCT_PATIENT[1]
    assert p0.Units == "BQML" and p0.DecayCorrection == "START" and list(p0.CorrectedImage) == ["DECY", "ATTN"]
    assert float(p0.PatientWeight) == PETCT_WEIGHT_KG and p0.SeriesDate == p0.AcquisitionDate == DATE
    rp = p0.RadiopharmaceuticalInformationSequence[0]
    assert float(rp.RadionuclideTotalDose) == PETCT_DOSE_BQ and float(rp.RadionuclideHalfLife) == PETCT_HALF_LIFE_S
    assert rp.RadionuclideCodeSequence[0].CodeValue == "C-111A1" and rp.RadionuclideCodeSequence[0].CodingSchemeDesignator == "SRT"
    assert "FrameReferenceTime" in p0 and int(p0.ActualFrameDuration) == PETCT_FRAME_DURATION_MS
    # SUVbw recomputed from the headers alone must reproduce expected.json
    for block, scan_time in ((exp["suv_bw"]["primary"], str(p0.SeriesTime)),
                             (exp["suv_bw"]["alternative_acquisition_time"], str(p0.AcquisitionTime))):
        df = decay_factor(scan_time, str(rp.RadiopharmaceuticalStartTime), float(rp.RadionuclideHalfLife))
        assert np.isclose(df, block["decay_factor"]), (df, block["decay_factor"])
    df = decay_factor(str(p0.SeriesTime), str(rp.RadiopharmaceuticalStartTime), float(rp.RadionuclideHalfLife))
    factor = float(p0.PatientWeight) * 1000.0 / (float(rp.RadionuclideTotalDose) * df)
    vol = np.stack([pydicom.dcmread(f).pixel_array for f in pt_files])
    assert vol.dtype == np.uint16 and np.array_equal(vol, stored), f"{fixture}: PT round trip changed stored values"
    suv = (vol.astype(np.float64) * float(p0.RescaleSlope) + float(p0.RescaleIntercept)) * factor
    pbody, psphere = petct_masks(pt_geo)
    prim = exp["suv_bw"]["primary"]
    assert np.isclose(suv[psphere].max(), prim["sphere_suv_max"]) and np.isclose(suv[pbody & ~psphere].mean(), prim["background_suv_mean"])
    assert abs(suv[psphere].max() - PETCT_SUV_HOT) < 0.15, suv[psphere].max()
    assert abs(suv[psphere].mean() - PETCT_SUV_HOT) < 0.05, suv[psphere].mean()
    assert abs(suv[pbody & ~psphere].mean() - PETCT_SUV_BACKGROUND) < 0.01, suv[pbody & ~psphere].mean()
    assert suv[~pbody].mean() < 0.05
    ct_vol = np.stack([pydicom.dcmread(f).pixel_array.astype(np.int32) + RESCALE_INTERCEPT for f in ct_files])
    assert np.array_equal(ct_vol, hu), f"{fixture}: CT round trip changed HU"
    # SimpleITK: both series span the same physical box; the sphere centre lands on the CT lesion and the PET hot spot
    imgs = {}
    for name in ("ct", "pt"):
        reader = sitk.ImageSeriesReader()
        reader.SetFileNames(sitk.ImageSeriesReader.GetGDCMSeriesFileNames(str(out_dir / "dicom" / name)))
        imgs[name] = reader.Execute()
    assert imgs["ct"].GetSize() == PETCT_CT_SHAPE and imgs["pt"].GetSize() == PETCT_PT_SHAPE
    assert np.allclose(imgs["ct"].GetSpacing(), PETCT_CT_SPACING) and np.allclose(imgs["pt"].GetSpacing(), PETCT_PT_SPACING)
    boxes = []
    for img in imgs.values():
        assert np.allclose(img.GetDirection(), np.eye(3).ravel(), atol=1e-6)
        lo = np.array(img.GetOrigin()) - np.array(img.GetSpacing()) / 2
        boxes.append((lo, lo + np.array(img.GetSize()) * np.array(img.GetSpacing())))
    assert np.allclose(boxes[0][0], boxes[1][0], atol=1e-6) and np.allclose(boxes[0][1], boxes[1][1], atol=1e-6), boxes
    assert np.allclose(boxes[0][1] - boxes[0][0], exp["physical_extent_mm_xyz"])
    ci = imgs["ct"].TransformPhysicalPointToIndex(PETCT_SPHERE_CENTRE_LPS)
    pi = imgs["pt"].TransformPhysicalPointToIndex(PETCT_SPHERE_CENTRE_LPS)
    assert hu[ci[2], ci[1], ci[0]] > 30 and suv[pi[2], pi[1], pi[0]] > 7.5, (hu[ci[2], ci[1], ci[0]], suv[pi[2], pi[1], pi[0]])
    assert np.isclose(suv[pi[2], pi[1], pi[0]], float(sitk.GetArrayFromImage(imgs["pt"])[pi[2], pi[1], pi[0]]) * factor)


# ----------------------------------------------------------------------------
# DX JPEG Baseline (Process 1) + uncompressed twin
# ----------------------------------------------------------------------------
def gen_dx_jpeg(out_root: Path, rng: np.random.Generator) -> bool:
    fixture = "synth-dx-jpeg"
    out_dir = out_root / fixture
    try:
        from PIL import Image
    except ImportError as exc:
        print(f"  {fixture}: SKIPPED (Pillow not importable: {exc}); install with `uv pip install pillow`")
        return False
    from pydicom.encaps import encapsulate, generate_frames
    rows = cols = 512
    quality = 90
    values = {"air": 25, "soft_tissue": 150, "lung": 45, "rib": 120, "mediastinum": 215, "heart": 205}
    yy, xx = np.mgrid[0:rows, 0:cols]

    def ellipse(cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
        return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0

    img = np.full((rows, cols), values["air"], dtype=np.int32)
    img[ellipse(256, 270, 235, 250)] = values["soft_tissue"]                    # thorax
    lungs = ellipse(168, 250, 88, 145) | ellipse(344, 250, 88, 145)
    img[lungs] = values["lung"]
    ribs = np.zeros_like(lungs)
    for k in range(7):                                                          # 7 rib pairs, gently curved
        ribs |= np.abs(yy - (118 + 42 * k + 0.0025 * (xx - 256) ** 2)) <= 4
    img[lungs & ribs] = values["rib"]
    img[(np.abs(xx - 256) <= 40) & (yy >= 60) & (yy <= 470)] = values["mediastinum"]
    img[ellipse(236, 335, 82, 68)] = values["heart"]
    img += rng.integers(-6, 7, img.shape)
    px = np.clip(img, 0, 255).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(px).save(buf, format="JPEG", quality=quality)
    jpeg = buf.getvalue()
    decoded = np.asarray(Image.open(io.BytesIO(jpeg)))
    assert decoded.shape == (rows, cols) and decoded.dtype == np.uint8

    def dx_dataset(key: str, series_number: int, desc: str) -> Dataset:
        ds = base_dataset(fixture, DigitalXRayImageStorageForPresentation, uid(fixture, key), "DX", series_number, desc)
        ds.ImageType = ["ORIGINAL", "PRIMARY"]
        ds.PresentationIntentType = "FOR PRESENTATION"
        ds.InstanceNumber = 1
        ds.PatientOrientation = ["L", "F"]
        ds.ViewPosition = "PA"
        ds.BodyPartExamined = "CHEST"
        ds.ImagerPixelSpacing = [0.15, 0.15]
        ds.PixelSpacing = [0.15, 0.15]
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.Rows, ds.Columns = rows, cols
        ds.BitsAllocated, ds.BitsStored, ds.HighBit = 8, 8, 7
        ds.PixelRepresentation = 0
        ds.PixelIntensityRelationship = "LOG"
        ds.PixelIntensityRelationshipSign = 1
        ds.RescaleIntercept = 0
        ds.RescaleSlope = 1
        ds.RescaleType = "US"
        ds.WindowCenter = 128
        ds.WindowWidth = 256
        ds.BurnedInAnnotation = "NO"
        return ds

    ds = dx_dataset("dx-jpeg", 1, "synth DX JPEG baseline")
    ds.file_meta.TransferSyntaxUID = JPEGBaseline8Bit
    ds.LossyImageCompression = "01"
    ds.LossyImageCompressionRatio = round(rows * cols / len(jpeg), 2)
    ds.LossyImageCompressionMethod = "ISO_10918_1"
    ds.PixelData = encapsulate([jpeg])
    ds["PixelData"].is_undefined_length = True
    save(ds, out_dir / f"{fixture}.dcm")
    twin = dx_dataset("dx-uncompressed", 2, "synth DX uncompressed twin")
    twin.LossyImageCompression = "00"
    twin.PixelData = px.tobytes()
    save(twin, out_dir / "synth-dx-uncompressed.dcm")

    rois = {"lung_left_of_image": ([220, 252], [150, 182]), "mediastinum": ([220, 252], [240, 272])}

    def roi_mean(a: np.ndarray, r: tuple[list[int], list[int]]) -> float:
        return float(a[r[0][0]:r[0][1], r[1][0]:r[1][1]].mean())

    diff = np.abs(decoded.astype(np.int32) - px.astype(np.int32))
    exp = {
        "fixture": fixture, "rows": rows, "columns": cols, "bits_allocated": 8, "photometric_interpretation": "MONOCHROME2",
        "sop_class_uid": DigitalXRayImageStorageForPresentation, "transfer_syntax_uid": JPEGBaseline8Bit,
        "jpeg_encoder": "Pillow, grayscale, quality 90", "jpeg_byte_length": len(jpeg),
        "imager_pixel_spacing_mm": [0.15, 0.15], "window_center": 128, "window_width": 256,
        "phantom_values": dict(values, noise_uniform_range=[-6, 6]),
        "rois": {name: {"rows_half_open": r[0], "cols_half_open": r[1],
                        "mean_decoded_jpeg": roi_mean(decoded, r), "mean_uncompressed": roi_mean(px, r)}
                 for name, r in rois.items()},
        "max_abs_diff_vs_uncompressed": int(diff.max()),
        "mean_abs_diff_vs_uncompressed": float(diff.mean()),
        "files": {"jpeg": f"{fixture}.dcm", "uncompressed": "synth-dx-uncompressed.dcm"},
        "expected_rendering": "MONOCHROME2 chest-like phantom: dark lungs with brighter curved ribs, bright central "
                              "mediastinum with a heart shadow, dark air around the thorax. The JPEG file must look the "
                              "same as the uncompressed twin (ROI means within ~1 grey level).",
    }
    (out_dir / "expected.json").write_text(json.dumps(exp, indent=2) + "\n")
    # verify: pydicom + Pillow decode of the encapsulated frame
    back = pydicom.dcmread(out_dir / f"{fixture}.dcm")
    assert back.file_meta.TransferSyntaxUID == JPEGBaseline8Bit and back.SOPClassUID == DigitalXRayImageStorageForPresentation
    assert back.PhotometricInterpretation == "MONOCHROME2" and back.BitsAllocated == 8 and back.BitsStored == 8
    assert [float(v) for v in back.ImagerPixelSpacing] == [0.15, 0.15] and back.LossyImageCompression == "01"
    frame = next(generate_frames(back.PixelData, number_of_frames=1))
    # odd-length JPEG streams are padded with one trailing NUL to an even fragment length (PS3.5 A.4)
    assert frame.rstrip(b"\x00") == jpeg.rstrip(b"\x00"), "encapsulated frame differs from the encoded JPEG"
    direct = np.asarray(Image.open(io.BytesIO(frame)))
    try:
        from pydicom.pixels import pixel_array as decode_pixels
        arr = decode_pixels(back, decoding_plugin="pillow")
    except Exception as exc:  # noqa: BLE001 - no pillow plugin for this pydicom; decode the frame ourselves
        print(f"  {fixture}: pydicom pillow decoder unavailable ({exc}); decoding the frame with Pillow directly")
        arr = direct
    assert arr.shape == (rows, cols) and arr.dtype == np.uint8 and np.array_equal(arr, direct) and np.array_equal(arr, decoded)
    unc = pydicom.dcmread(out_dir / "synth-dx-uncompressed.dcm")
    assert unc.file_meta.TransferSyntaxUID == ExplicitVRLittleEndian and np.array_equal(unc.pixel_array, px)
    assert int(np.abs(arr.astype(np.int32) - unc.pixel_array.astype(np.int32)).max()) == exp["max_abs_diff_vs_uncompressed"]
    for name, r in rois.items():
        assert np.isclose(roi_mean(arr, r), exp["rois"][name]["mean_decoded_jpeg"])
        assert abs(roi_mean(arr, r) - roi_mean(unc.pixel_array, r)) < 1.0, name
    assert roi_mean(arr, rois["lung_left_of_image"]) < 100 < 180 < roi_mean(arr, rois["mediastinum"])
    lung, med = exp["rois"]["lung_left_of_image"]["mean_decoded_jpeg"], exp["rois"]["mediastinum"]["mean_decoded_jpeg"]
    print(f"  {fixture}: 512x512 8-bit MONOCHROME2 DX, JPEG baseline {len(jpeg)} bytes (q{quality}) + uncompressed twin; "
          f"lung ROI mean {lung:.2f}, mediastinum ROI mean {med:.2f}, max |diff| vs uncompressed {exp['max_abs_diff_vs_uncompressed']}")
    return True


# ----------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"output directory (default {DEFAULT_OUT})")
    ap.add_argument("--only", action="append", default=[], metavar="ID", help="generate only these fixture ids (repeatable)")
    args = ap.parse_args(argv)
    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    want = set(args.only) or {"synth-ct-cube", "synth-anisotropic", "synth-oblique", "synth-mono1", "synth-multiframe",
                              "synth-rgb", "synth-seg", "synth-rtstruct", "synth-petct", "synth-dx-jpeg"}
    if want & {"synth-seg", "synth-rtstruct"}:
        want.add("synth-ct-cube")
    rng = np.random.default_rng(SEED)
    hu = make_phantom(rng)
    print(f"writing synthetic fixtures to {out}")
    skipped = []
    ct_datasets: list[Dataset] = []
    geo = None
    if "synth-ct-cube" in want:
        _, ct_datasets, geo = gen_ct_fixture("synth-ct-cube", out, (1.0, 1.0, 2.0), 0.0, hu, itk_copies=True)
    if "synth-anisotropic" in want:
        gen_ct_fixture("synth-anisotropic", out, (0.5, 0.5, 3.0), 0.0, hu, itk_copies=False)
    if "synth-oblique" in want:
        gen_ct_fixture("synth-oblique", out, (1.0, 1.0, 2.0), 20.0, hu, itk_copies=False)
    if "synth-mono1" in want:
        gen_mono1(out, np.random.default_rng(SEED + 1))
    if "synth-multiframe" in want:
        gen_multiframe(out, np.random.default_rng(SEED + 2))
    if "synth-rgb" in want:
        gen_rgb(out)
    if "synth-seg" in want:
        if not gen_seg(out, ct_datasets, out / "synth-ct-cube" / "dicom"):
            skipped.append("synth-seg")
    if "synth-rtstruct" in want:
        gen_rtstruct(out, ct_datasets, geo)
    if "synth-petct" in want:
        gen_petct(out, np.random.default_rng(SEED + 3))
    if "synth-dx-jpeg" in want:
        if not gen_dx_jpeg(out, np.random.default_rng(SEED + 4)):
            skipped.append("synth-dx-jpeg")

    checksums = {p.relative_to(out).as_posix(): sha256(p) for p in sorted(out.rglob("*"))
                 if p.is_file() and p.name != "checksums.json"}
    (out / "checksums.json").write_text(json.dumps(checksums, indent=2) + "\n")
    total = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(f"done: {len(checksums)} files, {total / 1e6:.1f} MB, checksums in {out / 'checksums.json'}")
    if skipped:
        print(f"skipped: {', '.join(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
