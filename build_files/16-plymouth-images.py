"""Images for the boot splash (theme and script: 15-plymouth.sh), drawn here
anti-aliased with straight alpha and written as PNG with the standard library
-- no image tools in the build:

  ring.png  a light ring whose 270-degree "comet" tail fades out behind a
            round head, over a faint full track; the script turns it.
  glow.png  a soft round glow in the accent blue behind it; the script makes
            it breathe.

kiosk-shell shows ring.png the same way while the kiosk starts, so the splash
and the kiosk's first frame look alike.
"""

import math
import struct
import zlib

THEME = "/usr/share/plymouth/themes/immutable-kiosk"
TEXT = (230, 237, 243)                     # the Settings UI's text colour
ACCENT = (47, 129, 247)                    # its default accent


def png(path, w, h, pixel):
    """pixel(x, y) -> (r, g, b, a) with a in 0..1."""
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


def clamp(v):
    return max(0.0, min(1.0, v))


# Ring: 112 px, radius 40, stroke 6; head at 12 o'clock, tail counter-clockwise.
S, R, T = 112, 40.0, 6.0
TAIL, TRACK = 0.75 * 2 * math.pi, 0.10
c = (S - 1) / 2
hx, hy = c, c - R


def ring(x, y):
    dx, dy = x - c, y - c
    on_ring = clamp(T / 2 - abs(math.hypot(dx, dy) - R) + 0.5)
    behind = (-math.atan2(dx, -dy)) % (2 * math.pi)        # 0 at the head
    tail = (1 - behind / TAIL) ** 1.6 if behind <= TAIL else 0.0
    cap = clamp(T / 2 - math.hypot(x - hx, y - hy) + 0.5)
    return (*TEXT, max(on_ring * TRACK, on_ring * tail, cap))


# Glow: 320 px, accent blue, smooth falloff to nothing at the edge.
G = 320
g = (G - 1) / 2


def glow(x, y):
    d = math.hypot(x - g, y - g) / g
    return (*ACCENT, 0.22 * (1 - clamp(d)) ** 2.2)


png(f"{THEME}/ring.png", S, S, ring)
png(f"{THEME}/glow.png", G, G, glow)
print(f"ring.png, glow.png in {THEME}")
