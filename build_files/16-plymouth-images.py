"""The start-up animation, "orbit", drawn here once for both places it runs
(no image tools in the build, standard library only):

  plymouth (15-plymouth.sh's script)  glow.png, base.png, outer.png,
      inner.png -- the script turns the arcs and breathes the glow;
  kiosk-splash (in cage)  splash-orbit.bin -- the same picture as finished
      frames, so it only copies rows.

On black: a soft accent glow, a small bright core with two faint tracks
around it, an outer arc turning clockwise with a gentle surge and an
inner one twice as fast the other way, both with comet tails. Its rest
pose -- both arcs back at the top/bottom, the glow full -- is where the
boot splash settles at the hand-over (dimmed, "handover" status) and where
kiosk-splash wakes up from, so the pause between them looks meant.
"""

import math
import os
import struct
import zlib

THEME = "/usr/share/plymouth/themes/immutable-kiosk"
SPLASH = "/usr/share/immutable-kiosk/splash-orbit.bin"

TEXT = (230, 237, 243)          # Settings' text colour: the outer arc
ACCENT = (47, 129, 247)         # its default accent: the glow
CORE = (150, 196, 255)          # the core and the inner arc, a lighter accent

S = 240                         # everything: S x S, centre C (glow included)
C = (S - 1) / 2
R_OUT, R_IN, W = 58.0, 36.0, 4.5
SPAN_OUT, SPAN_IN = 0.42 * 2 * math.pi, 0.30 * 2 * math.pi
R_CORE = 7.0
G = S                           # glow: the same size
GC = (G - 1) / 2

PERIOD_MS = 1600                # one loop: outer 1 turn, inner 2 turns back
LOOP = 80                       # loop frames (50 a second, as plymouth)
INTRO = 30                      # kiosk-splash: black -> dim rest -> full
REST_LEVEL = 0.35               # the hand-over's dimmed rest pose
TWO_PI = 2 * math.pi


def clamp(v):
    return max(0.0, min(1.0, v))


def png(path, w, h, pixel):
    """pixel(x, y) -> (r, g, b, a), a in 0..1; straight alpha."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            r, g, b, a = pixel(x, y)
            raw += bytes((r, g, b, round(255 * clamp(a))))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
                + chunk(b"IEND", b""))


# ---- the shapes, as coverage 0..1 at a pixel

def arc(x, y, r, span, head, clockwise):
    """An arc of radius r whose round head is at angle `head` (0 = 12
    o'clock, clockwise positive) and whose tail fades out over `span`
    behind it -- behind = against the direction it turns."""
    dx, dy = x - C, y - C
    on = clamp(W / 2 - abs(math.hypot(dx, dy) - r) + 0.5)
    hx, hy = C + r * math.sin(head), C - r * math.cos(head)
    cap = clamp(W / 2 - math.hypot(x - hx, y - hy) + 0.5)
    if on <= 0:
        return cap
    pos = math.atan2(dx, -dy)
    behind = ((head - pos) if clockwise else (pos - head)) % TWO_PI
    tail = (1 - behind / span) ** 2.2 if behind <= span else 0.0
    return max(on * tail, cap)


def tracks(x, y):
    d = math.hypot(x - C, y - C)
    return 0.06 * max(clamp(W / 2 - abs(d - R_OUT) + 0.5), clamp(W / 2 - abs(d - R_IN) + 0.5))


def core(x, y):
    return clamp(R_CORE - math.hypot(x - C, y - C) + 0.5)


def glow(x, y):
    d = math.hypot(x - GC, y - GC) / GC
    return 0.50 * (1 - clamp(d)) ** 2.6


def angles(p):
    """Phase p in [0, 1) -> (outer, inner) head angles; p = 0 is the rest pose."""
    return TWO_PI * (p + 0.06 * math.sin(TWO_PI * p)), math.pi - 2 * TWO_PI * p


def breath(p):
    return 0.65 + 0.35 * math.cos(TWO_PI * p)


# ---- plymouth's images

os.makedirs(THEME, exist_ok=True)


def base_px(x, y):
    c, t = core(x, y), tracks(x, y)
    a = c + t * (1 - c)
    if a <= 0:
        return (0, 0, 0, 0)
    col = tuple(round((CORE[i] * c + TEXT[i] * t * (1 - c)) / a) for i in range(3))
    return (*col, a)


png(f"{THEME}/glow.png", G, G, lambda x, y: (*ACCENT, glow(x, y)))
png(f"{THEME}/base.png", S, S, base_px)
png(f"{THEME}/outer.png", S, S, lambda x, y: (*TEXT, arc(x, y, R_OUT, SPAN_OUT, 0.0, True)))
png(f"{THEME}/inner.png", S, S, lambda x, y: (*CORE, arc(x, y, R_IN, SPAN_IN, 0.0, False)))
print(f"glow.png, base.png, outer.png, inner.png in {THEME}")


# ---- kiosk-splash's frames: the same layers composited on black, XRGB8888
# (bytes B, G, R, X). Layers in plymouth's order: glow, base, outer, inner.

off = (G - S) // 2  # the glow image is larger, centred on the same point
glow_a = [glow(x + off, y + off) for y in range(S) for x in range(S)]
base_layer = [base_px(x, y) for y in range(S) for x in range(S)]
# Pixels an arc can ever cover: the rest are glow and base only.
near = [i for i in range(S * S)
        if abs(math.hypot(i % S - C, i // S - C) - R_OUT) < W + 1
        or abs(math.hypot(i % S - C, i // S - C) - R_IN) < W + 1]


def frame(p, level):
    ao, ai = angles(p)
    b = breath(p)
    px = []
    for i in range(S * S):
        a = glow_a[i] * b
        rgb = [ACCENT[k] * a for k in range(3)]
        br, bg_, bb, ba = base_layer[i]
        if ba:
            rgb = [rgb[0] * (1 - ba) + br * ba, rgb[1] * (1 - ba) + bg_ * ba, rgb[2] * (1 - ba) + bb * ba]
        px.append(rgb)
    for i in near:
        x, y = i % S, i // S
        for col, cov in ((TEXT, arc(x, y, R_OUT, SPAN_OUT, ao, True)),
                         (CORE, arc(x, y, R_IN, SPAN_IN, ai, False))):
            if cov:
                px[i] = [px[i][k] * (1 - cov) + col[k] * cov for k in range(3)]
    out = bytearray()
    for r, g, b2 in px:
        out += bytes((round(b2 * level), round(g * level), round(r * level), 255))
    return out


frames = bytearray()
rest = frame(0.0, 1.0)
for i in range(INTRO):
    # Black -> the dimmed rest pose plymouth froze on (a third of the
    # intro), then up to full brightness, eased out.
    k = INTRO // 3
    if i < k:
        level = REST_LEVEL * (i + 1) / k
    else:
        u = (i - k + 1) / (INTRO - k)
        level = REST_LEVEL + (1 - REST_LEVEL) * (1 - (1 - u) ** 3)
    frames += bytes(round(v * level) if j % 4 != 3 else 255 for j, v in enumerate(rest))
for n in range(LOOP):
    frames += frame(n / LOOP, 1.0)

os.makedirs(os.path.dirname(SPLASH), exist_ok=True)
with open(SPLASH, "wb") as f:
    f.write(b"IKS2" + struct.pack("<HHHH", S, INTRO, LOOP, PERIOD_MS) + zlib.compress(bytes(frames), 9))
print(f"{SPLASH}: {INTRO} intro + {LOOP} loop frames of {S} px, {os.path.getsize(SPLASH)} bytes")
