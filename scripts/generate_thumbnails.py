from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "images" / "part2"
DST_DIR = SRC_DIR / "thumbs"
MAX_WIDTH = 640
MAX_HEIGHT = 360
JPEG_QUALITY = 75
SUPPORTED_EXTS: Iterable[str] = (".jpg", ".jpeg", ".png", ".webp")


def should_process(src: Path, dst: Path) -> bool:
    if not dst.exists():
        return True
    return src.stat().st_mtime > dst.stat().st_mtime


def resize_image(src: Path, dst: Path) -> None:
    with Image.open(src) as im:
        im = im.convert("RGB")
        width, height = im.size
        scale = min(MAX_WIDTH / width, MAX_HEIGHT / height, 1.0)
        if scale < 1.0:
            new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
            resized = im.resize(new_size, Image.LANCZOS)
        else:
            resized = im
        dst.parent.mkdir(parents=True, exist_ok=True)
        resized.save(dst, format="JPEG", optimize=True, quality=JPEG_QUALITY)


def main() -> int:
    if not SRC_DIR.exists():
        print(f"Source directory not found: {SRC_DIR}", file=sys.stderr)
        return 1

    processed = 0
    skipped = 0

    for src in sorted(SRC_DIR.iterdir()):
        if src.is_dir() or src.suffix.lower() not in SUPPORTED_EXTS:
            continue
        dst = DST_DIR / (src.stem + ".jpg")
        if not should_process(src, dst):
            skipped += 1
            continue
        resize_image(src, dst)
        processed += 1
        print(f"Created thumbnail: {dst.relative_to(ROOT)}")

    print(f"Processed {processed} file(s), skipped {skipped}")
    return 0 if processed > 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
