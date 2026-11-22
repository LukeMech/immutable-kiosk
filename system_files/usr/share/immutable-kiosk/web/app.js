/* immutable-kiosk Settings / Installer page. Talks to kioskd (same origin,
   /api/*, header X-Kiosk: 1) and to kiosk-shell through the "kiosk" WebKit
   message handler. Plain DOM, no framework, no network beyond localhost. */
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

/* Icons (24x24, stroked) -- the status lines and list rows share them. */
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const wifiIcon = level => svg(  // level 0-3: how many arcs are lit
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

/* Fill a status line (see .status in app.css): <id>, <id>-icon, -title, -sub. */
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
        if (timer) { cancel(); toast("Przytrzymaj przycisk dłużej"); }
    }));
}

const fmtSize = b => b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : (b / 1e6).toFixed(0) + " MB";
const fmtTime = t => t ? new Date(t).toLocaleString("pl-PL") : "—";

/* ======================================================= SETTINGS */

let cfg = null;

// "Ładowarka podłączona · bateria 72% (ładowanie)" -- parts that are unknown
// are left out instead of shown as "—".
function powerText(p) {
    const parts = [];
    if (p.ac_online === true) parts.push("ładowarka podłączona");
    else if (p.ac_online === false) parts.push("na baterii");
    if (p.battery != null) {
        const st = { Charging: "ładowanie", Full: "naładowana", "Not charging": "nie ładuje" }[p.battery_status];
        parts.push(`bateria ${p.battery}%${st ? ` (${st})` : ""}`);
    }
    return parts.length ? parts.join(" · ") : "brak danych";
}

// Extra scroll room at the bottom only while the on-screen keyboard is up.
window.addEventListener("kiosk-osk", e => document.body.classList.toggle("osk-open", e.detail.open));
let currentTab = "hmi";

function showTab(name) {
    currentTab = name;
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
    document.querySelectorAll(".tab").forEach(s => { s.hidden = s.id !== "tab-" + name; });
    ({ hmi: loadHmi, wifi: () => loadWifi(false), net: loadNet, screen: loadScreen, system: loadSystem })[name]();
}

// kiosk-shell calls this whenever Settings becomes visible.
window.kioskShown = () => { if (cfg && cfg.mode !== "installer") showTab(currentTab); };

/* ---------- HMI */
let hmiDraft = null;

let hmiTest = null;  // last "Sprawdź połączenie": {url, busy} or {url, ok, message}

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
        setStatus("hmi-st", "warn", ICONS.warn, "Brak adresu HMI", "Podaj adres serwera HMI, żeby wyświetlić wizualizację.");
        return;
    }
    const unsaved = url !== (cfg && cfg.hmi_url);
    const t = hmiTest && hmiTest.url === url ? hmiTest : null;
    const note = unsaved ? "Niezapisane — „Zapisz i otwórz HMI”" : "";
    if (t && t.busy) setStatus("hmi-st", "busy", ICONS.busy, url, "Sprawdzanie połączenia…");
    else if (t) setStatus("hmi-st", t.ok ? "ok" : "err", t.ok ? ICONS.ok : ICONS.err, url, [t.message, note].filter(Boolean).join(" · "));
    else setStatus("hmi-st", unsaved ? "new" : "", ICONS.screen, url, note || "Zapisany adres wizualizacji");
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
        // Switching protocol on a TwinCAT default port follows to the other default.
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
        toast("Zapisano");
    }));
}

/* ---------- Wi-Fi */
const sigLevel = s => s >= 70 ? 3 : s >= 45 ? 2 : 1;
let openSsid = null;
let wifiLast = null;      // last GET /wifi
let wifiOverride = null;  // {state, icon, title, sub} while connecting / after a failed connect

function renderWifiStatus() {
    const w = wifiLast, o = wifiOverride;
    if (o) return setStatus("wifi-st", o.state, o.icon, o.title, o.sub);
    if (!w) return setStatus("wifi-st", "busy", ICONS.busy, "Wczytywanie…");
    const d = w.device;
    if (!d) return setStatus("wifi-st", "err", ICONS.wifiOff, "Brak karty Wi-Fi", "Tablet nie zgłasza żadnego adaptera Wi-Fi.");
    if (!w.enabled) return setStatus("wifi-st", "off", ICONS.wifiOff, "Wi-Fi wyłączone", "Włącz przełącznikiem obok tytułu.");
    if (d.state.startsWith("connecting")) return setStatus("wifi-st", "busy", ICONS.busy, `Łączenie z ${d.connection || "siecią"}…`, "");
    if (d.state.startsWith("connected")) {
        const n = w.networks.find(x => x.in_use);
        const sub = [d.address, n ? `sygnał ${n.signal}%` : ""].filter(Boolean).join(" · ");
        return setStatus("wifi-st", "ok", wifiIcon(n ? sigLevel(n.signal) : 3), `Połączono z ${n ? n.ssid : d.connection}`, sub);
    }
    setStatus("wifi-st", "warn", wifiIcon(0), "Nie połączono", w.networks.length ? "Wybierz sieć z listy poniżej." : "W pobliżu nie widać żadnej sieci.");
}

async function loadWifi(rescan) {
    if (rescan) wifiOverride = { state: "busy", icon: ICONS.busy, title: "Szukanie sieci…" };
    renderWifiStatus();
    let w;
    try { w = await api("/wifi" + (rescan ? "?rescan=1" : "")); }
    catch (e) {
        wifiOverride = { state: "err", icon: ICONS.err, title: "Nie udało się odczytać Wi-Fi", sub: e.message };
        renderWifiStatus();
        return;
    }
    if (wifiOverride && wifiOverride.state === "busy") wifiOverride = null;
    wifiLast = w;
    $("wifi-radio").checked = w.enabled;
    renderWifiStatus();
    const list = $("wifi-list");
    list.innerHTML = w.networks.length ? "" : `<li class="empty">${w.enabled ? "Nie znaleziono sieci." : "Wi-Fi jest wyłączone."}</li>`;
    for (const n of w.networks) {
        const li = document.createElement("li");
        const sec = n.security ? `zabezpieczona · ${esc(n.security)}` : "otwarta";
        li.innerHTML = `<div class="item${n.in_use ? " static" : ""}">
            <span class="ico${n.in_use ? " ok" : ""}">${wifiIcon(sigLevel(n.signal))}</span>
            <div class="name">${esc(n.ssid)}<div class="sub">${sec} · ${n.signal}%</div></div>
            ${n.in_use ? '<span class="badge ok">połączono</span>' : n.saved ? '<span class="badge">zapisana</span>' : ""}
          </div>`;
        const item = li.querySelector(".item");
        list.appendChild(li);
        if (n.in_use) continue;
        const ex = document.createElement("div");
        ex.className = "expand";
        ex.hidden = openSsid !== n.ssid;
        item.classList.toggle("open", !ex.hidden);
        ex.innerHTML = (n.security ? `<label>Hasło${n.saved ? " (puste = zapisane)" : ""}
                <input type="password" autocomplete="off"></label>` : "") +
            `<div class="actions"><button class="btn primary">Połącz</button></div>`;
        const btn = ex.querySelector("button");
        btn.addEventListener("click", () => busy(btn, async () => {
            const pass = ex.querySelector("input")?.value || "";
            wifiOverride = { state: "busy", icon: ICONS.busy, title: `Łączenie z ${n.ssid}…`, sub: "To może potrwać do minuty." };
            renderWifiStatus();
            try {
                await api("/wifi/connect", { ssid: n.ssid, password: pass });
                wifiOverride = null;
                openSsid = null;
            } catch (e) {
                wifiOverride = { state: "err", icon: ICONS.err, title: `Nie udało się połączyć z ${n.ssid}`, sub: e.message };
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
            if (!ex.hidden) ex.querySelector("input")?.focus();
        });
        li.appendChild(ex);
    }
    const saved = $("wifi-saved");
    saved.innerHTML = w.saved.length ? "" : '<li class="empty">Brak zapisanych sieci.</li>';
    for (const s of w.saved) {
        const li = document.createElement("li");
        li.innerHTML = `<div class="item static">
            <span class="ico${s.active ? " ok" : ""}">${wifiIcon(s.active ? 3 : 0)}</span>
            <div class="name">${esc(s.ssid)}${s.active ? '<div class="sub">aktywna</div>' : ""}</div>
            <button class="btn danger hold" data-hold="1000">Zapomnij</button></div>`;
        const b = li.querySelector("button");
        holdButton(b, () => busy(b, async () => {
            await api("/wifi/forget", { uuid: s.uuid });
            toast(`Usunięto ${s.ssid}`);
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
    $("wifi-radio").addEventListener("change", e => {
        wifiOverride = null;
        api("/wifi/radio", { enabled: e.target.checked })
            .then(() => loadWifi(e.target.checked)).catch(err => toast(err.message, true));
    });
    $("hid-connect").addEventListener("click", e => busy(e.currentTarget, async () => {
        const ssid = $("hid-ssid").value.trim();
        await api("/wifi/connect", { ssid, password: $("hid-pass").value, hidden: true });
        $("hid-pass").value = "";
        toast(`Połączono z ${ssid}`);
        await loadWifi(false);
    }).catch(() => {}));
}

/* ---------- Network (IP) */
const statusHtml = (state, icon, title, sub) => `<div class="status ${state}"><div class="status-icon">${icon}</div>
    <div class="status-text"><div class="status-title">${esc(title)}</div><div class="status-sub">${esc(sub)}</div></div></div>`;

async function loadNet() {
    const box = $("net-list");
    let n;
    const lone = (state, icon, title, sub) => `<div class="card"><h2>Połączenie</h2>${statusHtml(state, icon, title, sub)}</div>`;
    try { n = await api("/network"); }
    catch (e) { box.innerHTML = lone("err", ICONS.err, "Nie udało się odczytać sieci", e.message); return; }
    if (!n.connections.length) {
        box.innerHTML = lone("warn", ICONS.warn, "Brak aktywnego połączenia",
            "Połącz się z siecią Wi-Fi albo podłącz kabel (adapter USB-Ethernet).");
        return;
    }
    box.innerHTML = "";
    for (const c of n.connections) {
        const el = document.createElement("div");
        el.className = "card";
        const cur = c.current;
        const kind = c.type === "wifi" ? "Wi-Fi" : c.type === "ethernet" ? "Ethernet" : c.type;
        const has = cur.addresses.length > 0;
        const how = c.method === "manual" ? "adres statyczny" : "adres z DHCP";
        el.innerHTML = `<h2>${esc(kind)}</h2>` +
          statusHtml(has ? "ok" : "busy", has ? (c.type === "wifi" ? wifiIcon(3) : ICONS.ethernet) : ICONS.busy,
                     c.name, has ? `${cur.addresses.join(", ")} · ${how}` : "Czekam na adres IP…") + `
          <dl class="kv">
            <dt>Brama</dt><dd>${esc(cur.gateway || "—")}</dd>
            <dt>DNS</dt><dd>${esc(cur.dns.join(", ") || "—")}</dd>
            <dt>Interfejs</dt><dd>${esc(c.device || "—")}</dd>
          </dl>
          <div class="sep"><h3>Adresowanie IPv4</h3>
          <div class="seg"><button data-v="auto">Automatycznie (DHCP)</button><button data-v="manual">Statyczny adres</button></div>
          <div class="manual">
            <div class="grid2">
              <label>Adres IP<input name="address" type="text" inputmode="decimal" placeholder="192.168.1.20"></label>
              <label>Maska (prefiks)<input name="prefix" type="text" inputmode="numeric" placeholder="24"></label>
            </div>
            <label>Brama<input name="gateway" type="text" inputmode="decimal" placeholder="192.168.1.1"></label>
            <div class="grid2">
              <label>DNS 1<input name="dns1" type="text" inputmode="decimal"></label>
              <label>DNS 2<input name="dns2" type="text" inputmode="decimal"></label>
            </div>
          </div>
          <p class="msg"></p>
          <div class="actions"><button class="btn primary save">Zastosuj</button></div></div>`;
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
        save.addEventListener("click", () => busy(save, async () => {
            await api("/network", {
                uuid: c.uuid, method, address: f("address").value, prefix: Number(f("prefix").value),
                gateway: f("gateway").value, dns: [f("dns1").value, f("dns2").value],
            });
            msg(m, "Zastosowano. Połączenie jest odnawiane…", "ok");
            setTimeout(loadNet, 4000);
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

function loadScreen() {
    const names = { portrait: "pion", landscape: "poziom", normal: "0°", 90: "90°", 180: "180°", 270: "270°" };
    seg($("rot"), cfg.rotation || "", v => saveCfg({ rotation: v || null }).then(loadScreen).catch(e => toast(e.message, true)));
    $("rot-hint").textContent = `Teraz: ${names[cfg.rotation_effective] || cfg.rotation_effective}` +
        (cfg.rotation ? "" : " (domyślna dla tego urządzenia)");
    $("scale-val").textContent = Math.round((cfg.scale || 1) * 100) + "%";
    // No backlight device (e.g. "basic graphics" boot): no slider.
    const b = cfg.brightness ?? cfg.brightness_now;
    $("bright-card").hidden = cfg.brightness_now == null;
    if (b != null) {
        $("bright").value = b;
        $("bright-val").textContent = b + "%";
    }
    seg($("corner"), cfg.settings_corner, v => saveCfg({ settings_corner: v }).then(loadScreen).catch(e => toast(e.message, true)));
    $("corner-hint").textContent = `Awaryjnie: przytrzymanie przez ${RECOVERY_HOLD_S} s przeciwległego rogu ` +
        `(${CORNER_NAMES[recoveryCorner()]}) — w HMI i w ustawieniach — otwiera System → Przywracanie i zasilanie.`;
}

/* Recovery corner (kiosk-shell): the corner opposite the Settings one, held
   RECOVERY_HOLD_S over the HMI or Settings, opens the page with #recovery. */
const RECOVERY_HOLD_S = 3;
const CORNER_NAMES = { "top-left": "↖ lewy górny", "top-right": "↗ prawy górny", "bottom-left": "↙ lewy dolny", "bottom-right": "↘ prawy dolny" };
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
    setTimeout(go, 900);  // System's cards above fill in asynchronously and push it down
    card.classList.remove("flash");
    void card.offsetWidth;  // restart the animation
    card.classList.add("flash");
}
window.addEventListener("hashchange", () => { if (location.hash === "#recovery") openRecovery(); });

function initScreen() {
    // Whole-screen scaling in 10% steps (WebKit zoom in kiosk-shell: sharp at
    // any value).
    const scaleStep = d => saveCfg({ scale: Math.min(2, Math.max(1, Math.round(((cfg.scale || 1) + d) * 10) / 10)) })
        .then(loadScreen).catch(e => toast(e.message, true));
    $("scale-minus").addEventListener("click", () => scaleStep(-0.1));
    $("scale-plus").addEventListener("click", () => scaleStep(0.1));

    // HMI zoom (card in the HMI tab).
    const zoomStep = d => saveCfg({ zoom: Math.min(3, Math.max(0.5, Math.round((cfg.zoom + d) * 10) / 10)) })
        .then(c => { $("zoom-val").textContent = Math.round(c.zoom * 100) + "%"; })
        .catch(e => toast(e.message, true));
    $("zoom-minus").addEventListener("click", () => zoomStep(-0.1));
    $("zoom-plus").addEventListener("click", () => zoomStep(0.1));

    // Brightness follows the finger: applied while dragging (throttled, one
    // request in flight), the last value always sent. Straight to kioskd, not
    // saveCfg: kiosk-shell has nothing to reload for it.
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
let pollTimer = null;

function renderJob(job, { box, stage, bar, detail }) {
    box.hidden = !job;
    if (!job) return;
    stage.textContent = job.state === "failed" ? `${job.title}: błąd` : (job.stage || job.title);
    const wrap = bar.parentElement;
    wrap.classList.toggle("indet", job.state === "running" && job.fraction == null);
    bar.style.width = ((job.state === "done" ? 1 : job.fraction || 0) * 100).toFixed(1) + "%";
    bar.style.background = job.state === "failed" ? "var(--bad)" : job.state === "done" ? "var(--ok)" : "";
    detail.textContent = job.detail || "";
}

function pollJob(onUpdate) {
    clearTimeout(pollTimer);
    const tick = async () => {
        let job = null;
        try { job = (await api("/job")).job; } catch (_) { /* kioskd restarting */ }
        onUpdate(job);
        if (job && job.state === "running") pollTimer = setTimeout(tick, 700);
    };
    tick();
}

const sysJobEls = () => ({ box: $("job"), stage: $("job-stage"), bar: $("job-bar"), detail: $("job-detail") });

let sys = null;          // GET /system (bootc status + last check)
let sysJob = null;       // last update-ish job (check / upgrade / switch)
let sysWasRunning = false;
let sysNotes = null;     // GET /system/changelog (GitHub releases)
const UPDATE_JOBS = ["check", "upgrade", "switch"];
const CHECK_EVERY = 15 * 60;  // s: opening System checks again after this

// "latest.20261121-22d3877" -> "20261121-22d3877" when no release matches.
const shortVersion = e => !e ? "—" : ((e.version || "").replace(/^[^.]*\./, "") || (e.digest || "").slice(7, 19) || "—");
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
    return r ? r.tag : v.replace(/^[^.]*\./, "");
};
const AUTO_TRIES = 3;  // boot-counter's TRIES
// The GRUB menu is hidden (boot-counter's custom.cfg / 05_timeout.cfg).
const GRUB_HINT = "Ręcznie, gdy system nie startuje: klawiatura USB, zaraz po włączeniu trzymaj Shift " +
    "(albo naciskaj Esc), w menu GRUB druga pozycja strzałkami i Enterem.";

function fmtAgo(t) {
    const s = Date.now() / 1000 - t;
    if (s < 90) return "przed chwilą";
    if (s < 3600) return `${Math.round(s / 60)} min temu`;
    return "o " + new Date(t * 1000).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}
const fmtDate = t => t ? new Date(t).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : "";

/* Just enough Markdown for the release bodies build.yml writes: headings,
   lists (commits), tables (package changes), `code`, **bold**, links (text
   only -- nothing on a kiosk opens them). */
const MD_HEADINGS = {
    "Package changes": "Zmiany pakietów", "Updated": "Zaktualizowane", "Added": "Dodane",
    "Removed": "Usunięte", "Commits": "Zmiany", "Initial build": "Pierwsze wydanie",
    "Notes": "Uwagi", "All images": "Wszystkie obrazy",
    // table headers
    "Package": "Pakiet", "Previous": "Było", "New": "Jest", "Version": "Wersja",
};
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
            // No emoji font on the kiosk: drop them instead of showing boxes.
            const text = m[2].replace(/[\p{Extended_Pictographic}️‍]/gu, "").trim();
            out += m[1].length <= 2 ? `<h4>${inline(MD_HEADINGS[text] || text)}</h4>` : `<h5>${inline(MD_HEADINGS[text] || text)}</h5>`;
        } else if (/^\s*\|/.test(l)) {
            const rows = [];
            for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
                if (!/^\s*\|?\s*:?-{2,}/.test(lines[i])) rows.push(cells(lines[i]));
            }
            i--;
            const [head, ...body] = rows;
            out += `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(MD_HEADINGS[c] || c)}</th>`).join("")}</tr></thead><tbody>` +
                body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>";
        } else if (/^\s*[-*]\s+/.test(l)) {
            out += "<ul>";
            for (; i < lines.length && /^\s*[-*]\s+/.test(lines[i]); i++) {
                // "- 22d3877 Subject": the commit's short hash, small and grey.
                const item = inline(lines[i].replace(/^\s*[-*]\s+/, ""))
                    .replace(/^([0-9a-f]{7,12}) /, '<span class="sha">$1</span>');
                out += `<li>${item}</li>`;
            }
            i--;
            out += "</ul>";
        } else if (l.trim()) {
            out += `<p>${inline(l)}</p>`;
        }
    }
    return out;
}

function renderUpdate() {
    const s = sys, job = sysJob;
    const running = !!(job && job.state === "running");
    const checking = running && (job.kind === "check" || job.stage === "Sprawdzanie aktualizacji");
    const working = running && !checking;  // downloading / deploying
    let state, title, sub = "";
    if (!s) {
        state = "busy"; title = "Wczytywanie…";
    } else if (!s.available) {
        state = "err"; title = "Aktualizacje są niedostępne"; sub = s.error || "";
    } else if (working) {
        state = "busy";
        title = job.kind === "switch" ? "Zmiana obrazu systemu…" : "Pobieranie aktualizacji…";
        sub = job.kind === "upgrade" && s.update ? `Wersja ${versionName(s.update)}` : "";
    } else if (checking) {
        state = "busy"; title = "Sprawdzanie aktualizacji…"; sub = `Teraz działa ${versionName(s.booted)}`;
    } else if (s.update) {
        state = "new"; title = `Dostępna aktualizacja: ${versionName(s.update)}`;
        sub = `Teraz działa ${versionName(s.booted)}`;
    } else if (s.staged) {
        state = "ready"; title = `Wersja ${versionName(s.staged)} czeka na restart`;
        sub = `Jest pobrana i włączy się po ponownym uruchomieniu. Do tego czasu działa ${versionName(s.booted)}.`;
    } else if (s.checked && s.checked.error) {
        state = "err"; title = "Nie udało się sprawdzić aktualizacji"; sub = s.checked.error;
    } else if (s.checked && s.checked.time) {
        state = "ok"; title = "System jest aktualny";
        sub = `${versionName(s.booted)} · sprawdzono ${fmtAgo(s.checked.time)}`;
    } else {
        state = "ok"; title = `Wersja ${versionName(s.booted)}`; sub = "Aktualizacje nie były jeszcze sprawdzane";
    }
    setStatus("upd", state, ICONS[state], title, sub);
    // The bar only while there's progress to show -- a check is just a spinner.
    renderJob(working ? job : null, sysJobEls());
    const avail = !!(s && s.available);
    $("sys-upgrade").disabled = running || !(avail && s.update);
    $("sys-upgrade").hidden = !!(avail && s.staged && !s.update);
    $("sys-check").disabled = running || !avail;
    $("sys-check").classList.toggle("spin", checking);
    $("sys-reboot-box").hidden = running || !(avail && s.staged);
    $("sys-switch").disabled = running;
    $("sys-rollback").disabled = running || !(avail && s.rollback);
    const fb = s && s.fallback;
    if (!s) setStatus("rb-st", "busy", ICONS.busy, "Wczytywanie…");
    else if (!avail) setStatus("rb-st", "err", ICONS.err, "Przywracanie niedostępne", s.error || "");
    else if (fb) setStatus("rb-st", "warn", ICONS.warn, "Nowa wersja się nie uruchomiła",
        `${rawVersion(fb.failed) || "Aktualizacja"} ${AUTO_TRIES} razy nie pokazała kiosku, więc system sam wrócił ` +
        `do ${rawVersion(fb.running) || "poprzedniej wersji"} (${fmtTime(fb.time * 1000)}).`);
    else if (s.rollback) setStatus("rb-st", "", ICONS.ready, `Poprzednia wersja: ${versionName(s.rollback)}`,
        `Teraz działa ${versionName(s.booted)}. Przywrócenie włączy poprzednią po restarcie.`);
    else setStatus("rb-st", "off", ICONS.ready, "Brak poprzedniej wersji", `Teraz działa ${versionName(s.booted)} — nie ma do czego wrócić.`);
    $("rb-hint").textContent = [
        `Automatycznie: jeśli nowa wersja ${AUTO_TRIES} razy z rzędu nie pokaże kiosku (albo zawiesi się na 10 min), ` +
        "system sam uruchomi poprzednią i zostanie przy niej.",
        GRUB_HINT,
        `Skrót do tej karty: przytrzymaj ${RECOVERY_HOLD_S} s róg ${CORNER_NAMES[recoveryCorner()]}, w HMI albo w ustawieniach.`,
    ].join(" ");
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
    box.innerHTML = `<h3>${news.length ? "Co nowego" : "Zmiany w tej wersji"}</h3>` + list.map((r, i) => `
        <details class="rel"${news.length && i === 0 ? " open" : ""}>
          <summary><span class="tag">${esc(r.tag)}</span><span class="date">${esc(fmtDate(r.date))}</span></summary>
          <div class="md">${r.notes ? md(r.notes) : '<p class="hint">Brak opisu.</p>'}</div>
        </details>`).join("");
}

function renderSysInfo() {
    const info = $("sys-info"), s = sys;
    if (!s || !s.available) {
        info.innerHTML = `<dt>bootc</dt><dd>${esc((s && s.error) || "niedostępny")}</dd>`;
        return;
    }
    const b = s.booted || {};
    info.innerHTML = `
        <dt>Wersja</dt><dd>${esc(versionName(b))}</dd>
        <dt>Obraz</dt><dd>${esc(b.image || "—")}</dd>
        <dt>Zbudowany</dt><dd>${esc(fmtTime(b.timestamp))}</dd>
        ${s.rollback ? `<dt>Poprzednia</dt><dd>${esc(versionName(s.rollback))}</dd>` : ""}`;
    if (!$("sys-image").value) $("sys-image").value = b.image || "";
}

function maybeAutoCheck() {
    if (!sys || !sys.available || sysWasRunning || currentTab !== "system") return;
    const t = sys.checked && sys.checked.time;
    if (t && Date.now() / 1000 - t < CHECK_EVERY) return;
    startSysJob("/system/check");
}

function pollSysJob() {
    pollJob(job => {
        const was = sysWasRunning;
        sysJob = job && UPDATE_JOBS.includes(job.kind) ? job : null;
        sysWasRunning = !!(sysJob && sysJob.state === "running");
        renderUpdate();
        if (was && !sysWasRunning) {
            if (sysJob && sysJob.state === "failed" && sysJob.kind !== "check") toast(sysJob.detail || "Błąd aktualizacji", true);
            else if (sysJob && sysJob.kind === "upgrade" && sysJob.result && !sysJob.result.update && !sysJob.result.staged) toast("System jest aktualny");
            loadSystem();
        } else if (!sysWasRunning) {
            maybeAutoCheck();
        }
    });
}

async function startSysJob(path) {
    try {
        sysJob = await api(path, {});
        sysWasRunning = true;
        renderUpdate();
        pollSysJob();
    } catch (e) { toast(e.message, true); }
}

async function loadNotes() {
    try { sysNotes = await api("/system/changelog"); } catch (_) { return; }
    if (document.activeElement !== $("sys-repo") && sysNotes.repo) {
        $("sys-repo").value = sysNotes.repo;
        $("sys-repo-save").disabled = true;
    }
    renderSysInfo();
    renderUpdate();
}

async function loadSystem() {
    try { sys = await api("/system"); }
    catch (e) { sys = { available: false, error: e.message }; }
    renderSysInfo();
    renderUpdate();
    pollSysJob();
    refreshDevice();
    loadTimezones();
    loadBoot();
    loadNotes();
}

/* Device: live power and clock (every ~5 s while System is open), time zone,
   host name. Static markup, only values change -- fields keep their input. */
let hostSaved = null;
async function refreshDevice() {
    const i = await api("/info").catch(() => null);
    if (!i) return;
    const p = i.power;
    const low = p.ac_online === false && p.battery != null && p.battery <= 15;
    setStatus("dev-st", low ? "warn" : p.ac_online ? "ok" : "",
              p.ac_online ? ICONS.plug : p.battery != null ? ICONS.battery : ICONS.tablet,
              i.device.name || i.device.product || "Tablet",
              [i.device.vendor, powerText(p)].filter(Boolean).join(" · "));
    $("dev-time").textContent = i.time;
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

let tzZones = null, tzCurrent = null;
const TZ_REGIONS = {
    Africa: "Afryka", America: "Ameryka", Antarctica: "Antarktyda", Arctic: "Arktyka", Asia: "Azja",
    Atlantic: "Atlantyk", Australia: "Australia", Europe: "Europa", Indian: "Ocean Indyjski",
    Pacific: "Pacyfik", Other: "Inne",
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
    $("tz-city").innerHTML = (chosen ? "" : '<option value="" selected>— wybierz —</option>') +
        tzZones.filter(z => tzSplit(z)[0] === region).map(z =>
            `<option value="${esc(z)}"${z === chosen ? " selected" : ""}>${esc(tzSplit(z)[1].replace(/_/g, " ").replace(/\//g, " / "))}</option>`).join("");
}

const BOOT_PHASES = {
    firmware: ["Firmware (UEFI)", "#6e7681"], loader: ["Bootloader (GRUB)", "#d29922"], kernel: ["Jądro", "#db6d28"],
    initrd: ["initramfs", "#a371f7"], userspace: ["Usługi systemu", "#2f81f7"], hmi: ["Do pokazania HMI", "#3fb950"],
};
const secs = (v, d = 1) => v.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }) + " s";

async function loadBoot() {
    let b;
    try { b = await api("/boot"); }
    catch (e) { setStatus("boot-st", "err", ICONS.err, "Brak danych o starcie", e.message); return; }
    const ph = Object.fromEntries((b.phases || []).map(p => [p.name, p.sec]));
    const before = (ph.firmware || 0) + (ph.loader || 0);   // before the kernel's clock starts
    const kernelToDone = (ph.kernel || 0) + (ph.initrd || 0) + (ph.userspace || 0);
    // Bar: the phases systemd measured, then whatever the HMI took after
    // graphical.target (first paint is reported by kiosk-shell).
    const segs = Object.keys(BOOT_PHASES).filter(k => ph[k] != null).map(k => [k, ph[k]]);
    if (b.hmi_shown != null && b.hmi_shown > kernelToDone) segs.push(["hmi", b.hmi_shown - kernelToDone]);
    const total = segs.reduce((a, [, v]) => a + v, 0);
    if (b.hmi_shown != null) {
        setStatus("boot-st", "", ICONS.clock, `HMI po ${secs(before + b.hmi_shown)} od włączenia`,
                  `${secs(b.hmi_shown)} od startu jądra` + (b.total ? ` · system gotowy po ${b.total}` : ""));
    } else if (b.total) {
        setStatus("boot-st", "", ICONS.clock, `System gotowy po ${b.total}`, "HMI jeszcze się nie wyświetliło");
    } else {
        setStatus("boot-st", "busy", ICONS.busy, "Start jeszcze trwa", b.error || "");
    }
    $("boot-bar").hidden = $("boot-legend").hidden = !total;
    $("boot-bar").innerHTML = segs.map(([k, v]) =>
        `<i style="flex:${v} 1 0;background:${BOOT_PHASES[k][1]}"></i>`).join("");
    $("boot-legend").innerHTML = segs.map(([k, v]) =>
        `<div><i style="background:${BOOT_PHASES[k][1]}"></i>${esc(BOOT_PHASES[k][0])}<b>${secs(v)}</b></div>`).join("");

    // Timeline (seconds since the kernel started) and the slowest units.
    const marks = [...(b.milestones || [])];
    if (b.hmi_shown != null) marks.push({ t: b.hmi_shown, label: "HMI widoczne", hmi: true });
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
    $("boot-more").hidden = !marks.length && !slow.length;

    const sect = (title, lines) => lines && lines.length ? [title, ...lines, ""] : [];
    $("boot-detail").textContent = [
        ...sect("Nieudane jednostki:", b.failed),
        ...sect("systemd-analyze blame (bez urządzeń):", b.blame),
        ...sect("Łańcuch do kiosku (@ = kiedy ruszyła, + = ile trwała):", b.chain),
        ...sect("Łańcuch do sysinit.target:", b.chain_sysinit),
        ...(b.journal_error ? [`journalctl: ${b.journal_error}`] : []),
    ].join("\n").trim() || "brak danych";
}

function initSystem() {
    // "Aktualizuj" checks first (kioskd's upgrade job runs the check), then
    // downloads only if there's still something newer.
    $("sys-upgrade").addEventListener("click", () => startSysJob("/system/upgrade"));
    $("sys-check").addEventListener("click", () => startSysJob("/system/check"));
    holdButton($("sys-switch"), () => api("/system/switch", { image: $("sys-image").value.trim() })
        .then(j => { sysJob = j; sysWasRunning = true; renderUpdate(); pollSysJob(); })
        .catch(e => toast(e.message, true)));
    holdButton($("sys-rollback"), () => api("/system/rollback", {})
        .then(() => { toast("Poprzednia wersja uruchomi się po restarcie"); loadSystem(); }).catch(e => toast(e.message, true)));
    const power = action => () => api("/power", { action }).then(() => toast(action === "reboot" ? "Ponowne uruchamianie…" : "Wyłączanie…"))
        .catch(e => toast(e.message, true));
    holdButton($("sys-reboot-now"), power("reboot"));
    holdButton($("pw-reboot"), power("reboot"));
    holdButton($("pw-off"), power("poweroff"));

    $("sys-repo").addEventListener("input", () => { $("sys-repo-save").disabled = false; });
    $("sys-repo-save").addEventListener("click", e => busy(e.currentTarget, async () => {
        cfg = await api("/config", { releases_repo: $("sys-repo").value });
        $("sys-repo").value = cfg.releases_repo;
        $("sys-repo").blur();
        toast(`Lista zmian z ${cfg.releases_repo}`);
        $("upd-notes").dataset.key = "";
        await loadNotes();
    }).then(() => { $("sys-repo-save").disabled = true; }).catch(() => {}));

    $("host-name").addEventListener("input", e => { $("host-save").disabled = e.target.value === hostSaved; });
    $("host-save").addEventListener("click", e => busy(e.currentTarget, async () => {
        const r = await api("/hostname", { hostname: $("host-name").value });
        hostSaved = r.hostname;
        $("host-name").value = r.hostname;
        $("host-name").blur();
        toast(`Nazwa hosta: ${r.hostname}. Router zobaczy ją przy następnym połączeniu.`);
    }).then(() => { $("host-save").disabled = true; }).catch(() => {}));

    $("tz-region").addEventListener("change", e => renderTz(e.target.value));
    $("tz-city").addEventListener("change", e => {
        const tz = e.target.value;
        if (!tz) return;
        api("/timezone", { timezone: tz }).then(r => {
            tzCurrent = r.timezone;
            $("dev-time").textContent = r.time;
            renderTz();
            toast(`Strefa czasowa: ${r.timezone}`);
        }).catch(err => { toast(err.message, true); renderTz(); });
    });

    setInterval(() => { if (currentTab === "system" && !document.hidden) refreshDevice(); }, 5000);
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
        <dt>Wersja</dt><dd>${esc(p.version || "—")}</dd>
        <dt>Rozmiar</dt><dd>${p.size ? fmtSize(p.size) : "—"}</dd>` : `<dt>Błąd</dt><dd>Brak obrazu systemu na nośniku</dd>`;

    const list = $("inst-disks");
    list.innerHTML = "";
    const usable = st.disks.filter(d => !d.is_boot_medium && (!p || !p.size || d.size >= p.size));
    if (!chosenDisk || !usable.some(d => d.name === chosenDisk)) chosenDisk = usable[0]?.name || null;
    for (const d of st.disks) {
        const li = document.createElement("li");
        const ok = usable.includes(d);
        const why = d.is_boot_medium ? "nośnik instalacyjny" : !ok ? "za mały" : d.internal ? "wewnętrzny" : "zewnętrzny";
        li.innerHTML = `<div class="item ${d.name === chosenDisk ? "on" : ""} ${ok ? "" : "off"}">
            <div class="name">${esc(d.model || d.name)} <span class="sub">${esc(d.path)}</span>
              <div class="sub">${fmtSize(d.size)} · ${esc(why)}</div></div>
            ${d.name === chosenDisk ? '<span class="badge ok">wybrany</span>' : ""}</div>`;
        if (ok) li.addEventListener("click", () => { chosenDisk = d.name; loadInstaller(); });
        list.appendChild(li);
    }
    if (!st.disks.length) list.innerHTML = '<li class="empty">Nie znaleziono dysków.</li>';

    const pw = st.power;
    $("inst-power").hidden = pw.ac_online !== false;
    $("inst-power").textContent = `Tablet działa na baterii${pw.battery != null ? ` (${pw.battery}%)` : ""}. Podłącz ładowarkę przed instalacją.`;
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
    $("inst-title").textContent = done ? "Zainstalowano ✔" : failed ? "Instalacja nieudana" : "Instalowanie…";
    $("inst-note").textContent = done ? "Wyjmij pendrive, potem uruchom tablet ponownie."
        : failed ? job.detail : "Nie wyłączaj tabletu i nie wyjmuj pendrive'a.";
    $("inst-done").hidden = !done;
    $("inst-failed").hidden = !failed;
}

async function initInstaller() {
    $("installer").hidden = false;
    document.title = "Instalator";
    holdButton($("inst-go"), async () => {
        msg($("inst-msg"), "");
        try {
            await api("/installer/start", { disk: chosenDisk });
            pollJob(renderInstallJob);
        } catch (e) { msg($("inst-msg"), e.message, "err"); }
    });
    holdButton($("inst-reboot"), () => api("/power", { action: "reboot" }).catch(e => toast(e.message, true)));
    $("inst-retry").addEventListener("click", () => {
        $("inst-progress").hidden = true;
        $("inst-choose").hidden = false;
        loadInstaller();
    });
    await loadInstaller();
    // Page reloaded mid-install (kiosk-shell restarted): pick the job back up.
    pollJob(renderInstallJob);
    // Disks come and go (USB): refresh the list while choosing.
    setInterval(() => { if (!$("inst-choose").hidden) loadInstaller(); }, 5000);
}

/* ======================================================= boot */

(async () => {
    for (let i = 0; ; i++) {
        try { cfg = await api("/config"); break; }
        catch (_) { await new Promise(r => setTimeout(r, Math.min(500 * (i + 1), 3000))); }
    }
    if (cfg.mode === "installer") initInstaller(); else initSettings();
})();
