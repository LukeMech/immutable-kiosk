"""Default screen rotation per device model, for kioskd -- the one thing it
needs from images/devices.toml at runtime (the file itself stays out of the
image). Only this variant's devices, matched on the DMI product name:

    /usr/lib/immutable-kiosk/default-rotation.json
    {"default": "landscape",
     "devices": [{"dmi_product": "HP Pro Tablet 408", "rotation": "landscape"}]}

Used until a rotation is set in Settings > Ekran.
"""

import json
import os
import tomllib
from pathlib import Path

DEVICES = "/ctx/images/devices.toml"
OUT = Path("/usr/lib/immutable-kiosk/default-rotation.json")
# kioskd's ROTATIONS
ROTATIONS = {"portrait", "landscape", "normal", "90", "180", "270"}

variant = os.environ["VARIANT"]
with open(DEVICES, "rb") as f:
    devices = tomllib.load(f)


def rotation(where, value):
    if value not in ROTATIONS:
        raise SystemExit(f"devices.toml [{where}]: rotation {value!r} is not one of {sorted(ROTATIONS)}")
    return value


table = {"default": rotation("default", devices.get("default", {}).get("rotation", "landscape")), "devices": []}
for key, dev in devices.items():
    if key == "default" or not isinstance(dev, dict) or dev.get("variant") != variant or "rotation" not in dev:
        continue
    if not dev.get("dmi_product"):
        raise SystemExit(f"devices.toml [{key}]: a rotation needs dmi_product to match the device by")
    table["devices"].append({"dmi_product": dev["dmi_product"], "rotation": rotation(key, dev["rotation"])})

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(table, indent=2) + "\n")
print(OUT.read_text(), end="")
