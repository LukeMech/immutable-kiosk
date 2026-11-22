"""Kernel argument video=<connector>:panel_orientation=<...> from devices.toml,
for every device of this variant that sets panel_connector and
panel_orientation. It sets the DRM connector's "panel orientation", which
Plymouth (the boot splash) and the kernel console rotate by.

The image is per variant, not per device: two devices disagreeing about the
same connector fail the build. A connector a device doesn't have is ignored
by the kernel, so devices with other panels are unaffected.

simpledrm (the firmware's framebuffer, before the GPU driver is up) has one
connector, "Unknown-1": it gets the orientation too when all devices agree,
so the splash shows upright from the start of the initramfs.
"""

import tomllib

DEVICES = "/ctx/images/devices.toml"   # the build context; not in the image
OUT = "/usr/lib/bootc/kargs.d/31-panel-orientation.toml"
VARIANT = "x86"
ORIENTATIONS = {"normal", "upside_down", "left_side_up", "right_side_up"}

with open(DEVICES, "rb") as f:
    devices = tomllib.load(f)

args = {}
for key, dev in devices.items():
    if not isinstance(dev, dict) or dev.get("variant") != VARIANT or "panel_orientation" not in dev:
        continue
    conn, orient = dev.get("panel_connector"), dev["panel_orientation"]
    if not conn or orient not in ORIENTATIONS:
        raise SystemExit(f"devices.toml [{key}]: needs panel_connector and a panel_orientation of {sorted(ORIENTATIONS)}")
    if args.get(conn, orient) != orient:
        raise SystemExit(f"devices.toml: {conn} is {args[conn]} on one device and {orient} on [{key}]")
    args[conn] = orient

if len(set(args.values())) == 1:
    args["Unknown-1"] = next(iter(args.values()))
kargs = ", ".join(f'"video={c}:panel_orientation={o}"' for c, o in sorted(args.items()))
with open(OUT, "w") as f:
    f.write("# Generated from devices.toml by images/x86/build_files/20-panel-orientation.py.\n")
    f.write(f"kargs = [{kargs}]\n")
print(open(OUT).read(), end="")
