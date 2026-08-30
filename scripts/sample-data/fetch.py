#!/usr/bin/env python3
"""
Manifest-driven fetcher for MedAI-OS sample data.

Reads scripts/sample-data/manifest.json and downloads public, de-identified
fixtures into ./sample-data/ (gitignored). Standard library only.

    python3 scripts/sample-data/fetch.py                       # tier P0 + corpus
    python3 scripts/sample-data/fetch.py --tier P1             # one tier
    python3 scripts/sample-data/fetch.py --fixture msd-spleen  # one fixture (repeatable)
    python3 scripts/sample-data/fetch.py --list                # show manifest
    python3 scripts/sample-data/fetch.py --verify              # check sha256 of present files
    python3 scripts/sample-data/fetch.py --upload-to-orthanc http://localhost:8042

Manifest entry schema (see manifest.json):
    id, tier (P0|P1|P2|corpus), kind (download|synthetic|manual), modality,
    format, description, license, citation, matrix_rows[], optional (bool),
    files[] for downloads: {url, path, sha256, size, extract?, extracted_sha256?}
    instructions for manual fixtures; generator for synthetic fixtures;
    dicomweb{} for fixtures that can also be streamed from a DICOMweb server.

Idempotent: a file whose sha256 matches is skipped. Archives (extract="zip"
or "tar") are unpacked next to the archive; their contents are verified by
`extracted_sha256`, a hash over the sorted (sha256, relative path) pairs of
the unpacked files. Entries flagged `volatile_archive` (Orthanc regenerates
the zip per request, with fresh timestamps) keep sha256 null on purpose and
rely on extracted_sha256 alone.

Never embeds credentials. Orthanc basic auth may be supplied via the
ORTHANC_AUTH environment variable ("user:password").
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import shutil
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
DEFAULT_DEST = REPO_ROOT / "sample-data"
MANIFEST = HERE / "manifest.json"
USER_AGENT = "medai-os-sample-data-fetch/1.0 (+https://github.com/medai-os)"
DEFAULT_TIERS = ("P0", "corpus")
RETRIES = 4
BACKOFF_BASE = 2.0  # seconds; 2, 4, 8, 16


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def log(msg: str = "") -> None:
    print(msg, flush=True)


def human(n: int | None) -> str:
    if n is None:
        return "?"
    f = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if f < 1024 or unit == "GB":
            return f"{f:.1f} {unit}" if unit != "B" else f"{int(f)} B"
        f /= 1024
    return f"{f:.1f} GB"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def tree_sha256(root: Path) -> tuple[str, int, int]:
    """Hash over sorted 'sha256  relpath' lines of every file under root.

    Returns (hexdigest, file_count, total_bytes)."""
    lines = []
    total = 0
    for p in sorted(root.rglob("*")):
        if p.is_file():
            rel = p.relative_to(root).as_posix()
            lines.append(f"{sha256_file(p)}  {rel}\n")
            total += p.stat().st_size
    h = hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()
    return h, len(lines), total


def load_manifest() -> list[dict]:
    with MANIFEST.open() as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        sys.exit(f"manifest {MANIFEST} must be a JSON array")
    return data


def save_manifest(entries: list[dict]) -> None:
    with MANIFEST.open("w") as fh:
        json.dump(entries, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def extract_dir_for(archive: Path) -> Path:
    name = archive.name
    for suffix in (".tar.gz", ".tgz", ".tar", ".zip"):
        if name.endswith(suffix):
            return archive.with_name(name[: -len(suffix)])
    return archive.with_name(name + ".extracted")


# ----------------------------------------------------------------------------
# download with retry/backoff and resume
# ----------------------------------------------------------------------------
def download(url: str, dest: Path, expected_size: int | None = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    last_err: Exception | None = None
    for attempt in range(RETRIES + 1):
        try:
            _download_once(url, tmp, expected_size)
            tmp.replace(dest)
            return
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            last_err = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (401, 403, 404):
                break  # not retryable
            if attempt < RETRIES:
                wait = BACKOFF_BASE ** (attempt + 1)
                log(f"      retry {attempt + 1}/{RETRIES} in {wait:.0f}s ({exc})")
                time.sleep(wait)
    raise RuntimeError(f"download failed: {url}: {last_err}")


def _download_once(url: str, tmp: Path, expected_size: int | None) -> None:
    resume_from = tmp.stat().st_size if tmp.exists() else 0
    headers = {"User-Agent": USER_AGENT}
    if resume_from:
        headers["Range"] = f"bytes={resume_from}-"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        status = resp.status
        if resume_from and status != 206:
            resume_from = 0  # server ignored Range; start over
        total = resp.headers.get("Content-Length")
        total = int(total) + resume_from if total else expected_size
        mode = "ab" if resume_from else "wb"
        done = resume_from
        t0 = time.time()
        last_print = t0
        with tmp.open(mode) as out:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                done += len(chunk)
                now = time.time()
                if now - last_print > 2 and total and total > (8 << 20):
                    pct = 100.0 * done / total
                    rate = (done - resume_from) / max(now - t0, 1e-6)
                    log(f"      {pct:5.1f}%  {human(done)} / {human(total)}  ({human(int(rate))}/s)")
                    last_print = now


# ----------------------------------------------------------------------------
# archive extraction
# ----------------------------------------------------------------------------
def extract_archive(archive: Path, kind: str, out_dir: Path) -> None:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)
    if kind == "zip":
        with zipfile.ZipFile(archive) as zf:
            for member in zf.infolist():
                target = (out_dir / member.filename).resolve()
                if not str(target).startswith(str(out_dir.resolve())):
                    raise RuntimeError(f"unsafe path in archive: {member.filename}")
            zf.extractall(out_dir)
    elif kind == "tar":
        with tarfile.open(archive) as tf:
            for member in tf.getmembers():
                target = (out_dir / member.name).resolve()
                if not str(target).startswith(str(out_dir.resolve())):
                    raise RuntimeError(f"unsafe path in archive: {member.name}")
            if hasattr(tarfile, "data_filter"):
                tf.extractall(out_dir, filter="data")
            else:  # pragma: no cover - python < 3.12
                tf.extractall(out_dir)
    else:
        raise RuntimeError(f"unknown extract kind {kind!r}")


# ----------------------------------------------------------------------------
# per-file logic
# ----------------------------------------------------------------------------
class Stats:
    def __init__(self) -> None:
        self.downloaded_bytes = 0
        self.downloaded_files = 0
        self.skipped = 0
        self.failed: list[str] = []
        self.verified_ok = 0
        self.verified_bad: list[str] = []
        self.missing: list[str] = []
        self.unhashed: list[str] = []


def file_is_complete(entry: dict, dest_root: Path) -> tuple[bool, str]:
    """Return (complete, reason) for a manifest file entry."""
    path = dest_root / entry["path"]
    extract = entry.get("extract")
    if extract:
        out_dir = extract_dir_for(path)
        if not out_dir.is_dir():
            return False, "not extracted"
        want = entry.get("extracted_sha256")
        if want:
            got, _, _ = tree_sha256(out_dir)
            return (got == want, "ok" if got == want else "extracted tree hash mismatch")
        return True, "present (no extracted_sha256 recorded)"
    if not path.is_file():
        return False, "missing"
    want = entry.get("sha256")
    if want:
        got = sha256_file(path)
        return (got == want, "ok" if got == want else "sha256 mismatch")
    if entry.get("volatile_archive"):
        return True, "present (volatile archive; contents verified via extracted_sha256)"
    return True, "present (no sha256 recorded)"


def fetch_file(entry: dict, dest_root: Path, stats: Stats, record: bool) -> None:
    path = dest_root / entry["path"]
    complete, reason = file_is_complete(entry, dest_root)
    if complete:
        log(f"    = {entry['path']}  ({reason})")
        stats.skipped += 1
        return
    if path.is_file() and reason == "sha256 mismatch":
        log(f"    ! {entry['path']}: {reason}; re-downloading")
        path.unlink()
    need_download = not path.is_file()
    if need_download:
        log(f"    > {entry['path']}  {human(entry.get('size'))}")
        download(entry["url"], path, entry.get("size"))
        stats.downloaded_bytes += path.stat().st_size
        stats.downloaded_files += 1
    got = sha256_file(path)
    want = entry.get("sha256")
    if want and got != want:
        path.unlink()
        raise RuntimeError(f"sha256 mismatch for {entry['path']}: expected {want}, got {got}")
    if not want and entry.get("volatile_archive"):
        pass  # server regenerates the archive per request; only extracted_sha256 is meaningful
    elif not want:
        if record:
            entry["sha256"] = got
            entry["size"] = path.stat().st_size
        else:
            stats.unhashed.append(entry["path"])
    if entry.get("extract"):
        out_dir = extract_dir_for(path)
        log(f"      extracting -> {out_dir.relative_to(dest_root)}/")
        extract_archive(path, entry["extract"], out_dir)
        tree, n, total = tree_sha256(out_dir)
        want_tree = entry.get("extracted_sha256")
        if want_tree and tree != want_tree:
            raise RuntimeError(f"extracted content hash mismatch for {entry['path']}")
        if not want_tree and record:
            entry["extracted_sha256"] = tree
            entry["extracted_files"] = n
            entry["extracted_bytes"] = total
        log(f"      {n} files, {human(total)}")


# ----------------------------------------------------------------------------
# selection / listing / SOURCES.md
# ----------------------------------------------------------------------------
def select(entries: list[dict], tiers: list[str] | None, ids: list[str]) -> list[dict]:
    if ids:
        by_id = {e["id"]: e for e in entries}
        missing = [i for i in ids if i not in by_id]
        if missing:
            sys.exit(f"unknown fixture id(s): {', '.join(missing)}. Use --list.")
        return [by_id[i] for i in ids]
    tiers = tiers or list(DEFAULT_TIERS)
    return [e for e in entries if e["tier"] in tiers and not e.get("optional")]


def list_manifest(entries: list[dict]) -> None:
    w = max(len(e["id"]) for e in entries)
    log(f"{'id':<{w}}  tier    kind       size       modality/format")
    for e in entries:
        size = sum((f.get("size") or 0) for f in e.get("files", [])) if e["kind"] == "download" else 0
        opt = " (optional: --fixture)" if e.get("optional") else ""
        log(f"{e['id']:<{w}}  {e['tier']:<6}  {e['kind']:<9}  {human(size) if size else '-':<9}  "
            f"{e.get('modality', '')} / {e.get('format', '')}{opt}")


def write_sources(dest_root: Path, fetched: list[dict]) -> None:
    dest_root.mkdir(parents=True, exist_ok=True)
    src = dest_root / "SOURCES.md"
    existing: dict[str, str] = {}
    if src.exists():
        # keep previously written sections, keyed by fixture id
        cur_id, buf = None, []
        for line in src.read_text().splitlines():
            if line.startswith("## "):
                if cur_id:
                    existing[cur_id] = "\n".join(buf).rstrip()
                cur_id, buf = line[3:].strip(), [line]
            elif cur_id:
                buf.append(line)
        if cur_id:
            existing[cur_id] = "\n".join(buf).rstrip()
    for e in fetched:
        lines = [f"## {e['id']}", "",
                 f"- **What:** {e.get('description', '')}",
                 f"- **Licence:** {e.get('license', '')}",
                 f"- **Citation:** {e.get('citation', '')}"]
        for f in e.get("files", []):
            lines.append(f"- `{f['path']}` <- {f['url']}")
        existing[e["id"]] = "\n".join(lines)
    header = ("# Sample data sources\n\n"
              "This directory is gitignored; nothing here is committed. Every fixture is a\n"
              "public, de-identified dataset. You are responsible for complying with each\n"
              "dataset's licence and citation terms listed below. Written by\n"
              "`scripts/sample-data/fetch.py`; see `scripts/sample-data/manifest.json`.\n")
    body = "\n\n".join(existing[k] for k in sorted(existing))
    src.write_text(header + "\n" + body + "\n")
    log(f"wrote {src}")


def print_manual(e: dict) -> None:
    log(f"  [manual] {e['id']} ({e['tier']}): {e.get('description', '')}")
    log(f"      licence: {e.get('license', '')}")
    for line in (e.get("instructions") or "").strip().splitlines():
        log(f"      {line}")
    if e.get("dicomweb"):
        log(f"      DICOMweb: {json.dumps(e['dicomweb'])}")


# ----------------------------------------------------------------------------
# Orthanc upload
# ----------------------------------------------------------------------------
def looks_like_dicom(path: Path) -> bool:
    try:
        with path.open("rb") as fh:
            fh.seek(128)
            return fh.read(4) == b"DICM"
    except OSError:
        return False


def upload_to_orthanc(base_url: str, dest_root: Path, only: list[dict] | None) -> None:
    base_url = base_url.rstrip("/")
    headers = {"Content-Type": "application/dicom", "User-Agent": USER_AGENT}
    auth = os.environ.get("ORTHANC_AUTH")
    if auth:
        headers["Authorization"] = "Basic " + base64.b64encode(auth.encode()).decode()
    roots: list[Path] = []
    if only:
        for e in only:
            for f in e.get("files", []):
                p = dest_root / f["path"]
                roots.append(extract_dir_for(p) if f.get("extract") else p)
            if e["kind"] == "synthetic":
                roots.append(dest_root / "synth" / e["id"])
    else:
        roots.append(dest_root)
    files: list[Path] = []
    for r in roots:
        if r.is_file():
            files.append(r)
        elif r.is_dir():
            files.extend(p for p in sorted(r.rglob("*")) if p.is_file())
    files = [p for p in files if p.suffix.lower() == ".dcm" or looks_like_dicom(p)]
    files = [p for p in files if looks_like_dicom(p)]
    if not files:
        log("no DICOM files to upload")
        return
    log(f"uploading {len(files)} DICOM files to {base_url}/instances")
    ok = fail = 0
    for p in files:
        req = urllib.request.Request(f"{base_url}/instances", data=p.read_bytes(), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                resp.read()
            ok += 1
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
            fail += 1
            if fail <= 5:
                log(f"    upload failed: {p.relative_to(dest_root)}: {exc}")
    log(f"uploaded {ok}, failed {fail}")


# ----------------------------------------------------------------------------
# main
# ----------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tier", action="append", choices=["P0", "P1", "P2", "corpus"],
                    help="tier(s) to fetch (default: P0 + corpus); repeatable")
    ap.add_argument("--fixture", action="append", default=[], metavar="ID",
                    help="fetch only this fixture id (repeatable; also enables optional/large fixtures)")
    ap.add_argument("--list", action="store_true", help="list manifest entries and exit")
    ap.add_argument("--verify", action="store_true", help="verify sha256 of present files; no downloads")
    ap.add_argument("--upload-to-orthanc", metavar="URL",
                    help="POST every .dcm file under sample-data/ to URL/instances (ORTHANC_AUTH=user:pass for basic auth)")
    ap.add_argument("--dest", type=Path, default=DEFAULT_DEST, help=f"output directory (default {DEFAULT_DEST})")
    ap.add_argument("--record-hashes", action="store_true",
                    help="maintainer: write sha256/size of newly fetched files back into manifest.json")
    args = ap.parse_args(argv)

    entries = load_manifest()
    if args.list:
        list_manifest(entries)
        return 0

    dest_root: Path = args.dest
    selected = select(entries, args.tier, args.fixture)
    stats = Stats()

    if args.verify:
        for e in selected if (args.tier or args.fixture) else entries:
            if e["kind"] != "download":
                continue
            for f in e.get("files", []):
                path = dest_root / f["path"]
                present = (extract_dir_for(path).is_dir() if f.get("extract") else path.is_file())
                if not present:
                    stats.missing.append(f["path"])
                    continue
                ok, reason = file_is_complete(f, dest_root)
                if ok and reason == "ok":
                    stats.verified_ok += 1
                elif ok:
                    stats.unhashed.append(f["path"])
                else:
                    stats.verified_bad.append(f"{f['path']}: {reason}")
        log(f"verified ok: {stats.verified_ok}")
        log(f"present but no hash recorded: {len(stats.unhashed)}")
        for p in stats.unhashed:
            log(f"    {p}")
        log(f"missing (not fetched): {len(stats.missing)}")
        log(f"BAD: {len(stats.verified_bad)}")
        for p in stats.verified_bad:
            log(f"    {p}")
        return 1 if stats.verified_bad else 0

    if args.upload_to_orthanc and not (args.tier or args.fixture):
        upload_to_orthanc(args.upload_to_orthanc, dest_root, None)
        return 0

    fetched: list[dict] = []
    for e in selected:
        kind = e["kind"]
        if kind == "manual":
            print_manual(e)
            continue
        if kind == "synthetic":
            log(f"  [synthetic] {e['id']}: generated by `python3 {e.get('generator', 'scripts/sample-data/synth.py')}`")
            continue
        log(f"  [{e['tier']}] {e['id']}: {e.get('description', '')}")
        log(f"      licence: {e.get('license', '')}")
        try:
            for f in e.get("files", []):
                fetch_file(f, dest_root, stats, args.record_hashes)
            fetched.append(e)
        except Exception as exc:  # noqa: BLE001 - report and continue with next fixture
            stats.failed.append(f"{e['id']}: {exc}")
            log(f"    FAILED: {exc}")

    if fetched:
        write_sources(dest_root, fetched)
    if args.record_hashes:
        save_manifest(entries)
        log(f"updated {MANIFEST}")

    log("")
    log(f"downloaded {stats.downloaded_files} files, {human(stats.downloaded_bytes)}; "
        f"skipped {stats.skipped} already-present files")
    if stats.unhashed:
        log(f"no sha256 recorded for {len(stats.unhashed)} file(s) (maintainers: --record-hashes)")
    if stats.failed:
        log("FAILED:")
        for f in stats.failed:
            log(f"    {f}")
    if args.upload_to_orthanc:
        upload_to_orthanc(args.upload_to_orthanc, dest_root, selected)
    return 1 if stats.failed else 0


if __name__ == "__main__":
    sys.exit(main())
