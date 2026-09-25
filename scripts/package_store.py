"""Build a Chrome Web Store ZIP with manifest.json at the archive root."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
runtime_files = {
    "manifest.json",
    "background.js",
    "content.js",
    "preview.html",
    "preview.css",
    "preview.js",
    "sandbox.html",
    "sandbox.js",
    *manifest["icons"].values(),
}
missing = sorted(path for path in runtime_files if not (ROOT / path).is_file())
if missing:
    raise SystemExit(f"Missing extension files: {', '.join(missing)}")

output = ROOT / "dist" / f"github-html-preview-store-v{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for path in sorted(runtime_files):
        archive.write(ROOT / path, arcname=path)
print(output)
