"""Kernel argument video=<connector>:panel_orientation=<...> for every device
of this variant with a panel_connector in devices.toml, from its rotation --
so the boot splash (Plymouth) and the kernel console are turned as the
screen from the first boot on. Afterwards kioskd rewrites the same argument
from the rotation in use (its PANEL_ORIENTATIONS, the same mapping), also
after a change in Settings.

The image is per variant, not per device: two devices disagreeing about the
same connector fail the build. A connector a device doesn't have is ignored
by the kernel, so devices with other panels are unaffected.
"""

import tomllib

DEVICES = "/ctx/images/devices.toml"   # the build context; not in the image
OUT = "/usr/lib/bootc/kargs.d/31-panel-orientation.toml"
VARIANT = "x86"
# kioskd's PANEL_ORIENTATIONS: wlr-randr transform -> DRM panel orientation.
ORIENTATIONS = {"normal": "normal", "90": "left_side_up", "180": "upside_down", "270": "right_side_up"}

with open(DEVICES, "rb") as f:
    devices = tomllib.load(f)

args = {}
for key, dev in devices.items():
    if not isinstance(dev, dict) or dev.get("variant") != VARIANT or "panel_connector" not in dev:
        continue
    if "panel_orientation" in dev:
        raise SystemExit(f"devices.toml [{key}]: panel_orientation is gone, it follows rotation now")
    conn, rotation = dev["panel_connector"], dev.get("rotation")
    if rotation not in ORIENTATIONS:
        raise SystemExit(f"devices.toml [{key}]: with panel_connector, rotation must be a transform "
                         f"({sorted(ORIENTATIONS)}), not {rotation!r}: the panel's native mode isn't known here")
    orient = ORIENTATIONS[rotation]
    if args.get(conn, orient) != orient:
        raise SystemExit(f"devices.toml: {conn} is {args[conn]} on one device and {orient} on [{key}]")
    args[conn] = orient

kargs = ", ".join(f'"video={c}:panel_orientation={o}"' for c, o in sorted(args.items()))
with open(OUT, "w") as f:
    f.write("# Generated from devices.toml by images/x86/build_files/20-panel-orientation.py.\n")
    f.write(f"kargs = [{kargs}]\n")
print(open(OUT).read(), end="")
