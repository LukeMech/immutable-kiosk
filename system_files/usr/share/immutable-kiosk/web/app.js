/* Settings / Installer page. Talks to kioskd (/api/*, header X-Kiosk: 1) and
   to kiosk-shell via the "kiosk" WebKit message handler. */
"use strict";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, body) {
    const opts = { headers: { "X-Kiosk": "1" } };
    if (body !== undefined) {
        opts.method = "POST";
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
    }
    const r = await fetch("/api" + path, opts);
    let data = null;
    try { data = await r.json(); } catch (_) { /* empty */ }
    if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
    return data;
}

function shell(cmd) {
    try { window.webkit.messageHandlers.kiosk.postMessage(JSON.stringify({ cmd })); }
    catch (_) { console.log("kiosk-shell:", cmd); /* opened in a normal browser */ }
}

let toastTimer;
function toast(text, err = false) {
    const t = $("toast");
    t.textContent = text;
    t.className = err ? "err" : "";
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

function msg(el, text, kind = "") {
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
}

/* 24x24 stroked icons, shared by status lines and list rows. */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const wifiIcon = level => svg(  // level 0-3: lit arcs
    `<circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none"/>` +
    ['M8.6 15.6a4.8 4.8 0 0 1 6.8 0', 'M5.6 12.6a9 9 0 0 1 12.8 0', 'M2.6 9.4a13.3 13.3 0 0 1 18.8 0']
        .map((d, i) => `<path d="${d}"${i < level ? "" : ' opacity=".28"'}/>`).join(""));
const ICONS = {
    ok: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    new: svg('<path d="M12 4v12"/><path d="M6.5 11l5.5 5.5 5.5-5.5"/><path d="M5 20h14"/>'),
    ready: svg('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>'),
    err: svg('<path d="M12 7v6"/><path d="M12 17h.01"/>'),
    warn: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><path d="M12 17.5h.01"/>'),
    busy: svg('<path d="M12 3a9 9 0 1 0 9 9"/>'),
    screen: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
    wifiOff: svg('<circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none"/><path d="M8.6 15.6a4.8 4.8 0 0 1 6.8 0" opacity=".28"/><path d="M5.6 12.6a9 9 0 0 1 12.8 0" opacity=".28"/><path d="M3 3l18 18"/>'),
    ethernet: svg('<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    tablet: svg('<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
    plug: svg('<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>'),
    battery: svg('<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3"/>'),
};

/* Fills a .status line: elements <id>, <id>-icon, -title, -sub. */
function setStatus(id, state, icon, title, sub = "") {
    $(id).className = "status" + (state ? " " + state : "");
    $(id + "-icon").innerHTML = icon;
    $(id + "-title").textContent = title;
    $(id + "-sub").textContent = sub;
}

async function busy(btn, fn) {
    btn.disabled = true;
    try { return await fn(); }
    catch (e) { toast(e.message, true); throw e; }
    finally { btn.disabled = false; }
}

function seg(container, value, onPick) {
    container.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === value));
    if (onPick) container.onclick = e => {
        const b = e.target.closest("button");
        if (b) onPick(b.dataset.v);
    };
}

/* Hold-to-confirm: fn runs only after the finger stayed down data-hold ms. */
function holdButton(btn, fn) {
    const ms = Number(btn.dataset.hold || 1500);
    btn.style.setProperty("--hold", ms + "ms");
    let timer = null;
    const cancel = () => { clearTimeout(timer); timer = null; btn.classList.remove("holding"); };
    btn.addEventListener("pointerdown", e => {
        if (btn.disabled) return;
        e.preventDefault();
        btn.classList.add("holding");
        timer = setTimeout(() => { cancel(); fn(); }, ms);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, () => {
        if (timer) { cancel(); toast("Hold the button longer"); }
    }));
}

const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : (b / 1e6).toFixed(0) + " MB";
// Dates and numbers in the page's language (i18n.js sets <html lang>).
const LOCALE = () => (document.documentElement.lang === "en" ? "en-GB" : "pl-PL");
const fmtTime = t => t ? new Date(t).toLocaleString(LOCALE()) : "—";

/* ======================================================= SETTINGS */

let cfg = null;

// "charger connected · battery 72% (charging)"; unknown parts are omitted.
function powerText(p) {
    const parts = [];
    if (p.ac_online === true) parts.push("charger connected");
    else if (p.ac_online === false) parts.push("on battery");
    if (p.battery != null) {
        const st = { Charging: "charging", Full: "full", "Not charging": "not charging" }[p.battery_status];
        parts.push(`battery ${p.battery}%${st ? ` (${st})` : ""}`);
    }
    return parts.length ? parts.join(" · ") : "no data";
}

// Extra bottom scroll room while the on-screen keyboard is up.
window.addEventListener("kiosk-osk", e => document.body.classList.toggle("osk-open", e.detail.open));
let currentTab = "hmi";

function showTab(name) {
    currentTab = name;
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach(s => { s.hidden = s.id !== "tab-" + name; });
    const net = () => { loadWifi(false); loadNet(); };
    ({ hmi: loadHmi, net, screen: loadScreen, system: loadSystem })[name]();
}

// Called by kiosk-shell. The page keeps running behind the HMI (document.hidden
// stays false), so live updates check settingsVisible.
let settingsVisible = true;
window.kioskShown = () => {
    settingsVisible = true;
    if (cfg && cfg.mode !== "installer") { showTab(currentTab); refreshDevice(); }
};
window.kioskHidden = () => { settingsVisible = false; };
// kiosk-shell: HMI unreachable at start; Settings shows until it answers.
let hmiWaiting = false;
window.kioskWaiting = on => { hmiWaiting = !!on; renderNetbar(); };

/* ---------- HMI */
let hmiDraft = null;

let hmiTest = null;  // last "Test connection": {url, busy} or {url, ok, message}

// Same rules as kioskd's hmi_url(), so a saved address compares equal.
function hmiDraftUrl() {
    const h = hmiDraft;
    let host = (h.host || "").trim();
    if (!host) return "";
    if (host.includes(":") && !host.startsWith("[")) host = `[${host}]`;
    const def = h.scheme === "https" ? 443 : 80;
    const port = Number(h.port) && Number(h.port) !== def ? ":" + h.port : "";
    let path = h.path || "/";
    if (!path.startsWith("/")) path = "/" + path;
    return `${h.scheme}://${host}${port}${path}`;
}

function renderHmiUrl() {
    const url = hmiDraftUrl();
    if (!url) {
        setStatus("hmi-st", "warn", ICONS.warn, "No HMI address", "Enter the HMI server's address to show the HMI.");
        return;
    }
    const unsaved = url !== (cfg && cfg.hmi_url);
    const t = hmiTest && hmiTest.url === url ? hmiTest : null;
    const note = unsaved ? "Not saved — “Save and open HMI”" : "";
    if (t && t.busy) setStatus("hmi-st", "busy", ICONS.busy, url, "Testing connection…");
    else if (t) setStatus("hmi-st", t.ok ? "ok" : "err", t.ok ? ICONS.ok : ICONS.err, url, [t.message, note].filter(Boolean).join(" · "));
    else setStatus("hmi-st", unsaved ? "new" : "", ICONS.screen, url, note || "Saved HMI address");
}

function readHmiForm() {
    hmiDraft.host = $("hmi-host").value.trim();
    hmiDraft.port = $("hmi-port").value.trim();
    hmiDraft.path = $("hmi-path").value.trim() || "/";
    renderHmiUrl();
}

async function loadHmi() {
    cfg = await api("/config");
    hmiDraft = { ...cfg.hmi };
    $("hmi-host").value = hmiDraft.host;
    $("hmi-port").value = hmiDraft.port;
    $("hmi-path").value = hmiDraft.path;
    seg($("hmi-scheme"), hmiDraft.scheme, v => {
        hmiDraft.scheme = v;
        // On a TwinCAT default port, follow to the other protocol's default.
        if (v === "http" && String(hmiDraft.port) === "1020") $("hmi-port").value = "1010";
        if (v === "https" && String(hmiDraft.port) === "1010") $("hmi-port").value = "1020";
        seg($("hmi-scheme"), v);
        readHmiForm();
    });
    $("opt-cert").checked = cfg.accept_self_signed;
    $("opt-osk").checked = cfg.osk_in_hmi;
    $("opt-retry").value = cfg.retry_seconds;
    $("zoom-val").textContent = Math.round(cfg.zoom * 100) + "%";
    renderHmiUrl();
    $("back").disabled = !cfg.hmi_url;
}

function initHmi() {
    ["hmi-host", "hmi-port", "hmi-path"].forEach(id => $(id).addEventListener("input", readHmiForm));
    document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
        const [scheme, port] = b.dataset.preset.split(":");
        hmiDraft.scheme = scheme;
        $("hmi-port").value = port;
        seg($("hmi-scheme"), scheme);
        readHmiForm();
    }));
    $("hmi-test").addEventListener("click", e => {
        readHmiForm();
        const url = hmiDraftUrl();
        hmiTest = { url, busy: true };
        renderHmiUrl();
        busy(e.currentTarget, async () => {
            const r = await api("/hmi/test", { host: hmiDraft.host, port: hmiDraft.port });
            hmiTest = { url, ok: r.ok, message: r.message };
        }).catch(err => { hmiTest = { url, ok: false, message: err.message }; })
            .finally(renderHmiUrl);
    });
    $("hmi-save").addEventListener("click", e => busy(e.currentTarget, async () => {
        readHmiForm();
        cfg = await api("/config", { hmi: hmiDraft });
        shell("config-changed");
        if (cfg.hmi_url) shell("reload-hmi");
        $("back").disabled = !cfg.hmi_url;
        renderHmiUrl();
    }).catch(() => {}));
    $("opt-save").addEventListener("click", e => busy(e.currentTarget, async () => {
        cfg = await api("/config", {
            accept_self_signed: $("opt-cert").checked,
            osk_in_hmi: $("opt-osk").checked,
            retry_seconds: Number($("opt-retry").value) || 10,
        });
        shell("config-changed");
        toast("Saved");
    }));
}

/* ---------- Wi-Fi */
const sigLevel = s => s >= 70 ? 3 : s >= 45 ? 2 : 1;
let openSsid = null;
let wifiLast = null;      // last GET /wifi
let wifiOverride = null;  // {state, icon, title, sub}: replaces the status line

function renderWifiStatus() {
    const w = wifiLast, o = wifiOverride;
    const d0 = w && w.device;
    // Disconnect: only for a live connection, never mid-action.
    $("wifi-off").hidden = !!o || !(w && w.enabled && d0 && /^(connected|connecting)/.test(d0.state));
    if (o) return setStatus("wifi-st", o.state, o.icon, o.title, o.sub);
    if (!w) return setStatus("wifi-st", "busy", ICONS.busy, "Loading…");
    const d = w.device;
    if (!d) return setStatus("wifi-st", "err", ICONS.wifiOff, "No Wi-Fi adapter", "The tablet reports no Wi-Fi adapter.");
    if (!w.enabled) return setStatus("wifi-st", "off", ICONS.wifiOff, "Wi-Fi is off", "Turn it on with the switch next to the title.");
    if (d.state.startsWith("connecting")) return setStatus("wifi-st", "busy", ICONS.busy, d.connection ? `Connecting to ${d.connection}…` : "Connecting…", "");
    if (d.state.startsWith("connected")) {
        const n = w.networks.find(x => x.in_use);
        const sub = [d.address, n ? `signal ${n.signal}%` : ""].filter(Boolean).join(" · ");
        return setStatus("wifi-st", "ok", wifiIcon(n ? sigLevel(n.signal) : 3), `Connected to ${n ? n.ssid : d.connection}`, sub);
    }
    setStatus("wifi-st", "warn", wifiIcon(0), "Not connected", w.networks.length ? "Pick a network from the list below." : "No networks in range.");
}

// live: from a kioskd event; skipped while this page's own action runs.
async function loadWifi(rescan, live = false) {
    if (live && wifiOverride && wifiOverride.state === "busy") return;
    if (rescan) wifiOverride = { state: "busy", icon: ICONS.busy, title: "Scanning for networks…" };
    renderWifiStatus();
    let w;
    try { w = await api("/wifi" + (rescan ? "?rescan=1" : "")); }
    catch (e) {
        wifiOverride = { state: "err", icon: ICONS.err, title: "Couldn't read Wi-Fi", sub: e.message };
        renderWifiStatus();
        return;
    }
    if (wifiOverride && wifiOverride.state === "busy") wifiOverride = null;
    wifiLast = w;
    $("wifi-radio").checked = w.enabled;
    $("wifi-radio-box").hidden = !w.device;
    renderWifiStatus();
    const list = $("wifi-list");
    // Don't rebuild under a password being typed.
    if (live && [...list.querySelectorAll("input")].some(i => i.value || i === document.activeElement)) return;
    const others = w.networks.filter(n => !n.in_use);
    list.innerHTML = others.length ? "" : `<li class="empty">${w.enabled ? "No other networks found." : "Wi-Fi is off."}</li>`;
    for (const n of others) {
        const li = document.createElement("li");
        const sec = n.security ? `secured · ${esc(n.security)}` : "open";
        li.innerHTML = `<div class="item">
            <span class="ico">${wifiIcon(sigLevel(n.signal))}</span>
            <div class="name">${esc(n.ssid)}<div class="sub">${sec} · ${n.signal}%</div></div>
            ${n.saved ? '<span class="badge">saved</span>' : ""}
          </div>`;
        const item = li.querySelector(".item");
        list.appendChild(li);
        const ex = document.createElement("div");
        ex.className = "expand";
        ex.hidden = openSsid !== n.ssid;
        item.classList.toggle("open", !ex.hidden);
        // Saved: NetworkManager's stored password, unless "Other password".
        const remembered = n.saved && n.security;
        ex.innerHTML = (remembered ? '<p class="hint">Saved — connects with the remembered password.</p>' : "") +
            (n.security ? `<label class="pw"${remembered ? " hidden" : ""}>Password
                <input type="password" autocomplete="off"></label>` : "") +
            `<div class="actions"><button class="btn primary go">Connect</button>` +
            (remembered ? '<button class="btn other">Other password</button>' : "") + `</div>`;
        const btn = ex.querySelector(".go");
        ex.querySelector(".other")?.addEventListener("click", e => {
            ex.querySelector(".pw").hidden = false;
            ex.querySelector(".hint").hidden = true;
            e.currentTarget.hidden = true;
            ex.querySelector("input").focus();
        });
        btn.addEventListener("click", () => busy(btn, async () => {
            const pw = ex.querySelector(".pw");
            const pass = pw && !pw.hidden ? pw.querySelector("input").value : "";
            wifiOverride = { state: "busy", icon: ICONS.busy, title: `Connecting to ${n.ssid}…`, sub: "This can take up to a minute." };
            renderWifiStatus();
            try {
                await api("/wifi/connect", { ssid: n.ssid, password: pass });
                wifiOverride = null;
                openSsid = null;
            } catch (e) {
                wifiOverride = { state: "err", icon: ICONS.err, title: `Couldn't connect to ${n.ssid}`, sub: e.message };
                renderWifiStatus();
                throw e;
            }
            await loadWifi(false);
        }).catch(() => {}));
        item.addEventListener("click", () => {
            openSsid = ex.hidden ? n.ssid : null;
            list.querySelectorAll(".expand").forEach(x => {
                if (x !== ex) { x.hidden = true; x.previousElementSibling.classList.remove("open"); }
            });
            ex.hidden = !ex.hidden;
            item.classList.toggle("open", !ex.hidden);
            const pw = ex.querySelector(".pw");
            if (!ex.hidden && pw && !pw.hidden) pw.querySelector("input").focus();
        });
        li.appendChild(ex);
    }
    const saved = $("wifi-saved");
    saved.innerHTML = w.saved.length ? "" : '<li class="empty">No saved networks.</li>';
    for (const s of w.saved) {
        const li = document.createElement("li");
        li.innerHTML = `<div class="item static">
            <span class="ico${s.active ? " ok" : ""}">${wifiIcon(s.active ? 3 : 0)}</span>
            <div class="name">${esc(s.ssid)}${s.active ? '<div class="sub">active</div>' : ""}</div>
            ${s.active ? "" : '<button class="btn primary go">Connect</button>'}
            <button class="btn danger hold" data-hold="1000">Forget</button></div>`;
        const go = li.querySelector(".go");
        go?.addEventListener("click", () => busy(go, async () => {
            wifiOverride = { state: "busy", icon: ICONS.busy, title: `Connecting to ${s.ssid}…`, sub: "This can take up to a minute." };
            renderWifiStatus();
            try {
                await api("/wifi/connect", { ssid: s.ssid, password: "" });
                wifiOverride = null;
            } catch (e) {
                wifiOverride = { state: "err", icon: ICONS.err, title: `Couldn't connect to ${s.ssid}`, sub: e.message };
                renderWifiStatus();
                throw e;
            }
            await loadWifi(false);
        }).catch(() => {}));
        const b = li.querySelector(".hold");
        holdButton(b, () => busy(b, async () => {
            await api("/wifi/forget", { uuid: s.uuid });
            toast(`Removed ${s.ssid}`);
            await loadWifi(false);
        }).catch(() => {}));
        saved.appendChild(li);
    }
}

function initWifi() {
    $("wifi-scan").addEventListener("click", e => {
        const b = e.currentTarget;
        b.classList.add("spin");
        busy(b, () => loadWifi(true)).catch(() => {}).finally(() => b.classList.remove("spin"));
    });
    holdButton($("wifi-off"), () => {
        const name = wifiLast && wifiLast.device && wifiLast.device.connection;
        wifiOverride = { state: "busy", icon: ICONS.busy, title: name ? `Disconnecting from ${name}…` : "Disconnecting…" };
        renderWifiStatus();
        api("/wifi/disconnect", {})
            .then(() => { wifiOverride = null; return loadWifi(false); })
            .catch(e => {
                wifiOverride = { state: "err", icon: ICONS.err, title: "Couldn't disconnect", sub: e.message };
                renderWifiStatus();
            });
    });
    // nmcli takes seconds to switch the radio: show busy, lock the switch.
    $("wifi-radio").addEventListener("change", e => {
        const sw = e.target, on = sw.checked;
        sw.disabled = true;
        wifiOverride = { state: "busy", icon: ICONS.busy, title: on ? "Turning Wi-Fi on…" : "Turning Wi-Fi off…" };
        renderWifiStatus();
        api("/wifi/radio", { enabled: on })
            .then(() => { wifiOverride = null; return loadWifi(on); })
            .catch(err => {
                sw.checked = !on;
                wifiOverride = { state: "err", icon: ICONS.err, title: on ? "Couldn't turn Wi-Fi on" : "Couldn't turn Wi-Fi off", sub: err.message };
                renderWifiStatus();
            })
            .finally(() => { sw.disabled = false; });
    });
    $("hid-connect").addEventListener("click", e => busy(e.currentTarget, async () => {
        const ssid = $("hid-ssid").value.trim();
        await api("/wifi/connect", { ssid, password: $("hid-pass").value, hidden: true });
        $("hid-pass").value = "";
        toast(`Connected to ${ssid}`);
        await loadWifi(false);
    }).catch(() => {}));
}

/* ---------- Network (IP) */
const statusHtml = (state, icon, title, sub) => `<div class="status ${state}"><div class="status-icon">${icon}</div>
    <div class="status-text"><div class="status-title">${esc(title)}</div><div class="status-sub">${esc(sub)}</div></div></div>`;

async function loadNet(live = false) {
    const box = $("net-list");
    // Don't rebuild a card being edited.
    if (live && box.querySelector(".card.dirty")) return;
    let n;
    const lone = (state, icon, title, sub) => `<div class="card"><h2>Connection</h2>${statusHtml(state, icon, title, sub)}</div>`;
    try { n = await api("/network"); }
    catch (e) { box.innerHTML = lone("err", ICONS.err, "Couldn't read the network", e.message); return; }
    if (!n.connections.length) {
        box.innerHTML = `<div class="card"><h2>IP address</h2>` + statusHtml("off", ICONS.ethernet, "No connection",
            "Join a Wi-Fi network below or plug in a cable (USB-Ethernet adapter).") + `</div>`;
        return;
    }
    box.innerHTML = "";
    for (const c of n.connections) {
        const el = document.createElement("div");
        el.className = "card";
        const cur = c.current;
        const kind = c.type === "wifi" ? "Wi-Fi" : c.type === "ethernet" ? "Ethernet" : c.type;
        const has = cur.addresses.length > 0;
        const how = c.method === "manual" ? "static address" : "DHCP address";
        el.innerHTML = `<h2>IP address · ${esc(kind)}</h2>` +
          statusHtml(has ? "ok" : "busy", has ? (c.type === "wifi" ? wifiIcon(3) : ICONS.ethernet) : ICONS.busy,
                     c.name, has ? `${cur.addresses.join(", ")} · ${how}` : "Waiting for an IP address…") + `
          <dl class="kv">
            <dt>Gateway</dt><dd>${esc(cur.gateway || "—")}</dd>
            <dt>DNS</dt><dd>${esc(cur.dns.join(", ") || "—")}</dd>
            <dt>Interface</dt><dd>${esc(c.device || "—")}</dd>
          </dl>
          <div class="sep"><h3>IPv4 addressing</h3>
          <div class="seg"><button data-v="auto">Automatic (DHCP)</button><button data-v="manual">Static address</button></div>
          <div class="manual">
            <div class="grid2">
              <label>IP address<input name="address" type="text" inputmode="decimal" placeholder="192.168.1.20"></label>
              <label>Mask (prefix)<input name="prefix" type="text" inputmode="numeric" placeholder="24"></label>
            </div>
            <label>Gateway<input name="gateway" type="text" inputmode="decimal" placeholder="192.168.1.1"></label>
            <div class="grid2">
              <label>DNS 1<input name="dns1" type="text" inputmode="decimal"></label>
              <label>DNS 2<input name="dns2" type="text" inputmode="decimal"></label>
            </div>
          </div>
          <p class="msg"></p>
          <div class="actions"><button class="btn primary save">Apply</button></div></div>`;
        let method = c.method === "manual" ? "manual" : "auto";
        const segEl = el.querySelector(".seg"), manual = el.querySelector(".manual");
        const f = name => el.querySelector(`[name=${name}]`);
        f("address").value = c.address || (cur.addresses[0] || "").split("/")[0];
        f("prefix").value = c.prefix || (cur.addresses[0] || "/24").split("/")[1];
        f("gateway").value = c.gateway || cur.gateway;
        f("dns1").value = (c.dns.length ? c.dns : cur.dns)[0] || "";
        f("dns2").value = (c.dns.length ? c.dns : cur.dns)[1] || "";
        const pick = v => { method = v; seg(segEl, v); manual.hidden = v !== "manual"; };
        seg(segEl, method, pick);
        pick(method);
        const save = el.querySelector(".save"), m = el.querySelector(".msg");
        el.addEventListener("input", () => el.classList.add("dirty"));
        segEl.addEventListener("click", () => el.classList.add("dirty"));
        save.addEventListener("click", () => busy(save, async () => {
            await api("/network", {
                uuid: c.uuid, method, address: f("address").value, prefix: Number(f("prefix").value),
                gateway: f("gateway").value, dns: [f("dns1").value, f("dns2").value],
            });
            msg(m, "Applied. Reconnecting…", "ok");
            el.classList.remove("dirty");  // NetworkManager's events bring the new state
        }).catch(e => msg(m, e.message, "err")));
        box.appendChild(el);
    }
}

/* ---------- Screen */
async function saveCfg(part) {
    cfg = await api("/config", part);
    shell("config-changed");
    return cfg;
}

/* kioskd stores the accent name; the page sets --accent (other tints derive
   via color-mix) and --ik-accent (OSK). All must work with white text. */
const ACCENTS = {
    blue: ["Blue", "#2f81f7"], teal: ["Teal", "#17a2b8"], green: ["Green", "#2da44e"],
    purple: ["Purple", "#8957e5"], pink: ["Pink", "#d6409f"], orange: ["Orange", "#e16f24"],
    graphite: ["Graphite", "#6e7681"],
};
function applyAccent(name) {
    const hex = (ACCENTS[name] || ACCENTS.blue)[1];
    document.documentElement.style.setProperty("--accent", hex);
    document.documentElement.style.setProperty("--ik-accent", hex);
}
function renderAccent() {
    const cur = ACCENTS[cfg.accent] ? cfg.accent : "blue";
    $("accent").innerHTML = Object.entries(ACCENTS).map(([k, [label, hex]]) =>
        `<button data-v="${k}" class="${k === cur ? "on" : ""}" style="--sw:${hex}" aria-label="${esc(label)}" title="${esc(label)}">${ICONS.ok}</button>`).join("");
}

const SPLASH_ORIENT = { normal: "0°", left_side_up: "90°", upside_down: "180°", right_side_up: "270°" };
async function loadSplash() {
    let st;
    try { st = await api("/splash"); } catch (_) { return; }
    $("splash-st").hidden = !st.state;
    const o = SPLASH_ORIENT[st.orientation] || st.orientation || "";
    if (st.state === "working") setStatus("splash-st", "busy", ICONS.busy, "Rotating the boot screen…",
        `Saving orientation ${o} to the boot settings. Don't restart the tablet until it's done.`);
    else if (st.state === "done") setStatus("splash-st", "ok", ICONS.ok, "Boot screen rotated",
        `From the next start, the boot animation uses this orientation (${o}).`);
    else if (st.state === "failed") setStatus("splash-st", "err", ICONS.err, "Couldn't rotate the boot screen",
        st.error || "");
    // The accent's and the language's boot screen files, each in its card.
    const look = st.look || {};
    for (const [what, id] of [["accent", "accent-st"], ["language", "lang-st"]]) {
        $(id).hidden = !(look.state && look.what === what);
        if (look.what !== what) continue;
        if (look.state === "working") setStatus(id, "busy", ICONS.busy, "Updating the boot screen…",
            "Saving it to the boot settings. Don't restart the tablet until it's done.");
        else if (look.state === "done") setStatus(id, "ok", ICONS.ok, "Boot screen updated",
            what === "accent" ? "From the next start, the boot screen's bar has this color."
                : "From the next start, the boot screen speaks this language.");
        else if (look.state === "failed") setStatus(id, "err", ICONS.err, "Couldn't update the boot screen",
            look.error || "");
    }
}

function loadScreen() {
    renderAccent();
    loadSplash();
    const names = { portrait: "portrait", landscape: "landscape", normal: "0°", 90: "90°", 180: "180°", 270: "270°" };
    seg($("rot"), cfg.rotation || "", v => saveCfg({ rotation: v || null }).then(loadScreen).catch(e => toast(e.message, true)));
    $("rot-hint").textContent = `Now: ${names[cfg.rotation_effective] || cfg.rotation_effective}` +
        (cfg.rotation ? "" : " (this device's default)");
    $("scale-val").textContent = Math.round((cfg.scale || 1) * 100) + "%";
    // No backlight device: no slider.
    const b = cfg.brightness ?? cfg.brightness_now;
    $("bright-card").hidden = cfg.brightness_now == null;
    if (b != null) {
        $("bright").value = b;
        $("bright-val").textContent = b + "%";
    }
    seg($("corner"), cfg.settings_corner, v => saveCfg({ settings_corner: v }).then(loadScreen).catch(e => toast(e.message, true)));
    $("corner-hint").textContent = `Emergency: holding the opposite corner (${CORNER_NAMES[recoveryCorner()]}) ` +
        `for ${RECOVERY_HOLD_S} s — in the HMI or Settings — opens System → Recovery.`;
}

/* Recovery corner (kiosk-shell): opposite the Settings corner; held
   RECOVERY_HOLD_S it opens the page with #recovery. */
const RECOVERY_HOLD_S = 3;
const CORNER_NAMES = { "top-left": "↖ top left", "top-right": "↗ top right", "bottom-left": "↙ bottom left", "bottom-right": "↘ bottom right" };
const recoveryCorner = () => ({ "top-left": "bottom-right", "top-right": "bottom-left", "bottom-left": "top-right", "bottom-right": "top-left" })[(cfg && cfg.settings_corner) || "top-right"];

function openRecovery() {
    history.replaceState(null, "", location.pathname + location.search);  // the next #recovery is a change again
    showTab("system");
    const card = $("recovery-card");
    const go = () => window.scrollTo({
        top: card.getBoundingClientRect().top + window.scrollY - document.querySelector("#settings .top").offsetHeight - 12,
        behavior: "smooth",
    });
    go();
    setTimeout(go, 900);  // cards above load async and push it down
    card.classList.remove("flash");
    void card.offsetWidth;  // restart the animation
    card.classList.add("flash");
}
window.addEventListener("hashchange", () => { if (location.hash === "#recovery") openRecovery(); });

function initScreen() {
    // Apply at once, then save; revert on failure.
    $("accent").addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b) return;
        applyAccent(b.dataset.v);
        $("accent").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
        api("/config", { accent: b.dataset.v }).then(c => { cfg = c; })
            .catch(err => { toast(err.message, true); applyAccent(cfg.accent); renderAccent(); });
    });
    // Whole-screen scale (WebKit zoom in kiosk-shell, sharp at any value).
    const scaleStep = d => saveCfg({ scale: Math.min(2, Math.max(1, Math.round(((cfg.scale || 1) + d) * 10) / 10)) })
        .then(loadScreen).catch(e => toast(e.message, true));
    $("scale-minus").addEventListener("click", () => scaleStep(-0.1));
    $("scale-plus").addEventListener("click", () => scaleStep(0.1));

    const zoomStep = d => saveCfg({ zoom: Math.min(3, Math.max(0.5, Math.round((cfg.zoom + d) * 10) / 10)) })
        .then(c => { $("zoom-val").textContent = Math.round(c.zoom * 100) + "%"; })
        .catch(e => toast(e.message, true));
    $("zoom-minus").addEventListener("click", () => zoomStep(-0.1));
    $("zoom-plus").addEventListener("click", () => zoomStep(0.1));

    // Sent while dragging, one request in flight, last value always sent.
    // Not saveCfg: kiosk-shell has nothing to reload.
    let sending = false, pending = null;
    const send = async () => {
        if (sending || pending == null) return;
        const v = pending;
        pending = null;
        sending = true;
        try { cfg = await api("/config", { brightness: v }); }
        catch (e) { toast(e.message, true); }
        finally { sending = false; send(); }
    };
    $("bright").addEventListener("input", e => {
        pending = Number(e.target.value);
        $("bright-val").textContent = pending + "%";
        send();
    });
}

/* ---------- System */

function renderJob(job, { box, stage, bar, detail }) {
    box.hidden = !job;
    if (!job) return;
    stage.textContent = job.state === "failed" ? `${job.title}: failed` : (job.stage || job.title);
    const wrap = bar.parentElement;
    wrap.classList.toggle("indet", job.state === "running" && job.fraction == null);
    bar.style.width = ((job.state === "done" ? 1 : job.fraction || 0) * 100).toFixed(1) + "%";
    bar.style.background = job.state === "failed" ? "var(--bad)" : job.state === "done" ? "var(--ok)" : "";
    detail.textContent = job.detail || "";
}

// Refetched on kioskd's "job" event (see listen), no polling.
let jobTick = null;
function followJob(onUpdate) {
    const tick = async () => {
        let job = null;
        try { job = (await api("/job")).job; } catch (_) { /* kioskd restarting */ }
        if (job) job.at = performance.now();  // for the active step's clock
        onUpdate(job);
    };
    jobTick = tick;
    tick();
}

// "12 s", "3 min 5 s" with non-breaking spaces.
function fmtDur(s) {
    s = Math.max(0, Math.round(s));
    return s < 60 ? `${s}\u00a0s` : `${Math.floor(s / 60)}\u00a0min ${s % 60}\u00a0s`;
}
const STEP_ICONS = { done: ICONS.ok, active: ICONS.busy, failed: ICONS.err };

// Updated in place, not rebuilt: rebuilding restarts the bar animations.
function renderSteps(job, el) {
    const steps = (job && job.steps) || [];
    const show = steps.length > 0 && (job.state === "running" || job.state === "failed");
    el.hidden = !show;
    if (!show) return;
    if (el.children.length !== steps.length) {
        el.innerHTML = steps.map(() => '<li><span class="dot"></span><div><div class="sr"><span class="sl"></span>' +
            '<span class="st"></span></div><div class="progress"><div></div></div><div class="sd"></div></div></li>').join("");
    }
    steps.forEach((s, i) => {
        const li = el.children[i];
        if (li.className !== s.state) {
            li.className = s.state;
            li.querySelector(".dot").innerHTML = STEP_ICONS[s.state] || "";
        }
        li.querySelector(".sl").textContent = s.label;
        const took = s.state === "active"
            ? job.now - s.started + (job.at ? (performance.now() - job.at) / 1000 : 0) : s.took;
        li.querySelector(".st").textContent = s.state === "skipped" ? "skipped"
            : took != null && s.state !== "pending" ? fmtDur(took) : "";
        const bar = li.querySelector(".progress");
        bar.hidden = s.state !== "active";
        // Paced step (no byte count): eases from floor towards 1 over about
        // the expected time; never full before kioskd says done.
        let fraction = s.fraction;
        if (s.state === "active" && s.pace) {
            const now = job.now + (job.at ? (performance.now() - job.at) / 1000 : 0);
            const left = 1 - s.pace.floor, expect = Math.max(1, s.pace.expect * left);
            fraction = s.pace.floor + left * (1 - Math.exp(-1.5 * Math.max(0, now - s.pace.since) / expect));
        }
        bar.classList.toggle("indet", fraction == null);
        bar.firstElementChild.style.width = ((fraction || 0) * 100).toFixed(1) + "%";
        const d = li.querySelector(".sd");
        d.textContent = s.detail || "";
        d.hidden = !s.detail;
    });
}

const CHANNEL_NAMES = { stable: "stable", dev: "testing" };
let chanPick = null;  // a channel tapped but not switched to yet

function renderChannel(running) {
    const s = sys, avail = !!(s && s.available);
    const cur = avail ? s.next_channel : null;
    if (chanPick === cur) chanPick = null;
    const sel = chanPick || cur;
    $("chan").querySelectorAll("button").forEach(b => {
        b.classList.toggle("on", b.dataset.v === sel);
        b.disabled = running || !avail;
    });
    let hint = "Stable: tested releases. Testing: every change right away.";
    if (chanPick) {
        hint = `Downloads the ${CHANNEL_NAMES[chanPick]} channel and switches to it after a restart.` +
            (chanPick === "stable" && cur === "dev" ? " It may be older." : "");
    } else if (avail && cur === "custom") {
        hint = "Custom image: pick a channel to get updates again.";
    } else if (avail && s.channel !== s.next_channel) {
        hint = `After a restart: ${CHANNEL_NAMES[s.next_channel] || "custom"} channel.`;
    }
    $("chan-hint").textContent = hint;
    $("chan-switch").hidden = !chanPick;
    $("chan-switch").disabled = running;
    if (chanPick) $("chan-switch").textContent = `Hold: switch to the ${CHANNEL_NAMES[chanPick]} channel`;
}

let sys = null;          // GET /system (bootc status + last check)
let sysJob = null;       // last update-related job
let sysWasRunning = false;
let sysNotes = null;     // GET /system/changelog
const UPDATE_JOBS = ["check", "upgrade", "switch", "rollback"];
const CHECK_EVERY = 15 * 60;  // s: opening System checks again after this

// Readable label without a matching release: "v45.20261122.1-778b844" ->
// "v45.20261122.1"; old "latest.20261121-22d3877" -> "v45.20261121-22d3877".
function labelVersion(v) {
    if (!v) return "";
    let m = /^(v\d+\.\d{8}(?:\.\d+)?)-[0-9a-f]{7,}$/.exec(v);
    if (m) return m[1];
    m = /^[^.]*\.(\d{8}-[0-9a-f]{7,})$/.exec(v);
    if (m) return `v${(sys && sys.fedora) || "?"}.${m[1]}`;
    return v;
}
const shortVersion = e => !e ? "—" : (labelVersion(e.version) || (e.digest || "").slice(7, 19) || "—");
function releaseOf(e) {
    if (!e || !e.sha || !sysNotes) return null;
    return [sysNotes.current, sysNotes.target, ...(sysNotes.news || [])]
        .find(r => r && r.sha && r.sha.startsWith(e.sha)) || null;
}
const versionName = e => { const r = releaseOf(e); return r ? r.tag : shortVersion(e); };
// A bare version label (boot-counter's note): release tag if known.
const rawVersion = v => {
    if (!v) return "";
    const r = sysNotes && [sysNotes.current, sysNotes.target, ...(sysNotes.news || [])]
        .find(x => x && x.sha && v.includes(x.sha.slice(0, 7)));
    return r ? r.tag : labelVersion(v);
};
const AUTO_TRIES = 3;  // boot-counter's TRIES

function fmtAgo(t) {
    const s = Date.now() / 1000 - t;
    if (s < 90) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return "at " + new Date(t * 1000).toLocaleTimeString(LOCALE(), { hour: "2-digit", minute: "2-digit" });
}
const fmtDate = t => t ? new Date(t).toLocaleDateString(LOCALE(), { day: "numeric", month: "long", year: "numeric" }) : "";

/* Minimal Markdown for build.yml's release bodies (links become text). Only
   headings and table headers get translated; the rest is translate="no". */
function md(src) {
    const inline = s => esc(s)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    const cells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    const lines = src.split("\n");
    let out = "";
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        let m;
        if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
            // No emoji font on the kiosk: drop them.
            const text = m[2].replace(/[\p{Extended_Pictographic}️‍]/gu, "").trim();
            out += m[1].length <= 2 ? `<h4>${inline(text)}</h4>` : `<h5>${inline(text)}</h5>`;
        } else if (/^\s*\|/.test(l)) {
            const rows = [];
            for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
                if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(cells(lines[i]));
            }
            i--;
            const [head, ...body] = rows;
            out += `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody translate="no">` +
                body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>";
        } else if (/^\s*[-*]\s+/.test(l)) {
            out += '<ul translate="no">';
            for (; i < lines.length && /^\s*[-*]\s+/.test(lines[i]); i++) {
                const item = inline(lines[i].replace(/^\s*[-*]\s+/, ""))
                    .replace(/^([0-9a-f]{7,12}) /, '<span class="sha">$1</span>');
                out += `<li>${item}</li>`;
            }
            i--;
            out += "</ul>";
        } else if (l.trim()) {
            out += `<p translate="no">${inline(l)}</p>`;
        }
    }
    return out;
}

function renderUpdate() {
    const s = sys, job = sysJob;
    const running = !!(job && job.state === "running");
    // A check is just a spinner; update/switch show their steps.
    const checking = running && job.kind === "check";
    const restoring = running && job.kind === "rollback";  // shown in Recovery
    const working = running && !checking && !restoring;
    let state, title, sub = "";
    // A running job wins: bootc's status may be stale or unavailable meanwhile.
    if (working) {
        state = "busy";
        title = job.kind === "switch" ? `${job.title}…` : "Updating the system…";
        sub = job.kind === "upgrade" && s && s.update ? `Version ${versionName(s.update)}`
            : "Keeps working as usual — the new version starts after a restart.";
    } else if (checking) {
        state = "busy"; title = "Checking for updates…";
        sub = s && s.booted ? `Now running ${versionName(s.booted)}` : "";
    } else if (restoring) {
        state = "busy"; title = "Restoring the previous version…";
        sub = "Progress in the “Recovery” card.";
    } else if (!s) {
        state = "busy"; title = "Loading…";
    } else if (!s.available) {
        state = "err"; title = "Updates unavailable"; sub = s.error || "";
    } else if (s.update) {
        state = "new"; title = `Update available: ${versionName(s.update)}`;
        sub = `Now running ${versionName(s.booted)}`;
    } else if (s.staged) {
        state = "ready"; title = `Version ${versionName(s.staged)} is waiting for a restart`;
        sub = `Now running ${versionName(s.booted)}.`;
    } else if (s.checked && s.checked.error) {
        state = "err"; title = "Couldn't check for updates"; sub = s.checked.error;
    } else if (s.checked && s.checked.time) {
        state = "ok"; title = "System is up to date";
        sub = `${versionName(s.booted)}${s.channel === "dev" ? " (testing)" : ""} · checked ${fmtAgo(s.checked.time)}`;
    } else {
        state = "ok"; title = `Version ${versionName(s.booted)}`; sub = "Not checked for updates yet";
    }
    setStatus("upd", state, ICONS[state], title, sub);
    renderSteps(job && (job.kind === "upgrade" || job.kind === "switch") ? job : null, $("job-steps"));
    renderSteps(job && job.kind === "rollback" ? job : null, $("rb-steps"));
    renderChannel(running);
    const avail = !!(s && s.available);
    // Restart replaces Update once a version is staged and nothing newer is out.
    const waiting = !running && avail && !!s.staged && !s.update;
    $("sys-upgrade").disabled = running || !(avail && s.update);
    $("sys-upgrade").hidden = waiting;
    $("sys-reboot-now").hidden = !waiting;
    $("sys-check").disabled = running || !avail;
    $("sys-check").classList.toggle("spin", checking);
    $("sys-switch").disabled = running;
    $("sys-rollback").disabled = running || !(avail && s.rollback);
    $("sys-rollback").textContent = avail && s.rollback_queued
        ? "Hold: restart now" : "Hold: restore previous version";
    const fb = s && s.fallback;
    if (!s) setStatus("rb-st", "busy", ICONS.busy, "Loading…");
    else if (restoring) setStatus("rb-st", "busy", ICONS.busy, "Restoring the previous version…",
        s.rollback ? `Going back to ${versionName(s.rollback)}` : "");
    else if (job && job.kind === "rollback" && job.state === "failed")
        setStatus("rb-st", "err", ICONS.err, "Couldn't restore", job.detail || "");
    else if (avail && s.rollback_queued) setStatus("rb-st", "ready", ICONS.ready, "The previous version starts after a restart",
        `${versionName(s.rollback)} is set as the default; ${versionName(s.booted)} runs until the restart.`);
    else if (!avail) setStatus("rb-st", "err", ICONS.err, "Restore unavailable", s.error || "");
    else if (fb) setStatus("rb-st", "warn", ICONS.warn, "The new version didn't start",
        rawVersion(fb.running) ? `Went back to ${rawVersion(fb.running)} (${fmtTime(fb.time * 1000)}).`
            : `Went back to the previous version (${fmtTime(fb.time * 1000)}).`);
    else if (s.rollback) setStatus("rb-st", "", ICONS.ready, `Previous version: ${versionName(s.rollback)}`,
        `Now running ${versionName(s.booted)}.`);
    else setStatus("rb-st", "off", ICONS.ready, "No previous version", `Now running ${versionName(s.booted)}.`);
    $("rb-hint").textContent = `Goes back by itself after ${AUTO_TRIES} failed starts. Shortcut: ${RECOVERY_HOLD_S} s in the ` +
        `${CORNER_NAMES[recoveryCorner()]} corner. Manually: Shift at boot.`;
    renderNotes();
}

function renderNotes() {
    const box = $("upd-notes"), n = sysNotes, s = sys;
    if (!n || !s || !s.available) { box.hidden = true; return; }
    const news = (s.update || s.staged) ? (n.news || []) : [];
    const list = news.length ? news : n.current ? [n.current] : [];
    if (!list.length) { box.hidden = true; return; }
    const key = (news.length ? "news:" : "cur:") + list.map(r => r.tag).join(",");
    box.hidden = false;
    if (box.dataset.key === key) return;  // keeps what's open/closed
    box.dataset.key = key;
    box.innerHTML = `<h3>${news.length ? "What's new" : "Changes in this version"}</h3>` + list.map((r, i) => `
        <details class="rel"${news.length && i === 0 ? " open" : ""}>
          <summary><span class="tag">${esc(r.tag)}</span><span class="date">${esc(fmtDate(r.date))}</span></summary>
          <div class="md">${r.notes ? md(r.notes) : '<p class="hint">No description.</p>'}</div>
        </details>`).join("");
}

// Components whose versions System shows (read by kioskd).
const COMPONENTS = [["kernel", "Linux kernel"], ["mesa", "Mesa (graphics)"], ["gtk", "GTK"],
    ["webkit", "WebKitGTK"], ["cage", "cage"], ["bootc", "bootc"], ["systemd", "systemd"]];

function renderSysInfo() {
    const info = $("sys-info"), s = sys;
    if (!s || !s.available) {
        info.innerHTML = `<dt>bootc</dt><dd>${esc((s && s.error) || "unavailable")}</dd>`;
        $("sys-more").hidden = true;
        return;
    }
    const b = s.booted || {};
    info.innerHTML = `
        <dt>Version</dt><dd>${esc(versionName(b))}</dd>
        <dt>Built</dt><dd>${esc(fmtTime(b.timestamp))}</dd>`;
    // The image and the parts' versions: folded, like the boot details.
    $("sys-parts").innerHTML = `
        <dt>Image</dt><dd>${esc(b.image || "—")}</dd>
        ${COMPONENTS.filter(([k]) => s.components && s.components[k])
            .map(([k, label]) => `<dt>${label}</dt><dd>${esc(s.components[k])}</dd>`).join("")}`;
    $("sys-more").hidden = false;
    if (!$("sys-image").value) $("sys-image").value = b.image || "";
}

// Auto-check on opening System if the last check is stale; at most once a
// minute (entering Settings also reloads System).
let autoCheckAt = 0;
function maybeAutoCheck() {
    if (!sys || !sys.available || sysWasRunning || currentTab !== "system") return;
    const t = sys.checked && sys.checked.time;
    if (t && Date.now() / 1000 - t < CHECK_EVERY) return;
    if (Date.now() - autoCheckAt < 60000) return;
    autoCheckAt = Date.now();
    startSysJob("/system/check");
}

function followSysJob() {
    followJob(job => {
        const was = sysWasRunning;
        sysJob = job && UPDATE_JOBS.includes(job.kind) ? job : null;
        sysWasRunning = !!(sysJob && sysJob.state === "running");
        if (was && !sysWasRunning) {
            if (sysJob && sysJob.state === "failed" && sysJob.kind !== "check") toast(sysJob.detail || "Update failed", true);
            else if (sysJob && sysJob.kind === "upgrade" && sysJob.result && !sysJob.result.update && !sysJob.result.staged) toast("System is up to date");
            // Rendered once the fresh status is in: the old one said "up to date".
            loadSystem();
        } else {
            renderUpdate();
            if (!sysWasRunning) maybeAutoCheck();
        }
    });
}

async function startSysJob(path) {
    try {
        sysJob = await api(path, {});
        sysWasRunning = true;
        renderUpdate();
        followSysJob();
    } catch (e) { toast(e.message, true); }
}

async function loadNotes() {
    try { sysNotes = await api("/system/changelog"); } catch (_) { return; }
    if (document.activeElement !== $("sys-repo") && sysNotes.repo) {
        $("sys-repo").value = sysNotes.repo;
    }
    renderSysInfo();
    renderUpdate();
}

async function loadSystem() {
    try { sys = await api("/system"); }
    catch (e) { sys = { available: false, error: e.message }; }
    renderSysInfo();
    renderUpdate();
    followSysJob();
    refreshDevice();
    loadTimezones();
    loadBoot();
    loadNotes();
}

/* Static markup, only values change, so fields keep their input. */
let hostSaved = null;
async function refreshDevice() {
    const i = await api("/info").catch(() => null);
    if (!i) return;
    renderBar(i);
    $("dev-model").textContent = i.device.product || "—";
    $("dev-vendor").textContent = i.device.vendor || "—";
    $("dev-cpu").textContent = i.device.cpu || "—";
    $("dev-mem").textContent = i.device.memory_mb ? `${(i.device.memory_mb / 1024).toLocaleString(LOCALE(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB` : "—";
    const h = $("host-name");
    if (hostSaved !== i.hostname && (document.activeElement !== h && (hostSaved === null || h.value === hostSaved))) {
        h.value = i.hostname;
        $("host-save").disabled = true;
    }
    hostSaved = i.hostname;
    if (tzZones && i.timezone !== tzCurrent && document.activeElement !== $("tz-city")) {
        tzCurrent = i.timezone;
        renderTz();
    }
}

/* Top bar: battery and clock. */
function batteryIcon(p) {
    const lvl = Math.max(0, Math.min(100, p.battery));
    const charging = p.battery_status === "Charging" || (p.ac_online === true && p.battery_status !== "Full");
    const fill = charging || p.battery_status === "Full" ? "var(--ok)"
        : lvl <= 10 ? "var(--bad)" : lvl <= 20 ? "var(--warn)" : "var(--text)";
    const w = (21 * lvl / 100).toFixed(1);
    return `<svg viewBox="0 0 32 16" width="36" height="18" aria-hidden="true">
        <rect x="1" y="1" width="26" height="14" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".75"/>
        <rect x="28.2" y="5" width="2.6" height="6" rx="1.2" fill="currentColor" opacity=".75"/>
        <rect x="3.5" y="3.5" width="${w}" height="9" rx="1.8" fill="${fill}"/>
        ${charging ? '<path d="M15.6 1.8 10.4 9h3.7l-1.5 5.2 5.3-7.4h-3.8z" fill="#fff" stroke="var(--bg)" stroke-width="1" stroke-linejoin="round"/>' : ""}
      </svg>`;
}

let clockBase = null;  // {sec: seconds since midnight from kioskd, at: performance.now()}
function renderClock() {
    if (!clockBase) return;
    const t = Math.floor(clockBase.sec + (performance.now() - clockBase.at) / 1000) % 86400;
    const hh = String(Math.floor(t / 3600)).padStart(2, "0"), mm = String(Math.floor(t / 60) % 60).padStart(2, "0");
    $("clock").textContent = `${hh}:${mm}`;
}
// kioskd's clock, not the browser's: WebKit keeps its startup time zone.
function setClock(time) {
    const m = /(\d\d):(\d\d):(\d\d)$/.exec(time || "");
    if (!m) return;
    clockBase = { sec: +m[1] * 3600 + +m[2] * 60 + +m[3], at: performance.now() };
    renderClock();
}

function renderBar(i) {
    setClock(i.time);
    const p = i.power, b = $("batt");
    if (p.battery != null) {
        b.innerHTML = `${batteryIcon(p)}<span>${p.battery}%</span>`;
        b.title = powerText(p);
        b.hidden = false;
    } else if (p.ac_online === true) {
        b.innerHTML = `<span class="plug">${ICONS.plug}</span>`;
        b.hidden = false;
    } else {
        b.hidden = true;
    }
    barNet = i.net;
    renderNetbar();
}

// Wi-Fi signal + name or Ethernet; while waiting for the HMI, what it waits for.
let barNet = null;
function renderNetbar() {
    const n = barNet, nb = $("netbar");
    nb.classList.toggle("waiting", hmiWaiting);
    if (hmiWaiting) {
        nb.hidden = false;
        nb.innerHTML = `${ICONS.busy}<span>${n ? "Connecting to HMI…" : "Waiting for network…"}</span>`;
        nb.title = n ? `${n.name}: the HMI isn't answering yet, the kiosk will switch to it by itself`
            : "The kiosk switches to the HMI once there's a network and the HMI answers";
        return;
    }
    nb.hidden = !n;
    if (n) {
        const icon = n.type === "wifi" ? wifiIcon(n.signal != null ? sigLevel(n.signal) : 3) : ICONS.ethernet;
        nb.innerHTML = `${icon}<span>${esc(n.type === "wifi" ? n.name : "Ethernet")}</span>`;
        nb.title = n.type === "wifi" && n.signal != null ? `${n.name} · signal ${n.signal}%` : n.name;
    }
}

let tzZones = null, tzCurrent = null;
const TZ_REGIONS = {
    Africa: "Africa", America: "America", Antarctica: "Antarctica", Arctic: "Arctic", Asia: "Asia",
    Atlantic: "Atlantic", Australia: "Australia", Europe: "Europe", Indian: "Indian Ocean",
    Pacific: "Pacific", Other: "Other",
};
const tzSplit = z => { const k = z.indexOf("/"); return k < 0 ? ["Other", z] : [z.slice(0, k), z.slice(k + 1)]; };

async function loadTimezones() {
    if (!tzZones) {
        try { const r = await api("/timezones"); tzZones = r.zones; tzCurrent = r.current; }
        catch (_) { return; }
    }
    renderTz();
}

function renderTz(region) {
    const [curRegion] = tzSplit(tzCurrent || "UTC");
    region = region || curRegion;
    const regions = [...new Set(tzZones.map(z => tzSplit(z)[0]))];
    $("tz-region").innerHTML = regions.map(r =>
        `<option value="${esc(r)}"${r === region ? " selected" : ""}>${esc(TZ_REGIONS[r] || r)}</option>`).join("");
    const chosen = region === curRegion ? tzCurrent : "";
    $("tz-city").innerHTML = (chosen ? "" : '<option value="" selected>— choose —</option>') +
        tzZones.filter(z => tzSplit(z)[0] === region).map(z =>
            `<option value="${esc(z)}"${z === chosen ? " selected" : ""}>${esc(tzSplit(z)[1].replace(/_/g, " ").replace(/\//g, " / "))}</option>`).join("");
}

// Short labels: the legend is one line.
const BOOT_PHASES = {
    firmware: ["UEFI", "#6e7681"], loader: ["GRUB", "#d29922"], kernel: ["Kernel", "#db6d28"],
    initrd: ["initramfs", "#a371f7"], userspace: ["Services", "#2f81f7"], hmi: ["HMI", "#3fb950"],
};
// Non-breaking space: "13.3 s" never wraps.
const secs = (v, d = 1) => v.toLocaleString(LOCALE(), { minimumFractionDigits: d, maximumFractionDigits: d }) + " s";

let bootLoaded = false;
async function loadBoot() {
    // First load reads the journal (slow): spinner. Later ones hit kioskd's cache.
    if (!bootLoaded) {
        setStatus("boot-st", "busy", ICONS.busy, "Loading boot time…", "Reading this boot's journal");
        // The bar runs a loading animation until the phases are in.
        $("boot-bar").innerHTML = "";
        $("boot-bar").classList.add("loading");
        $("boot-bar").hidden = false;
        $("boot-legend").hidden = true;
    }
    let b;
    try { b = await api("/boot"); bootLoaded = true; }
    catch (e) {
        $("boot-bar").classList.remove("loading");
        $("boot-bar").hidden = true;
        setStatus("boot-st", "err", ICONS.err, "No boot data", e.message);
        return;
    }
    $("boot-bar").classList.remove("loading");
    const ph = Object.fromEntries((b.phases || []).map(p => [p.name, p.sec]));
    const before = (ph.firmware || 0) + (ph.loader || 0);   // UEFI + GRUB
    const kernelToDone = (ph.kernel || 0) + (ph.initrd || 0) + (ph.userspace || 0);
    // systemd's phases, then the HMI's first paint (kiosk-shell) after them.
    const segs = Object.keys(BOOT_PHASES).filter(k => ph[k] != null).map(k => [k, ph[k]]);
    if (b.hmi_shown != null && b.hmi_shown > kernelToDone) segs.push(["hmi", b.hmi_shown - kernelToDone]);
    const total = segs.reduce((a, [, v]) => a + v, 0);
    const ready = before + kernelToDone;
    if (b.hmi_shown != null) {
        setStatus("boot-st", "", ICONS.clock, `HMI after ${secs(before + b.hmi_shown)} from power-on`,
                  `system ready after ${secs(ready)}, ${secs(before)} of it before the kernel started (UEFI + GRUB)`);
    } else if (b.total) {
        setStatus("boot-st", "", ICONS.clock, `System ready after ${secs(ready)}`,
                  "The HMI hasn't shown yet (no address, or the server isn't answering)");
    } else {
        setStatus("boot-st", "busy", ICONS.busy, "Still booting", b.error || "");
    }
    $("boot-bar").hidden = $("boot-legend").hidden = !total;
    $("boot-bar").innerHTML = segs.map(([k, v]) =>
        `<i style="flex:${v} 1 0;background:${BOOT_PHASES[k][1]}"></i>`).join("");
    $("boot-legend").innerHTML = segs.map(([k, v]) =>
        `<span><i style="background:${BOOT_PHASES[k][1]}"></i>${esc(BOOT_PHASES[k][0])} <b>${secs(v)}</b></span>`).join("");

    const marks = [...(b.milestones || [])];
    if (b.hmi_shown != null) marks.push({ t: b.hmi_shown, label: "HMI visible", hmi: true });
    marks.sort((x, y) => x.t - y.t);
    const KEY = /switch-root|sysinit|graphical|cage/;
    $("boot-timeline").innerHTML = marks.map(m =>
        `<li class="${m.hmi ? "hmi" : KEY.test(m.label) ? "key" : ""}"><span class="t">${secs(m.t)}</span><span class="dot"></span><span class="l">${esc(m.label)}</span></li>`).join("");
    const slow = b.slowest || [];
    const max = Math.max(...slow.map(u => u.dur), 0.001);
    $("boot-slow").innerHTML = slow.map(u =>
        `<li class="${u.phase}"><span class="d">${secs(u.dur)}</span><span class="u">${esc(u.unit)}</span>` +
        `<span class="badge${u.phase === "initrd" ? " new" : ""}">${u.phase === "initrd" ? "initramfs" : `@${secs(u.start)}`}</span>` +
        `<span class="meter"><i style="width:${(u.dur / max * 100).toFixed(1)}%"></i></span></li>`).join("");
    // Critical chains: what local-fs and the kiosk waited for.
    $("boot-chains").innerHTML = (b.chains || []).filter(c => c.steps && c.steps.length).map(c =>
        `<h3>What the boot waited for: ${esc(c.title)}</h3><ul class="chain">` +
        c.steps.map((s, i) =>
            `<li style="--d:${Math.min(i, 8)}"><span class="t">${s.at != null ? secs(s.at) : ""}</span>` +
            `<span class="u">${esc(s.unit)}</span>` +
            `<span class="d${s.took >= 1 ? " long" : ""}">${s.took != null ? "+" + secs(s.took) : ""}</span></li>`).join("") +
        `</ul>`).join("");
    $("boot-more").hidden = !marks.length && !slow.length;

    const problems = [
        ...(b.failed && b.failed.length ? [`Failed to start: ${b.failed.join(", ")}`] : []),
        ...(b.journal_error ? [`No boot timeline (journalctl: ${b.journal_error})`] : []),
    ];
    $("boot-failed").textContent = problems.join(" · ");
    $("boot-failed").hidden = !problems.length;
}

function initSystem() {
    // The upgrade job checks first; downloads only if newer.
    $("sys-upgrade").addEventListener("click", () => startSysJob("/system/upgrade"));
    $("sys-check").addEventListener("click", () => startSysJob("/system/check"));
    $("chan").addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b || b.disabled) return;
        chanPick = b.dataset.v;
        renderChannel(!!(sysJob && sysJob.state === "running"));
    });
    holdButton($("chan-switch"), () => api("/system/channel", { channel: chanPick })
        .then(j => { chanPick = null; sysJob = j; sysWasRunning = true; renderUpdate(); followSysJob(); })
        .catch(e => toast(e.message, true)));
    holdButton($("sys-switch"), () => api("/system/switch", { image: $("sys-image").value.trim() })
        .then(j => { sysJob = j; sysWasRunning = true; renderUpdate(); followSysJob(); })
        .catch(e => toast(e.message, true)));
    // A kioskd job: bootc rollback, then restart.
    holdButton($("sys-rollback"), () => api("/system/rollback", {})
        .then(j => { sysJob = j; sysWasRunning = true; renderUpdate(); followSysJob(); })
        .catch(e => toast(e.message, true)));
    const power = action => () => api("/power", { action }).then(() => toast(action === "reboot" ? "Restarting…" : "Shutting down…"))
        .catch(e => toast(e.message, true));
    holdButton($("sys-reboot-now"), power("reboot"));
    holdButton($("pw-reboot"), power("reboot"));
    // kioskd restarts the kiosk a second later, as freshly installed.
    holdButton($("pw-reset"), () => api("/settings/reset", {})
        .then(() => toast("Resetting everything — the kiosk restarts like after installation"))
        .catch(e => toast(e.message, true)));
    holdButton($("pw-off"), power("poweroff"));

    holdButton($("sys-repo-save"), () => api("/config", { releases_repo: $("sys-repo").value })
        .then(c => {
            cfg = c;
            $("sys-repo").value = cfg.releases_repo;
            $("sys-repo").blur();
            toast(`Changelog from ${cfg.releases_repo}`);
            $("upd-notes").dataset.key = "";
            return loadNotes();
        })
        .catch(e => toast(e.message, true)));

    // Saved in kioskd; i18n.use reloads the page in it.
    seg($("lang"), cfg.language || "en", v => {
        if (v === (cfg.language || "en")) return;
        saveCfg({ language: v }).then(c => i18n.use(c.language)).catch(e => toast(e.message, true));
    });
    $("host-name").addEventListener("input", e => { $("host-save").disabled = e.target.value === hostSaved; });
    $("host-save").addEventListener("click", e => busy(e.currentTarget, async () => {
        const r = await api("/hostname", { hostname: $("host-name").value });
        hostSaved = r.hostname;
        $("host-name").value = r.hostname;
        $("host-name").blur();
        toast(`Host name: ${r.hostname}. The router will see it on its next connection.`);
    }).then(() => { $("host-save").disabled = true; }).catch(() => {}));

    $("tz-region").addEventListener("change", e => renderTz(e.target.value));
    $("tz-city").addEventListener("change", e => {
        const tz = e.target.value;
        if (!tz) return;
        api("/timezone", { timezone: tz }).then(r => {
            tzCurrent = r.timezone;
            setClock(r.time);
            renderTz();
            toast(`Time zone: ${r.timezone}`);
        }).catch(err => { toast(err.message, true); renderTz(); });
    });

    // Ticked locally: the bar clock and a running step's time.
    setInterval(renderClock, 1000);
    setInterval(() => {
        if (sysJob && sysJob.state === "running") {
            renderSteps(sysJob.kind === "rollback" ? null : sysJob, $("job-steps"));
            renderSteps(sysJob.kind === "rollback" ? sysJob : null, $("rb-steps"));
        }
    }, 1000);
}

/* Live updates via SSE (/api/events): kioskd names changed topics and
   handlers[topic] reloads that part. onReconnect catches up after a drop. */
function listen(handlers, onReconnect) {
    let opened = false;
    const es = new EventSource("/api/events");
    es.addEventListener("change", e => {
        let topics = [];
        try { topics = JSON.parse(e.data); } catch (_) { return; }
        for (const t of topics) handlers[t]?.();
    });
    es.addEventListener("open", () => {
        if (opened) onReconnect();
        opened = true;
    });
}

// Under the HMI only job progress updates; kioskShown reloads on return.
function initEvents() {
    const vis = fn => () => { if (settingsVisible) fn(); };
    const net = () => {
        refreshDevice();
        if (currentTab === "net") { loadWifi(false, true); loadNet(true); }
    };
    const config = () => api("/config").then(c => { cfg = c; if (currentTab === "screen") loadScreen(); }).catch(() => {});
    const system = () => { if (currentTab === "system") loadSystem(); };
    listen({
        net: vis(net), power: vis(refreshDevice), clock: vis(refreshDevice), device: vis(refreshDevice),
        splash: vis(() => { if (currentTab === "screen" || currentTab === "system") loadSplash(); }),
        config: vis(config),
        boot: vis(() => { if (currentTab === "system") loadBoot(); }),
        system: vis(system),
        job: () => jobTick?.(),
    }, () => { if (settingsVisible) { net(); config(); system(); } jobTick?.(); });
}

async function initSettings() {
    $("settings").hidden = false;
    $("back").addEventListener("click", () => shell("show-hmi"));
    $("tabs").addEventListener("click", e => {
        const b = e.target.closest("button");
        if (b) showTab(b.dataset.tab);
    });
    initHmi();
    initWifi();
    initScreen();
    initSystem();
    refreshDevice();
    initEvents();
    if (location.hash === "#recovery") openRecovery(); else showTab("hmi");
}

/* ======================================================= INSTALLER */

let chosenDisk = null;

async function loadInstaller() {
    let st;
    try { st = await api("/installer"); }
    catch (e) { msg($("inst-msg"), e.message, "err"); return; }
    const p = st.payload;
    $("inst-payload").innerHTML = p ? `
        <dt>System</dt><dd>${esc(p.image || "immutable-kiosk")}</dd>
        <dt>Version</dt><dd>${esc(p.version || "—")}</dd>
        <dt>Size</dt><dd>${p.size ? fmtSize(p.size) : "—"}</dd>` : `<dt>Error</dt><dd>No system image on the drive</dd>`;

    const list = $("inst-disks");
    list.innerHTML = "";
    const usable = st.disks.filter(d => !d.is_boot_medium && (!p || !p.size || d.size >= p.size));
    if (!chosenDisk || !usable.some(d => d.name === chosenDisk)) chosenDisk = usable[0]?.name || null;
    for (const d of st.disks) {
        const li = document.createElement("li");
        const ok = usable.includes(d);
        const why = d.is_boot_medium ? "installation drive" : !ok ? "too small" : d.internal ? "internal" : "external";
        li.innerHTML = `<div class="item ${d.name === chosenDisk ? "on" : ""} ${ok ? "" : "off"}">
            <div class="name">${esc(d.model || d.name)} <span class="sub">${esc(d.path)}</span>
              <div class="sub">${fmtSize(d.size)} · ${esc(why)}</div></div>
            ${d.name === chosenDisk ? '<span class="badge ok">selected</span>' : ""}</div>`;
        if (ok) li.addEventListener("click", () => { chosenDisk = d.name; loadInstaller(); });
        list.appendChild(li);
    }
    if (!st.disks.length) list.innerHTML = '<li class="empty">No disks found.</li>';

    const pw = st.power;
    $("inst-power").hidden = pw.ac_online !== false;
    $("inst-power").textContent = `The tablet is on battery${pw.battery != null ? ` (${pw.battery}%)` : ""}. Plug in the charger before installing.`;
    $("inst-go").disabled = !p || !chosenDisk;
}

function renderInstallJob(job) {
    if (!job || job.kind !== "install") return;
    $("inst-choose").hidden = true;
    $("inst-progress").hidden = false;
    renderJob(job, { box: $("inst-progress"), stage: $("inst-stage"), bar: $("inst-bar"), detail: $("inst-detail") });
    $("inst-progress").hidden = false;
    $("inst-log").textContent = job.log.join("\n");
    const done = job.state === "done", failed = job.state === "failed";
    $("inst-title").textContent = done ? "Installed ✔" : failed ? "Installation failed" : "Installing…";
    $("inst-note").textContent = done ? "Remove the USB drive, then restart the tablet."
        : failed ? job.detail : "Don't turn off the tablet or remove the USB drive.";
    $("inst-done").hidden = !done;
    $("inst-failed").hidden = !failed;
}

async function initInstaller() {
    $("installer").hidden = false;
    document.title = "Installer";
    holdButton($("inst-go"), async () => {
        msg($("inst-msg"), "");
        try {
            await api("/installer/start", { disk: chosenDisk });
            followJob(renderInstallJob);
        } catch (e) { msg($("inst-msg"), e.message, "err"); }
    });
    holdButton($("inst-reboot"), () => api("/power", { action: "reboot" }).catch(e => toast(e.message, true)));
    $("inst-retry").addEventListener("click", () => {
        $("inst-progress").hidden = true;
        $("inst-choose").hidden = false;
        loadInstaller();
    });
    await loadInstaller();
    // Resume a job already running (page reloaded mid-install).
    followJob(renderInstallJob);
    const refresh = () => { if (!$("inst-choose").hidden) loadInstaller(); };
    listen({ disks: refresh, power: refresh, job: () => jobTick?.() }, () => { refresh(); jobTick?.(); });
}

/* ======================================================= boot */

(async () => {
    for (let i = 0; ; i++) {
        try { cfg = await api("/config"); break; }
        catch (_) { await new Promise(r => setTimeout(r, Math.min(500 * (i + 1), 3000))); }
    }
    i18n.use(cfg.language);  // reloads the page if it started in another one
    applyAccent(cfg.accent);
    if (cfg.mode === "installer") initInstaller(); else initSettings();
})();
