"""The boot screen's progress bar, drawn once for both places it runs:

  plymouth  immutable-kiosk.script plus the bar's pieces and the labels as
      PNGs. Booting, the bar fills as systemd starts the units each stage
      waits for (systemd tells plymouth every unit it starts) and the label
      names the stage; shutting down or restarting it runs a loading
      animation; installing an update (plymouth's "updates" mode, set by
      immutable-kiosk-update-splash.service) it fills slowly.
  kiosk-splash (in cage)  splash-bar.json: the same bar, colours and label,
      continuing from the hand-over ("Starting the kiosk…", 80 %).

The labels are rendered here with Pango in English and Polish, so plymouth
and kiosk-splash show the same pixels. Plymouth can't read the settings:
kioskd leaves the accent's bar pieces and a language marker in
/etc/immutable-kiosk/splash (and in an extra initramfs on /boot, for the
boot), which the script loads instead of its own when they're there.
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
OVERRIDES = "/etc/immutable-kiosk/splash"   # kioskd's: accent pieces, language marker

TRACK = (39, 50, 65)            # Settings' #273241
# Settings' accent colours (app.js ACCENTS -- keep in step); blue is the theme's.
ACCENTS = {"blue": (47, 129, 247), "teal": (23, 162, 184), "green": (45, 164, 78),
           "purple": (137, 87, 229), "pink": (214, 64, 159), "orange": (225, 111, 36),
           "graphite": (110, 118, 129)}
FILL = ACCENTS["blue"]
TEXT = (154, 167, 180)          # Settings' muted text
BAR_H, CAP = 6, 3               # bar height; its round ends, px
BAR_FRAC, BAR_MAX = 0.42, 520   # bar width: share of the screen, at most px
GAP = 22                        # bar to label, px
FONT, FONT_PX = "Noto Sans", 17
LANGS = ("en", "pl")            # en is the theme's own; pl files are "pl-<name>"

# (fraction, labels, units whose start reaches it). Unit names as systemd
# sends them to plymouth, in the order a boot reaches them. The fractions
# follow the 408's timeline from when the splash shows (i915 up, ~8 s) to
# the hand-over (~20.5 s, 80 %); between stages the bar creeps on.
STAGES = [
    (0.00, ("Starting…", "Uruchamianie…"), []),
    (0.00, ("Detecting hardware…", "Wykrywanie sprzętu…"),
     ["systemd-udev-trigger.service", "systemd-udevd.service"]),
    (0.01, ("Looking for the system disk…", "Szukanie dysku systemowego…"), ["dracut-initqueue.service"]),
    (0.03, ("Mounting the system…", "Montowanie systemu…"), ["ostree-prepare-root.service", "sysroot.mount"]),
    (0.13, ("Switching to the system…", "Przełączanie na system…"),
     ["initrd-switch-root.service", "initrd-cleanup.service"]),
    (0.16, ("Preparing the system…", "Przygotowywanie systemu…"),
     ["systemd-remount-fs.service", "kmod-static-nodes.service", "systemd-tmpfiles-setup-dev-early.service"]),
    (0.48, ("Mounting file systems…", "Montowanie systemów plików…"), ["systemd-tmpfiles-setup-dev.service"]),
    (0.64, ("Setting up the system…", "Konfigurowanie systemu…"), ["systemd-tmpfiles-setup.service"]),
    (0.68, ("Starting services…", "Uruchamianie usług…"), ["dbus-broker.service", "systemd-logind.service"]),
    (0.71, ("Starting the network…", "Uruchamianie sieci…"), ["NetworkManager.service"]),
    (0.80, ("Starting the kiosk…", "Uruchamianie kiosku…"), ["immutable-kiosk-backend.service", "handover"]),
]
OTHER = {"shutdown": ("Shutting down…", "Wyłączanie…"),
         "reboot": ("Restarting…", "Ponowne uruchamianie…"),
         "updates": ("Installing the update…", "Instalowanie aktualizacji…")}
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


def alphas(cov):
    return base64.b64encode(bytes(round(255 * a) for a in cov)).decode()


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

labels = {}    # (lang, name) -> (w, h, coverage)
for li, lang in enumerate(LANGS):
    for i, (_, texts, _) in enumerate(STAGES):
        labels[lang, f"label-{i}"] = label(texts[li])
    for mode, texts in OTHER.items():
        labels[lang, f"label-{mode}"] = label(texts[li])
for (lang, name), (w, h, cov) in labels.items():
    prefix = "" if lang == "en" else f"{lang}-"
    png(f"{THEME}/{prefix}{name}.png", w, h, [(*TEXT, round(255 * a)) for a in cov])


# ---- plymouth's script

def num(v):
    return f"{v:.4f}".rstrip("0").rstrip(".")


# From ImageDir (THEME) up to / and down to OVERRIDES: Image() takes paths
# relative to ImageDir.
up = "/".join([".."] * THEME.strip("/").count("/")) + "/.."
etc = f"{up}{OVERRIDES}/"
stage_of = "\n".join(f'    if (s == "{u}") return {i};'
                     for i, (_, _, units) in enumerate(STAGES) for u in units)
arrays = "\n".join(f'sf[{i}] = {num(f)}; lab[{i}] = Image(pre + "label-{i}.png");'
                   for i, (f, _, _) in enumerate(STAGES))

SCRIPT = f"""# immutable-kiosk boot screen: a progress bar with a label under it.
# Generated by build_files/16-plymouth-images.py (kiosk-splash draws the same
# bar from the hand-over on).
#   boot: systemd sends every unit it starts as a status update; the units
#     in stage_of move the bar to their stage, and between stages it creeps
#     on towards the next one. On "handover" (kioskd's unit, before cage's
#     quits plymouth) it settles at {num(HANDOVER)} -- where kiosk-splash continues;
#   shutdown / reboot: a loading animation;
#   updates (immutable-kiosk-update-splash.service): fills slowly.
# kioskd's overrides (accent, language) come from {OVERRIDES}.
Window.SetBackgroundTopColor(0, 0, 0);
Window.SetBackgroundBottomColor(0, 0, 0);

ETC = "{etc}";
fun load (name)
{{
    i = Image(ETC + name);
    if (!i)
        i = Image(name);
    return i;
}}
pre = "";
if (Image(ETC + "lang-pl.png"))
    pre = "pl-";

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

# Globals only: a variable first set inside a function is local to it.
t = 0;
stage = 0;
target = 0;
shown = 0;
handover = 0;
kind = -1;
prog = 0;

label_s = Sprite();
label_s.SetOpacity(0);
fun show_label (img)
{{
    label_s.SetImage(img);
    label_s.SetPosition(X + Math.Int((W - img.GetWidth()) / 2), LY, 4);
}}

tl = Sprite(Image("track-l.png"));
tm = Sprite(Image("track-m.png").Scale(BW - 2 * CAP, {BAR_H}));
tr = Sprite(Image("track-r.png"));
fl = Sprite(load("fill-l.png"));
fm_img = load("fill-m.png");
fm = Sprite(fm_img);
fr = Sprite(load("fill-r.png"));
tl.SetPosition(BX, BY, 1);
tm.SetPosition(BX + CAP, BY, 1);
tr.SetPosition(BX + BW - CAP, BY, 1);
tl.SetOpacity(0); tm.SetOpacity(0); tr.SetOpacity(0);
fl.SetOpacity(0); fm.SetOpacity(0); fr.SetOpacity(0);

# The fill from x0 to x1, px into the bar (x1 - x0 at least two caps).
fun set_fill (x0, x1)
{{
    fl.SetPosition(BX + x0, BY, 3);
    fm.SetImage(fm_img.Scale(Math.Max(x1 - x0 - 2 * CAP, 1), {BAR_H}));
    fm.SetPosition(BX + x0 + CAP, BY, 2);
    fr.SetPosition(BX + x1 - CAP, BY, 3);
}}

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
        if (kind == 0)
            show_label(lab[k]);
    }}
    if (status == "handover")
        handover = 1;
}}
Plymouth.SetUpdateStatusFunction(status_callback);

fun refresh_callback ()
{{
    t = t + 1;
    # What the screen is for; the mode can change (to "updates") meanwhile.
    m = Plymouth.GetMode();
    k = 0;
    if (m == "shutdown" || m == "reboot")
        k = 1;
    if (m == "updates" || m == "system-upgrade")
        k = 2;
    if (k != kind)
    {{
        kind = k;
        if (kind == 0)
            show_label(lab[stage]);
        else if (m == "reboot")
            show_label(Image(pre + "label-reboot.png"));
        else if (m == "shutdown")
            show_label(Image(pre + "label-shutdown.png"));
        else
            show_label(Image(pre + "label-updates.png"));
    }}
    # Fades in over the first half second.
    if (t <= 25)
    {{
        level = t / 25;
        label_s.SetOpacity(level);
        tl.SetOpacity(level); tm.SetOpacity(level); tr.SetOpacity(level);
        fl.SetOpacity(level); fm.SetOpacity(level); fr.SetOpacity(level);
    }}
    if (kind == 1)
    {{
        # Loading: a segment sliding through the bar.
        seg = Math.Int(BW * 0.3);
        q = t * 6;
        p = q - Math.Int(q / (BW + seg)) * (BW + seg) - seg;
        x0 = Math.Max(p, 0);
        x1 = Math.Min(p + seg, BW);
        if (x1 - x0 < 2 * CAP)
        {{
            if (x0 > BW / 2)
                x0 = BW - 2 * CAP;
            x1 = x0 + 2 * CAP;
        }}
        set_fill(x0, x1);
    }}
    else
    {{
        if (kind == 2)
        {{
            prog = prog + (0.95 - prog) * 0.002;
            shown = prog;
        }}
        else
        {{
            if (handover == 0 && stage < N - 1)
                target = target + (sf[stage + 1] - 0.005 - target) * 0.004;
            # Towards the target smoothly, at most 0.25 of the bar a second.
            shown = shown + Math.Min((target - shown) * 0.05, 0.005);
            if ((target - shown) * (target - shown) < 0.000001)
                shown = target;
        }}
        set_fill(0, 2 * CAP + Math.Int((BW - 2 * CAP) * shown));
    }}
}}
Plymouth.SetRefreshFunction(refresh_callback);
"""
with open(f"{THEME}/immutable-kiosk.script", "w") as f:
    f.write(SCRIPT)

# ---- kiosk-splash's (and kioskd's) data: coverages and colours; they
# composite the pieces as plymouth draws them, in the chosen accent.

os.makedirs(os.path.dirname(DATA), exist_ok=True)
with open(DATA, "w") as f:
    json.dump({
        "bar": {"h": BAR_H, "cap": CAP, "frac": BAR_FRAC, "max": BAR_MAX, "gap": GAP},
        "track": list(TRACK), "text": list(TEXT),
        "cap_l": alphas(left), "cap_r": alphas(right),
        "labels": {lang: {"w": w, "h": h, "a": alphas(cov)}
                   for (lang, name), (w, h, cov) in labels.items() if name == f"label-{len(STAGES) - 1}"},
        "accents": {k: list(v) for k, v in ACCENTS.items()}, "default_accent": "blue",
        "overrides": OVERRIDES,
        "start": HANDOVER, "end": END, "tau": TAU,
    }, f, separators=(",", ":"))
print(f"bar pieces, {len(labels)} labels and immutable-kiosk.script in {THEME}; {DATA}")
