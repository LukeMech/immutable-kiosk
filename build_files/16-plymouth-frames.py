"""The boot splash's spinner (theme set up by 15-plymouth.sh): a light ring
whose 270-degree "comet" tail fades out behind a round head, over a faint full
track. 36 frames, one turn per 1.2 s at Plymouth's 30 fps. Drawn here
(anti-aliased, straight alpha) and written as PNG with the standard library --
no image tools in the build.
"""

import math
import struct
import zlib

THEME = "/usr/share/plymouth/themes/immutable-kiosk"
SIZE, R, T, N = 72, 26.0, 5.0, 36          # px, ring radius, stroke width, frames
TAIL = 0.75 * 2 * math.pi                  # tail length (radians)
COLOR = (230, 237, 243)                    # the Settings UI's text colour
TRACK = 0.10                               # opacity of the faint full ring


def png(path, w, h, rows):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes(row) for row in rows)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw, 9))
                + chunk(b"IEND", b""))


def clamp(v):
    return max(0.0, min(1.0, v))


c = (SIZE - 1) / 2
for frame in range(N):
    head = frame / N * 2 * math.pi                         # clockwise from 12 o'clock
    hx, hy = c + R * math.sin(head), c - R * math.cos(head)
    rows = []
    for y in range(SIZE):
        row = []
        for x in range(SIZE):
            dx, dy = x - c, y - c
            ring = clamp(T / 2 - abs(math.hypot(dx, dy) - R) + 0.5)
            behind = (head - math.atan2(dx, -dy)) % (2 * math.pi)
            tail = (1 - behind / TAIL) ** 1.6 if behind <= TAIL else 0.0
            cap = clamp(T / 2 - math.hypot(x - hx, y - hy) + 0.5)
            row += [*COLOR, round(255 * max(ring * TRACK, ring * tail, cap))]
        rows.append(row)
    png(f"{THEME}/throbber-{frame + 1:04d}.png", SIZE, SIZE, rows)

print(f"{N} spinner frames in {THEME}")
