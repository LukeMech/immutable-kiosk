"""The start-up animation, "embers", generated once for both places it runs
(no image tools in the build, standard library only):

  plymouth (theme dir)  ember-<colour>-<size>.png, bed.png and
      immutable-kiosk.script, with every ember's parameters written in;
  kiosk-splash (in cage)  /usr/share/immutable-kiosk/splash-embers.json,
      the same parameters and shapes, for its own renderer.

A fire over the whole screen: a glowing bed along the bottom edge,
flickering, and embers of three sizes rising from it, swaying, fading as
they climb. At the hand-over (`plymouth update --status=handover`) most
embers fly to their own point of the word WAIT, the rest go out, the bed
dims: that still is what's on the screen while the kiosk starts.
kiosk-splash starts from the same picture, holds it a moment, then lets
the word break up back into the fire.

Both sides compute the same thing: the word in screen pixels around the
centre, the fire as fractions of the screen, its clock in 50 Hz ticks
(plymouth's refresh rate).
"""

import json
import math
import os
import random
import struct
import zlib

THEME = "/usr/share/plymouth/themes/immutable-kiosk"
DATA = "/usr/share/immutable-kiosk/splash-embers.json"

COLORS = [(255, 214, 120), (255, 140, 40), (230, 62, 28)]     # yellow, orange, red
SIZES = [13, 23, 37]                                          # glow sizes, px (odd)
STEP = 13                                                     # word: px between embers
EXTRA = 50                                                    # fire-only embers
FORM_TICKS = 75                                               # hand-over: 1.5 s to form
# The cycle, in ticks: fire, gathering into the word, the word, breaking up.
FIRE, GATHER, HOLD, SCATTER = 250, 75, 25, 75
BED_W, BED_H = 320, 120                                       # the bed image (scaled to the width)
BED_SCREEN_H = 240                                            # its height on the screen


# ---- the word: block letters from line segments, sampled every STEP px

LETTER_W, LETTER_H, GAP = 130, 180, 50
GLYPHS = {
    "W": [((0, 0), (32, 180)), ((32, 180), (65, 75)), ((65, 75), (98, 180)), ((98, 180), (130, 0))],
    "A": [((0, 180), (65, 0)), ((65, 0), (130, 180)), ((30, 112), (100, 112))],
    "I": [((65, 0), (65, 180)), ((30, 0), (100, 0)), ((30, 180), (100, 180))],
    "T": [((0, 0), (130, 0)), ((65, 0), (65, 180))],
}


def word_points(word):
    pts = []
    total = len(word) * LETTER_W + (len(word) - 1) * GAP
    for k, ch in enumerate(word):
        ox = -total / 2 + k * (LETTER_W + GAP)
        for (x1, y1), (x2, y2) in GLYPHS[ch]:
            n = max(1, round(math.hypot(x2 - x1, y2 - y1) / STEP))
            for j in range(n + 1):
                x = ox + x1 + (x2 - x1) * j / n
                y = -LETTER_H / 2 + y1 + (y2 - y1) * j / n
                if all(math.hypot(x - px, y - py) > STEP * 0.7 for px, py in pts):
                    pts.append((round(x, 1), round(y, 1)))
    return pts


rnd = random.Random(2026)   # fixed: the same fire in every build
embers = []
for point in word_points("WAIT") + [None] * EXTRA:
    tx, ty = point or (0.0, 0.0)
    size = rnd.choice([0, 0, 0, 1, 1, 2])
    if point is not None:                         # a hand-drawn look, not a ruler's
        tx, ty = tx + rnd.uniform(-2.5, 2.5), ty + rnd.uniform(-2.5, 2.5)
    embers.append({
        "word": point is not None,                # part of the word, or goes out
        "tx": round(tx, 1), "ty": round(ty, 1),   # the word, px from the centre
        "dl": round(rnd.uniform(0, 0.45), 3),     # its flight starts this late (share)
        "kx": round(rnd.uniform(-220, 220), 1),   # its flight bends through here
        "ky": round(rnd.uniform(-160, 120), 1),   #   (px off the straight line's middle)
        "c": rnd.choice([0, 0, 1, 1, 1, 2]),      # colour
        "s": size,                                # size
        "x0": rnd.random(),                       # across the width (0..1)
        "sp": rnd.uniform(0.004, 0.009) * (1.25 - 0.2 * size),   # rise per tick (screen heights)
        "ph": rnd.random(),                       # where in its climb it starts
        "amp": rnd.uniform(10, 42),               # sway, px
        "fq": rnd.uniform(0.025, 0.07),           # sway speed, rad per tick
        "p2": rnd.uniform(0, 6.283),
    })


def glow_alpha(n, x, y):
    m = (n - 1) / 2
    d = math.hypot(x - m, y - m) / m
    return max(0.0, 1 - d) ** 2.0, max(0.0, 1 - d * 2.6) ** 2


def glow(c, n, x, y):
    """A sprite's colour and coverage: a soft round glow with a hot centre."""
    a, hot = glow_alpha(n, x, y)
    r, g, b = COLORS[c]
    return (min(255, round(r + (255 - r) * hot)), min(255, round(g + (255 - g) * hot)),
            min(255, round(b + (255 - b) * hot)), a)


def bed(x, y):
    """The bed's glow, BED_W x BED_H: brightest at the bottom edge, with a
    few soft tongues along it."""
    u, v = x / (BED_W - 1), y / (BED_H - 1)            # v: 0 top, 1 bottom
    tongues = 0.55 + 0.25 * math.sin(u * 19.0) + 0.2 * math.sin(u * 7.3 + 1.1)
    a = max(0.0, min(1.0, (v - (1 - 0.9 * tongues)) / (0.9 * tongues))) ** 1.6 * 0.85
    r, g, b = COLORS[1]
    return (r, round(g * (0.6 + 0.4 * (1 - v))), b, a)


def png(path, w, h, pixel):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            r, g, b, a = pixel(x, y)
            raw += bytes((r, g, b, round(255 * max(0.0, min(1.0, a)))))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
                + chunk(b"IEND", b""))


os.makedirs(THEME, exist_ok=True)
for c in range(len(COLORS)):
    for s, n in enumerate(SIZES):
        png(f"{THEME}/ember-{c}-{s}.png", n, n, lambda x, y, c=c, n=n: glow(c, n, x, y))
png(f"{THEME}/bed.png", BED_W, BED_H, bed)
for old in os.listdir(THEME):
    if old.endswith(".png") and not old.startswith(("ember-", "bed")) or old in ("ember-0.png", "ember-1.png", "ember-2.png"):
        os.remove(f"{THEME}/{old}")


# ---- plymouth's script

def num(v):
    return f"{v:.5f}".rstrip("0").rstrip(".") if isinstance(v, float) else str(v)


lines = [f"x0[{i}] = {num(e['x0'])}; sp[{i}] = {num(e['sp'])}; ph[{i}] = {num(e['ph'])}; "
         f"amp[{i}] = {num(e['amp'])}; fq[{i}] = {num(e['fq'])}; p2[{i}] = {num(e['p2'])}; "
         f"tx[{i}] = {num(float(e['tx']))}; ty[{i}] = {num(float(e['ty']))}; "
         f"dl[{i}] = {num(float(e['dl']))}; kx[{i}] = {num(float(e['kx']))}; ky[{i}] = {num(float(e['ky']))}; "
         f"wd[{i}] = {1 if e['word'] else 0}; im[{i}] = {e['c'] * len(SIZES) + e['s']}; "
         f"hf[{i}] = {SIZES[e['s']] // 2};"
         for i, e in enumerate(embers)]
images = "\n".join(f'img[{c * len(SIZES) + s}] = Image("ember-{c}-{s}.png");'
                   for c in range(len(COLORS)) for s in range(len(SIZES)))

SCRIPT = f"""# immutable-kiosk boot splash, "embers" -- generated by
# build_files/16-plymouth-images.py (kiosk-splash computes the same).
# {len(embers)} embers rise from a glowing bed; every {(FIRE + GATHER + HOLD + SCATTER) / 50:.1f} s they form the word
# WAIT. On "handover" they form it and stay while the kiosk starts.
Window.SetBackgroundTopColor(0, 0, 0);
Window.SetBackgroundBottomColor(0, 0, 0);

W = Window.GetWidth();
H = Window.GetHeight();
X = Window.GetX();
Y = Window.GetY();
N = {len(embers)};

{images}
bed = Image("bed.png").Scale(W, {BED_SCREEN_H});
bed_s = Sprite(bed);
bed_s.SetPosition(X, Y + H - {BED_SCREEN_H}, 0);
bed_s.SetOpacity(0);

{chr(10).join(lines)}
CYCLE = {FIRE + GATHER + HOLD + SCATTER};

# Globals only: a variable first set inside a function is local to it.
for (i = 0; i < N; i = i + 1)
{{
    s[i] = Sprite(img[im[i]]);
    s[i].SetOpacity(0);
    cx[i] = 0; cy[i] = 0; cb[i] = 0;
    hx[i] = 0; hy[i] = 0; hb[i] = 0;
}}

t = 0;
handover = -1;
u = 0;
e = 0;
bedb = 0;
hbed = 0;
c = 0;
v = 0;

fun status_callback (status)
{{
    if (status == "handover" && handover < 0)
    {{
        handover = t;
        hbed = bedb;
        for (i = 0; i < N; i = i + 1)
        {{
            hx[i] = cx[i]; hy[i] = cy[i]; hb[i] = cb[i];
        }}
    }}
}}
Plymouth.SetUpdateStatusFunction(status_callback);

fun refresh_callback ()
{{
    t = t + 1;
    fade = Math.Min(t / 40, 1);
    # Where in the cycle: fire, gathering, the word, breaking up.
    c = t - Math.Int(t / CYCLE) * CYCLE;
    flick = fade * (0.62 + 0.22 * Math.Sin(t * 0.131) + 0.12 * Math.Sin(t * 0.377 + 1.3));
    if (handover >= 0)
    {{
        u = Math.Min((t - handover) / {FORM_TICKS}, 1);
        bedb = hbed + (0.18 - hbed) * u;
    }}
    else if (c < {FIRE})
        bedb = flick;
    else if (c < {FIRE + GATHER})
        bedb = flick + (0.18 - flick) * (c - {FIRE}) / {GATHER};
    else if (c < {FIRE + GATHER + HOLD})
        bedb = 0.18;
    else
        bedb = 0.18 + (flick - 0.18) * (c - {FIRE + GATHER + HOLD}) / {SCATTER};
    bed_s.SetOpacity(bedb);
    for (i = 0; i < N; i = i + 1)
    {{
        q = t * sp[i] + ph[i];
        p = q - Math.Int(q);
        fx = W * x0[i] + amp[i] * Math.Sin(t * fq[i] + p2[i]);
        fy = H * (1.08 - 1.16 * p);
        fb = (1 - p) * (1 - p) * fade;
        ax = W / 2 + tx[i];
        ay = H / 2 + ty[i];
        if (handover >= 0)
        {{
            # Each its own: a late start, a bent path, eased.
            if (wd[i] == 1)
            {{
                v = Math.Max(0, Math.Min(1, (u - dl[i]) / (1 - dl[i])));
                e = 1 - (1 - v) * (1 - v) * (1 - v);
                mx = (hx[i] + ax) / 2 + kx[i];
                my = (hy[i] + ay) / 2 + ky[i];
                cx[i] = (1 - e) * (1 - e) * hx[i] + 2 * (1 - e) * e * mx + e * e * ax;
                cy[i] = (1 - e) * (1 - e) * hy[i] + 2 * (1 - e) * e * my + e * e * ay;
                cb[i] = hb[i] + (1 - hb[i]) * e;
            }}
            else
                cb[i] = hb[i] * (1 - u);
        }}
        else if (c < {FIRE})
        {{
            cx[i] = fx; cy[i] = fy; cb[i] = fb;
        }}
        else if (c < {FIRE + GATHER})
        {{
            u = (c - {FIRE}) / {GATHER};
            if (wd[i] == 1)
            {{
                # From where it was as the gathering began.
                t0 = t - (c - {FIRE});
                q = t0 * sp[i] + ph[i];
                p = q - Math.Int(q);
                sx = W * x0[i] + amp[i] * Math.Sin(t0 * fq[i] + p2[i]);
                sy = H * (1.08 - 1.16 * p);
                sb = (1 - p) * (1 - p) * Math.Min(t0 / 40, 1);
                v = Math.Max(0, Math.Min(1, (u - dl[i]) / (1 - dl[i])));
                e = 1 - (1 - v) * (1 - v) * (1 - v);
                mx = (sx + ax) / 2 + kx[i];
                my = (sy + ay) / 2 + ky[i];
                cx[i] = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * ax;
                cy[i] = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * ay;
                cb[i] = sb + (1 - sb) * e;
            }}
            else
            {{
                cx[i] = fx; cy[i] = fy; cb[i] = fb * (1 - u);
            }}
        }}
        else if (c < {FIRE + GATHER + HOLD})
        {{
            cx[i] = ax; cy[i] = ay; cb[i] = wd[i];
        }}
        else
        {{
            u = (c - {FIRE + GATHER + HOLD}) / {SCATTER};
            if (wd[i] == 1)
            {{
                v = Math.Max(0, Math.Min(1, (u - dl[i]) / (1 - dl[i])));
                e = v * v * (3 - 2 * v);
                mx = (ax + fx) / 2 - kx[i];
                my = (ay + fy) / 2 - ky[i];
                cx[i] = (1 - e) * (1 - e) * ax + 2 * (1 - e) * e * mx + e * e * fx;
                cy[i] = (1 - e) * (1 - e) * ay + 2 * (1 - e) * e * my + e * e * fy;
                cb[i] = 1 + (fb - 1) * e;
            }}
            else
            {{
                cx[i] = fx; cy[i] = fy; cb[i] = fb * u;
            }}
        }}
        s[i].SetPosition(X + cx[i] - hf[i], Y + cy[i] - hf[i], 1);
        s[i].SetOpacity(cb[i]);
    }}
}}
Plymouth.SetRefreshFunction(refresh_callback);
"""
with open(f"{THEME}/immutable-kiosk.script", "w") as f:
    f.write(SCRIPT)

# ---- kiosk-splash's data: the same embers, sizes, colours and bed

os.makedirs(os.path.dirname(DATA), exist_ok=True)
with open(DATA, "w") as f:
    json.dump({"sizes": SIZES, "colors": COLORS, "embers": embers,
               "bed": {"w": BED_W, "h": BED_H, "screen_h": BED_SCREEN_H}}, f, separators=(",", ":"))
print(f"{len(embers)} embers ({sum(e['word'] for e in embers)} in the word): "
      f"ember-*.png, bed.png, immutable-kiosk.script in {THEME}; {DATA}")
