"""Precompress only native-selected startup JS; retain exact executable bytes."""
import gzip
from importlib.metadata import version
import json
from pathlib import Path
import sys
import zopfli.gzip

if version("zopfli") != "0.4.3":
    raise RuntimeError("Install the pinned, hash-checked CI-only compression tool")
root = Path(sys.argv[1]).resolve(strict=True)
saved, changed = 0, 0
for name in sys.argv[2:]:
    source = (root / name).resolve(strict=True)
    if not source.is_relative_to(root) or source.suffix != ".js":
        raise RuntimeError("Invalid native startup asset")
    body = source.read_bytes()
    sidecar = Path(str(source) + ".gz")
    previous = sidecar.read_bytes()
    candidate = zopfli.gzip.compress(body, numiterations=15)
    if gzip.decompress(previous) != body or gzip.decompress(candidate) != body:
        raise RuntimeError("Startup sidecar changed executable bytes")
    if len(candidate) < len(previous):
        sidecar.write_bytes(candidate)
        saved += len(previous) - len(candidate)
        changed += 1
print(json.dumps({"startupCompression": "zopfli-0.4.3", "changedAssets": changed, "savedBytes": saved, "decodedBytesVerified": True}))
