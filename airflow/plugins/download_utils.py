"""
Utilitaire de téléchargement atomique pour les DAGs Airflow.
"""

from __future__ import annotations

import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

USER_AGENT = "airflow-homepedia"
_PROGRESS_EVERY_BYTES = 50 * 1024 * 1024  # log toutes les ~50 Mo


def _copy_with_progress(response, fh, label: str) -> None:
    chunk_size = 1024 * 1024
    downloaded = 0
    next_log = _PROGRESS_EVERY_BYTES

    while True:
        chunk = response.read(chunk_size)
        if not chunk:
            break
        fh.write(chunk)
        downloaded += len(chunk)
        if downloaded >= next_log:
            print(f"  {label}: {downloaded / (1024 * 1024):.0f} Mo…", flush=True)
            next_log += _PROGRESS_EVERY_BYTES


def download_to_path(
    url: str,
    target: str,
    *,
    timeout: int = 3600,
    skip_if_exists: bool = True,
    not_found_ok: bool = False,
) -> bool:
    """
    Télécharge url vers target via un fichier .part (rename atomique).
    Ne fait rien si target existe déjà (skip_if_exists=True).
    Retourne False si not_found_ok et HTTP 404, sinon True.
    """
    target_dir = os.path.dirname(target)
    if target_dir:
        os.makedirs(target_dir, mode=0o775, exist_ok=True)

    if skip_if_exists and os.path.isfile(target) and os.path.getsize(target) > 0:
        size_mb = os.path.getsize(target) / (1024 * 1024)
        print(f"Already present, skip download: {target} ({size_mb:.2f} MB)")
        return True

    tmp = f"{target}.part"
    if os.path.exists(tmp):
        os.remove(tmp)

    label = os.path.basename(target)
    print(f"Downloading {label} …", flush=True)

    request = Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=timeout) as response:
            status = getattr(response, "status", None) or response.getcode()
            if status != 200:
                raise RuntimeError(f"Unexpected HTTP status {status} for {url}")

            with open(tmp, "wb") as fh:
                _copy_with_progress(response, fh, label)
                fh.flush()
                os.fsync(fh.fileno())
    except HTTPError as exc:
        if os.path.exists(tmp):
            os.remove(tmp)
        if not_found_ok and exc.code == 404:
            return False
        raise RuntimeError(f"Download failed for {url}: HTTP {exc.code}") from exc
    except (URLError, OSError, TimeoutError, RuntimeError) as exc:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise RuntimeError(f"Download failed for {url}: {exc}") from exc

    if not os.path.isfile(tmp):
        raise RuntimeError(f"Download incomplete for {url}: temp file missing ({tmp})")

    size = os.path.getsize(tmp)
    if size == 0:
        os.remove(tmp)
        raise RuntimeError(f"Download incomplete for {url}: empty file")

    try:
        os.replace(tmp, target)
    except OSError as exc:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise RuntimeError(f"Could not move {tmp} -> {target}: {exc}") from exc

    size_mb = os.path.getsize(target) / (1024 * 1024)
    print(f"Downloaded {url} -> {target} ({size_mb:.2f} MB)")
    return True
