# Roadmap

## Next

- [ ] **PIN for Settings** (optional, off by default): hot corner → PIN pad
      (numeric `osk.js` layout) before Settings opens. kioskd stores a hash;
      the API then also requires a session token.
- [ ] **Updates from a USB stick**: Settings → System → *Z pendrive'a*:
      kioskd watches for a stick with `immutable-kiosk-*.oci.tar`, verifies its
      cosign signature, `bootc switch --transport oci-archive …`; release
      workflow publishes that archive. For sites without internet.
- [ ] **Scheduled updates**: "download automatically, apply only on the
      button" (a timer running `bootc upgrade` without `--apply`) and a
      "new version ready" badge on the hot corner / Settings.
- [ ] **Brightness** slider (`/sys/class/backlight`) and **screen blanking**
      schedule (night off, wake on touch).
- [ ] Auto-rotation from the accelerometer (`iio-sensor-proxy` is already in
      the `x86` variant) as an extra rotation option.
- [ ] Boot splash (plymouth) instead of a black screen while cage starts.
- [ ] Settings: time zone / NTP server (industrial networks often have their own).

## Later

- [ ] HMI health watchdog: reload when the page stops responding (JS
      heartbeat), not just when the load fails.
- [ ] Remote access for maintenance (SSH key from Settings, or a read-only
      status page on the LAN).
- [ ] More devices: other Bay/Cherry Trail tablets and panel PCs (just a
      `devices.toml` entry), an aarch64 variant (RPi with touchscreen) reusing
      the same kiosk layer.
- [ ] Shared CI: the release/changelog/signing steps now exist in three
      repos (immutable-sbc, lm-server-config, this one) -- move them into
      reusable workflows (e.g. `LukeMech/bootc-ci`).
