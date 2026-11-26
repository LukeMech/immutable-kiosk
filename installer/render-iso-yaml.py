"""installer/iso.yaml -> /usr/lib/image-builder/bootc/iso.yaml, with @KARGS@
replaced by the image's own kernel arguments (/usr/lib/bootc/kargs.d/*.toml,
the variant's included): the installer boots like the installed system --
quiet, Plymouth's splash, panel orientation, i915 and TPM settings.

Usage (inside the installer image): python3 render-iso-yaml.py <iso.yaml> <out>
"""

import sys
import tomllib
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
kargs = []
for f in sorted(Path("/usr/lib/bootc/kargs.d").glob("*.toml")):
    with open(f, "rb") as fh:
        for a in tomllib.load(fh).get("kargs", []):
            if a not in kargs:
                kargs.append(a)
text = src.read_text()
if "@KARGS@" not in text:
    sys.exit(f"{src}: no @KARGS@ to fill in")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(text.replace("@KARGS@", " ".join(kargs)))
print(out.read_text(), end="")
