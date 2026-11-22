"""The start-up progress bar, drawn once for both places it runs:

  plymouth  immutable-kiosk.script plus the bar's pieces and the stage
      labels as PNGs: the bar fills as systemd starts the units each stage
      waits for (systemd tells plymouth every unit it starts), the label
      names the stage;
  kiosk-splash (in cage)  splash-bar.json: the same bar, colours and label,
      continuing from the hand-over ("Starting the kiosk…", 80 %).

The labels are rendered here with Pango, so plymouth and kiosk-splash show
the same pixels (plymouth draws no text of its own).
"""

import base64
import json
import math
import os
import struct
import zlib

import cairo
import gi

gi.require_version("Pango", "1.0")
gi.require_version("PangoCairo", "1.0")
from gi.repository import Pango, PangoCairo  # noqa: E402

THEME = "/usr/share/plymouth/themes/immutable-kiosk"
DATA = "/usr/share/immutable-kiosk/splash-bar.json"

TRACK = (39, 50, 65)            # Settings' #273241
FILL = (47, 129, 247)           # its default accent
TEXT = (154, 167, 180)          # its muted text
BAR_H, CAP = 6, 3               # bar height; its round ends, px
BAR_FRAC, BAR_MAX = 0.42, 520   # bar width: share of the screen, at most px
GAP = 22                        # bar to label, px
FONT, FONT_PX = "Noto Sans", 17

# (fraction, label, units whose start reaches it). Unit names as systemd
# sends them to plymouth; the order a boot reaches them in. Between stages
# the bar creeps on towards the next one.
STAGES = [
    (0.00, "Starting…", []),
    (0.10, "Detecting hardware…", ["systemd-udev-trigger.service", "systemd-udevd.service"]),
    (0.16, "Looking for the system disk…", ["dracut-initqueue.service"]),
    (0.30, "Mounting the system…", ["ostree-prepare-root.service", "sysroot.mount"]),
    (0.38, "Switching to the system…", ["initrd-switch-root.service", "initrd-cleanup.service"]),
    (0.46, "Preparing the system…", ["systemd-remount-fs.service", "kmod-static-nodes.service",
                                    "systemd-tmpfiles-setup-dev-early.service"]),
    (0.56, "Mounting file systems…", ["systemd-tmpfiles-setup-dev.service"]),
    (0.66, "Setting up the system…", ["systemd-tmpfiles-setup.service"]),
    (0.70, "Starting services…", ["dbus-broker.service", "systemd-logind.service"]),
    (0.74, "Starting the network…", ["NetworkManager.service"]),
    (0.80, "Starting the kiosk…", ["immutable-kiosk-backend.service", "handover"]),
]
OTHER = {"shutdown": "Shutting down…", "reboot": "Restarting…"}
HANDOVER = STAGES[-1][0]
END, TAU = 0.97, 6.0            # kiosk-splash: creeps towards END, time constant s


def png(path, w, h, rgba):
    """rgba: w*h (r, g, b, a) tuples, straight alpha 0..255."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw += bytes(rgba[y * w + x])
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
                + chunk(b"IEND", b""))


def cap_alpha(right):
    """Coverage of a half disc of diameter BAR_H, CAP x BAR_H px (4x4 samples)."""
    r = BAR_H / 2
    cx = 0.0 if right else CAP
    out = []
    for y in range(BAR_H):
        for x in range(CAP):
            n = sum(1 for sy in range(4) for sx in range(4)
                    if math.hypot(x + (sx + 0.5) / 4 - cx, y + (sy + 0.5) / 4 - r) <= r)
            out.append(n / 16)
    return out


def over(fg, a, bg):
    """fg colour at coverage a over an opaque bg colour."""
    return tuple(round(fg[i] * a + bg[i] * (1 - a)) for i in range(3))


def bgrx(colours):
    return base64.b64encode(b"".join(bytes((b, g, r, 255)) for r, g, b in colours)).decode()


def label(text):
    """(w, h, coverage 0..1 list) of `text` in FONT at FONT_PX, grey AA."""
    def layout_for(ctx):
        lay = PangoCairo.create_layout(ctx)
        fo = cairo.FontOptions()
        fo.set_antialias(cairo.ANTIALIAS_GRAY)
        fo.set_hint_style(cairo.HINT_STYLE_SLIGHT)
        PangoCairo.context_set_font_options(lay.get_context(), fo)
        lay.context_changed()
        fd = Pango.FontDescription.from_string(FONT)
        fd.set_absolute_size(FONT_PX * Pango.SCALE)
        lay.set_font_description(fd)
        lay.set_text(text, -1)
        return lay
    _, ext = layout_for(cairo.Context(cairo.ImageSurface(cairo.FORMAT_ARGB32, 1, 1))).get_pixel_extents()
    w, h = ext.width + 2, ext.height + 2
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, w, h)
    ctx = cairo.Context(surf)
    lay = layout_for(ctx)
    ctx.set_source_rgb(1, 1, 1)
    ctx.move_to(1 - ext.x, 1 - ext.y)
    PangoCairo.show_layout(ctx, lay)
    surf.flush()
    data, stride = bytes(surf.get_data()), surf.get_stride()
    # White text, premultiplied: any channel is the coverage (BGRA, little-endian).
    return w, h, [data[y * stride + x * 4 + 3] / 255 for y in range(h) for x in range(w)]


# ---- plymouth's images

os.makedirs(THEME, exist_ok=True)
for old in os.listdir(THEME):
    if old.endswith(".png"):
        os.remove(f"{THEME}/{old}")

left, right = cap_alpha(False), cap_alpha(True)
for name, col in (("track", TRACK), ("fill", FILL)):
    png(f"{THEME}/{name}-l.png", CAP, BAR_H, [(*col, round(255 * a)) for a in left])
    png(f"{THEME}/{name}-r.png", CAP, BAR_H, [(*col, round(255 * a)) for a in right])
    png(f"{THEME}/{name}-m.png", 1, BAR_H, [(*col, 255)] * BAR_H)

labels = {}
for i, (_, text, _) in enumerate(STAGES):
    labels[f"label-{i}"] = label(text)
for mode, text in OTHER.items():
    labels[f"label-{mode}"] = label(text)
for name, (w, h, cov) in labels.items():
    png(f"{THEME}/{name}.png", w, h, [(*TEXT, round(255 * a)) for a in cov])


# ---- plymouth's script

def num(v):
    return f"{v:.4f}".rstrip("0").rstrip(".")


stage_of = "\n".join(f'    if (s == "{u}") return {i};'
                     for i, (_, _, units) in enumerate(STAGES) for u in units)
arrays = "\n".join(f'sf[{i}] = {num(f)}; lab[{i}] = Image("label-{i}.png");'
                   for i, (f, _, _) in enumerate(STAGES))

SCRIPT = f"""# immutable-kiosk boot splash: a progress bar with the boot's stage under
# it. Generated by build_files/16-plymouth-images.py (kiosk-splash draws the
# same bar from the hand-over on). systemd sends every unit it starts as a
# status update; the units listed in stage_of move the bar to their stage,
# and between stages it creeps on towards the next one. On "handover"
# (kioskd's unit, before cage's deactivates plymouth) it settles at
# {num(HANDOVER)} -- where kiosk-splash continues.
Window.SetBackgroundTopColor(0, 0, 0);
Window.SetBackgroundBottomColor(0, 0, 0);

W = Window.GetWidth();
H = Window.GetHeight();
X = Window.GetX();
Y = Window.GetY();
CAP = {CAP};
BW = Math.Int(Math.Min(W * {BAR_FRAC}, {BAR_MAX}) / 2) * 2;
BX = X + Math.Int((W - BW) / 2);
BY = Y + Math.Int(H / 2) - {BAR_H // 2};
LY = BY + {BAR_H + GAP};
N = {len(STAGES)};
{arrays}

mode = Plymouth.GetMode();
other = (mode == "shutdown" || mode == "reboot");

# Globals only: a variable first set inside a function is local to it.
t = 0;
stage = 0;
target = 0;
shown = 0;
handover = 0;
last_fw = -1;

label_s = Sprite();
label_s.SetOpacity(0);
fun show_label (img, y)
{{
    label_s.SetImage(img);
    label_s.SetPosition(X + Math.Int((W - img.GetWidth()) / 2), y, 3);
}}

tl = Sprite(Image("track-l.png"));
tm = Sprite(Image("track-m.png").Scale(BW - 2 * CAP, {BAR_H}));
tr = Sprite(Image("track-r.png"));
fl = Sprite(Image("fill-l.png"));
fm_img = Image("fill-m.png");
fm = Sprite();
fr = Sprite(Image("fill-r.png"));
tl.SetPosition(BX, BY, 1);
tm.SetPosition(BX + CAP, BY, 1);
tr.SetPosition(BX + BW - CAP, BY, 1);
fl.SetPosition(BX, BY, 2);
fr.SetPosition(BX + CAP, BY, 2);
tl.SetOpacity(0); tm.SetOpacity(0); tr.SetOpacity(0);
fl.SetOpacity(0); fr.SetOpacity(0);

if (other)
{{
    if (mode == "reboot")
        show_label(Image("label-reboot.png"), Y + Math.Int(H / 2) - 10);
    else
        show_label(Image("label-shutdown.png"), Y + Math.Int(H / 2) - 10);
}}
else
    show_label(lab[0], LY);

fun stage_of (s)
{{
{stage_of}
    return -1;
}}

fun status_callback (status)
{{
    k = stage_of(status);
    if (k > stage)
    {{
        stage = k;
        if (sf[k] > target)
            target = sf[k];
        if (!other)
            show_label(lab[k], LY);
    }}
    if (status == "handover")
        handover = 1;
}}
Plymouth.SetUpdateStatusFunction(status_callback);

fun refresh_callback ()
{{
    t = t + 1;
    # Fades in over the first half second (and stays put after).
    if (t <= 25)
    {{
        level = t / 25;
        label_s.SetOpacity(level);
        bar = level;
        if (other)
            bar = 0;
        tl.SetOpacity(bar); tm.SetOpacity(bar); tr.SetOpacity(bar);
        fl.SetOpacity(bar); fm.SetOpacity(bar); fr.SetOpacity(bar);
    }}
    if (!other)
    {{
        if (handover == 0 && stage < N - 1)
            target = target + (sf[stage + 1] - 0.005 - target) * 0.004;
        shown = shown + (target - shown) * 0.1;
        if ((target - shown) * (target - shown) < 0.000001)
            shown = target;
        fw = 2 * CAP + Math.Int((BW - 2 * CAP) * shown);
        if (fw != last_fw)
        {{
            last_fw = fw;
            if (fw > 2 * CAP)
            {{
                fm.SetImage(fm_img.Scale(fw - 2 * CAP, {BAR_H}));
                fm.SetPosition(BX + CAP, BY, 2);
            }}
            fr.SetPosition(BX + fw - CAP, BY, 2);
        }}
    }}
}}
Plymouth.SetRefreshFunction(refresh_callback);
"""
with open(f"{THEME}/immutable-kiosk.script", "w") as f:
    f.write(SCRIPT)

# ---- kiosk-splash's data: the same pieces composited as plymouth draws them
# (on black; the fill's ends over the track), as XRGB8888 rows.

black = (0, 0, 0)
track_l = [over(TRACK, a, black) for a in left]
track_r = [over(TRACK, a, black) for a in right]
fill_l = [over(FILL, a, track_l[i]) for i, a in enumerate(left)]
fill_r = [over(FILL, a, TRACK) for a in right]
w, h, cov = labels[f"label-{len(STAGES) - 1}"]
os.makedirs(os.path.dirname(DATA), exist_ok=True)
with open(DATA, "w") as f:
    json.dump({
        "bar": {"h": BAR_H, "cap": CAP, "frac": BAR_FRAC, "max": BAR_MAX, "gap": GAP},
        "track": {"l": bgrx(track_l), "r": bgrx(track_r), "m": list(TRACK)},
        "fill": {"l": bgrx(fill_l), "r": bgrx(fill_r), "m": list(FILL)},
        "label": {"w": w, "h": h, "bgrx": bgrx([over(TEXT, a, black) for a in cov])},
        "start": HANDOVER, "end": END, "tau": TAU,
    }, f, separators=(",", ":"))
print(f"bar pieces, {len(labels)} labels and immutable-kiosk.script in {THEME}; {DATA}")
