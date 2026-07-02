import hashlib
import json
import logging
import os
import shutil
from datetime import datetime

logger = logging.getLogger(__name__)

CACHE_DIR = "/code/predictions"
CACHE_INDEX = os.path.join(CACHE_DIR, "cache_index.json")


def _cache_key(image_id: str, model: str) -> str:
    return hashlib.sha256(f"{image_id}__{model}".encode()).hexdigest()


def _load_index() -> dict:
    if os.path.exists(CACHE_INDEX):
        try:
            with open(CACHE_INDEX, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            logger.warning("Corrupt cache index, starting fresh")
    return {}


def _save_index(index: dict):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(CACHE_INDEX, "w") as f:
        json.dump(index, f, indent=2)


def get_cached(image_id: str, model: str):
    key = _cache_key(image_id, model)
    index = _load_index()
    entry = index.get(key)
    if entry and os.path.exists(entry["file"]):
        logger.info(f"Cache HIT: {model} on {image_id}")
        return entry
    return None


def store_cached(image_id: str, model: str, result_file: str, result_params: dict) -> str:
    key = _cache_key(image_id, model)
    dest = os.path.join(CACHE_DIR, f"{key}.nii.gz")
    os.makedirs(CACHE_DIR, exist_ok=True)
    if result_file != dest:
        shutil.copy2(result_file, dest)
    index = _load_index()
    index[key] = {
        "image_id": image_id,
        "model": model,
        "created": datetime.now().isoformat(),
        "result_params": result_params,
        "file": dest,
    }
    _save_index(index)
    logger.info(f"Cache STORE: {model} on {image_id} -> {dest}")
    return dest
