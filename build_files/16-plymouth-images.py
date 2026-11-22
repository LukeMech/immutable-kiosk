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
import os
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


# kiosk-splash's frames: the ring turned clockwise in FRAMES steps, drawn
# straight from ring() (no resampling) over the kiosk's background colour,
# opaque XRGB8888 (bytes B, G, R, X) -- what it copies into its Wayland
# buffer, no image decoding at start-up. File: "IKSR", size, count (u16 LE),
# then the frames, zlib-compressed.
SPLASH = "/usr/share/immutable-kiosk/splash-ring.bin"
BG = (16, 21, 28)                          # #10151c, kiosk-shell's background
FRAMES = 64
frames = bytearray()
for k in range(FRAMES):
    a = 2 * math.pi * k / FRAMES
    ca, sa = math.cos(a), math.sin(a)
    for y in range(S):
        for x in range(S):
            # The point that lands on (x, y) when the ring turns by a (y down).
            dx, dy = x - c, y - c
            r, gr, b, al = ring(c + dx * ca + dy * sa, c - dx * sa + dy * ca)
            al = clamp(al)
            frames += bytes((round(BG[2] + (b - BG[2]) * al), round(BG[1] + (gr - BG[1]) * al),
                             round(BG[0] + (r - BG[0]) * al), 255))
os.makedirs(os.path.dirname(SPLASH), exist_ok=True)
with open(SPLASH, "wb") as f:
    f.write(b"IKSR" + struct.pack("<HH", S, FRAMES) + zlib.compress(bytes(frames), 9))
print(f"{SPLASH}: {FRAMES} frames of {S} px")
