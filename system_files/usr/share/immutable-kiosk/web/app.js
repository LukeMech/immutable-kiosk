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
    const net = () => { loadWifi(false); loadNet(); };  // Wi-Fi and IP: one tab
    ({ hmi: loadHmi, net, screen: loadScreen, system: loadSystem })[name]();
}

// kiosk-shell calls these when Settings is shown / the HMI replaces it. The
// page keeps running behind the HMI (document.hidden stays false there), so
// live updates check settingsVisible -- no nmcli under the HMI.
let settingsVisible = true;
window.kioskShown = () => {
    settingsVisible = true;
    if (cfg && cfg.mode !== "installer") { showTab(currentTab); refreshDevice(); }
};
window.kioskHidden = () => { settingsVisible = false; };
// kiosk-shell: at start the HMI couldn't be reached, so Settings is shown
// until it can (then the HMI replaces it) -- the top bar says so.
let hmiWaiting = false;
window.kioskWaiting = on => { hmiWaiting = !!on; renderNetbar(); };

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
    const d0 = w && w.device;
    // Disconnect: only next to a live connection, never while something runs.
    $("wifi-off").hidden = !!o || !(w && w.enabled && d0 && /^(connected|connecting)/.test(d0.state));
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

// live: a change kioskd reported (initEvents) -- not while an action of this
// page is still running (it reloads when it's done).
async function loadWifi(rescan, live = false) {
    if (live && wifiOverride && wifiOverride.state === "busy") return;
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
    $("wifi-radio-box").hidden = !w.device;  // shown once the real state is known
    renderWifiStatus();
    const list = $("wifi-list");
    // A password being typed in an opened network stays: the list waits.
    if (live && [...list.querySelectorAll("input")].some(i => i.value || i === document.activeElement)) return;
    // The connected network is the status line above, not a row here.
    const others = w.networks.filter(n => !n.in_use);
    list.innerHTML = others.length ? "" : `<li class="empty">${w.enabled ? "Nie znaleziono innych sieci." : "Wi-Fi jest wyłączone."}</li>`;
    for (const n of others) {
        const li = document.createElement("li");
        const sec = n.security ? `zabezpieczona · ${esc(n.security)}` : "otwarta";
        li.innerHTML = `<div class="item">
            <span class="ico">${wifiIcon(sigLevel(n.signal))}</span>
            <div class="name">${esc(n.ssid)}<div class="sub">${sec} · ${n.signal}%</div></div>
            ${n.saved ? '<span class="badge">zapisana</span>' : ""}
          </div>`;
        const item = li.querySelector(".item");
        list.appendChild(li);
        const ex = document.createElement("div");
        ex.className = "expand";
        ex.hidden = openSsid !== n.ssid;
        item.classList.toggle("open", !ex.hidden);
        // A saved network connects with what NetworkManager remembers -- no
        // password field unless "Inne hasło" asks for one.
        const remembered = n.saved && n.security;
        ex.innerHTML = (remembered ? '<p class="hint">Zapisana — połączy się z zapamiętanym hasłem.</p>' : "") +
            (n.security ? `<label class="pw"${remembered ? " hidden" : ""}>Hasło
                <input type="password" autocomplete="off"></label>` : "") +
            `<div class="actions"><button class="btn primary go">Połącz</button>` +
            (remembered ? '<button class="btn other">Inne hasło</button>' : "") + `</div>`;
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
            // The keyboard only when there's a password to type.
            const pw = ex.querySelector(".pw");
            if (!ex.hidden && pw && !pw.hidden) pw.querySelector("input").focus();
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
            ${s.active ? "" : '<button class="btn primary go">Połącz</button>'}
            <button class="btn danger hold" data-hold="1000">Zapomnij</button></div>`;
        // Saved: connects with the remembered password, nothing to type.
        const go = li.querySelector(".go");
        go?.addEventListener("click", () => busy(go, async () => {
            wifiOverride = { state: "busy", icon: ICONS.busy, title: `Łączenie z ${s.ssid}…`, sub: "To może potrwać do minuty." };
            renderWifiStatus();
            try {
                await api("/wifi/connect", { ssid: s.ssid, password: "" });
                wifiOverride = null;
            } catch (e) {
                wifiOverride = { state: "err", icon: ICONS.err, title: `Nie udało się połączyć z ${s.ssid}`, sub: e.message };
                renderWifiStatus();
                throw e;
            }
            await loadWifi(false);
        }).catch(() => {}));
        const b = li.querySelector(".hold");
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
    holdButton($("wifi-off"), () => {
        const name = (wifiLast && wifiLast.device && wifiLast.device.connection) || "sieci";
        wifiOverride = { state: "busy", icon: ICONS.busy, title: `Rozłączanie z ${name}…` };
        renderWifiStatus();
        api("/wifi/disconnect", {})
            .then(() => { wifiOverride = null; return loadWifi(false); })
            .catch(e => {
                wifiOverride = { state: "err", icon: ICONS.err, title: "Nie udało się rozłączyć", sub: e.message };
                renderWifiStatus();
            });
    });
    // nmcli takes a few seconds to switch the radio: say so at once, and
    // keep the switch still until it has.
    $("wifi-radio").addEventListener("change", e => {
        const sw = e.target, on = sw.checked;
        sw.disabled = true;
        wifiOverride = { state: "busy", icon: ICONS.busy, title: on ? "Włączanie Wi-Fi…" : "Wyłączanie Wi-Fi…" };
        renderWifiStatus();
        api("/wifi/radio", { enabled: on })
            .then(() => { wifiOverride = null; return loadWifi(on); })
            .catch(err => {
                sw.checked = !on;
                wifiOverride = { state: "err", icon: ICONS.err, title: on ? "Nie udało się włączyć Wi-Fi" : "Nie udało się wyłączyć Wi-Fi", sub: err.message };
                renderWifiStatus();
            })
            .finally(() => { sw.disabled = false; });
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

async function loadNet(live = false) {
    const box = $("net-list");
    // A card being edited (static address) isn't rebuilt under the finger.
    if (live && box.querySelector(".card.dirty")) return;
    let n;
    const lone = (state, icon, title, sub) => `<div class="card"><h2>Połączenie</h2>${statusHtml(state, icon, title, sub)}</div>`;
    try { n = await api("/network"); }
    catch (e) { box.innerHTML = lone("err", ICONS.err, "Nie udało się odczytać sieci", e.message); return; }
    if (!n.connections.length) {
        // Nothing connected: the Wi-Fi card above already says so.
        box.innerHTML = `<div class="card"><h2>Adres IP</h2>` + statusHtml("off", ICONS.ethernet, "Brak połączenia",
            "Połącz się z siecią Wi-Fi poniżej albo podłącz kabel (adapter USB-Ethernet).") + `</div>`;
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
        el.innerHTML = `<h2>Adres IP · ${esc(kind)}</h2>` +
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
        el.addEventListener("input", () => el.classList.add("dirty"));
        segEl.addEventListener("click", () => el.classList.add("dirty"));
        save.addEventListener("click", () => busy(save, async () => {
            await api("/network", {
                uuid: c.uuid, method, address: f("address").value, prefix: Number(f("prefix").value),
                gateway: f("gateway").value, dns: [f("dns1").value, f("dns2").value],
            });
            msg(m, "Zastosowano. Połączenie jest odnawiane…", "ok");
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

/* Accent colour (Ekran > Kolor akcentu): kioskd keeps the name, the page
   sets --accent (everything accent-tinted derives from it with color-mix)
   and --ik-accent for the on-screen keyboard. Each works with white text. */
const ACCENTS = {
    blue: ["Niebieski", "#2f81f7"], teal: ["Morski", "#17a2b8"], green: ["Zielony", "#2da44e"],
    purple: ["Fioletowy", "#8957e5"], pink: ["Różowy", "#d6409f"], orange: ["Pomarańczowy", "#e16f24"],
    graphite: ["Grafitowy", "#6e7681"],
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
    if (st.state === "working") setStatus("splash-st", "busy", ICONS.busy, "Obracanie ekranu startowego…",
        `Zapisywanie orientacji ${o} w ustawieniach startu. Nie uruchamiaj tabletu ponownie, dopóki to trwa.`);
    else if (st.state === "done") setStatus("splash-st", "ok", ICONS.ok, "Ekran startowy obrócony",
        `Od następnego uruchomienia animacja startowa będzie w tej orientacji (${o}).`);
    else if (st.state === "failed") setStatus("splash-st", "err", ICONS.err, "Nie udało się obrócić ekranu startowego",
        st.error || "");
}

function loadScreen() {
    renderAccent();
    loadSplash();
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
    // Applied at once, saved after; on failure back to what's saved.
    $("accent").addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b) return;
        applyAccent(b.dataset.v);
        $("accent").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
        api("/config", { accent: b.dataset.v }).then(c => { cfg = c; })
            .catch(err => { toast(err.message, true); applyAccent(cfg.accent); renderAccent(); });
    });
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

// "12 s", "3 min 5 s" (non-breaking: never split from its number).
function fmtDur(s) {
    s = Math.max(0, Math.round(s));
    return s < 60 ? `${s}\u00a0s` : `${Math.floor(s / 60)}\u00a0min ${s % 60}\u00a0s`;
}
const STEP_ICONS = { done: ICONS.ok, active: ICONS.busy, failed: ICONS.err };

// kioskd's job.steps as a chain. Kept as DOM between polls (every 0.7 s):
// rebuilt, the bars would restart their animation each time.
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
        const took = s.state === "active" ? job.now - s.started : s.took;
        li.querySelector(".st").textContent = s.state === "skipped" ? "pominięto"
            : took != null && s.state !== "pending" ? fmtDur(took) : "";
        const bar = li.querySelector(".progress");
        bar.hidden = s.state !== "active";
        bar.classList.toggle("indet", s.fraction == null);
        bar.firstElementChild.style.width = ((s.fraction || 0) * 100).toFixed(1) + "%";
        const d = li.querySelector(".sd");
        d.textContent = s.detail || "";
        d.hidden = !s.detail;
    });
}

const CHANNEL_NAMES = { stable: "stabilny", dev: "testowy" };
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
    let hint = "Stabilny: wydania (releases) — sprawdzone wersje. Testowy: każda zmiana z gałęzi dev, " +
        "nowości od razu, ale mniej sprawdzone.";
    if (chanPick) {
        hint = `Pobierze wersję z kanału ${CHANNEL_NAMES[chanPick]} i włączy ją po restarcie.` +
            (chanPick === "stable" && cur === "dev" ? " Może być starsza niż ta z kanału testowego." : "");
    } else if (avail && cur === "custom") {
        hint = `System działa z własnego obrazu (${s.booted ? s.booted.image : "?"}). Wybierz kanał, ` +
            "żeby wrócić do zwykłych aktualizacji.";
    } else if (avail && s.channel !== s.next_channel) {
        hint = `Po restarcie system przejdzie na kanał ${CHANNEL_NAMES[s.next_channel] || "własny"}.`;
    }
    $("chan-hint").textContent = hint;
    $("chan-switch").hidden = !chanPick;
    $("chan-switch").disabled = running;
    if (chanPick) $("chan-switch").textContent = `Przytrzymaj: przejdź na kanał ${CHANNEL_NAMES[chanPick]}`;
}

let sys = null;          // GET /system (bootc status + last check)
let sysJob = null;       // last update-ish job (check / upgrade / switch)
let sysWasRunning = false;
let sysNotes = null;     // GET /system/changelog (GitHub releases)
const UPDATE_JOBS = ["check", "upgrade", "switch", "rollback"];
const CHECK_EVERY = 15 * 60;  // s: opening System checks again after this

// A version label, readable without a matching GitHub release:
//   "v45.20261122.1-778b844" (CI builds carry their release tag) -> "v45.20261122.1"
//   "v45.3f30f95" (dev builds: the tag is the commit) -> as it is
//   "latest.20261121-22d3877" (older builds) -> "v45.20261121-22d3877"
//     (Fedora version from kioskd; the date+commit still says which build)
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
    // A check is just a spinner; an update or a switch shows its steps
    // (the update's first one is the same check).
    const checking = running && job.kind === "check";
    const restoring = running && job.kind === "rollback";  // shown in Przywracanie
    const working = running && !checking && !restoring;
    let state, title, sub = "";
    // A running job first: while bootc works, its status may be stale or
    // briefly unavailable -- that's not a failure to show.
    if (working) {
        state = "busy";
        title = job.kind === "switch" ? `${job.title}…` : "Aktualizowanie systemu…";
        sub = job.kind === "upgrade" && s && s.update ? `Wersja ${versionName(s.update)}`
            : "Działa normalnie dalej — nowa wersja włączy się po restarcie.";
    } else if (checking) {
        state = "busy"; title = "Sprawdzanie aktualizacji…";
        sub = s && s.booted ? `Teraz działa ${versionName(s.booted)}` : "";
    } else if (restoring) {
        state = "busy"; title = "Przywracanie poprzedniej wersji…";
        sub = "Postęp w karcie „Przywracanie i zasilanie”.";
    } else if (!s) {
        state = "busy"; title = "Wczytywanie…";
    } else if (!s.available) {
        state = "err"; title = "Aktualizacje są niedostępne"; sub = s.error || "";
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
        sub = `${versionName(s.booted)}${s.channel === "dev" ? " (testowa)" : ""} · sprawdzono ${fmtAgo(s.checked.time)}`;
    } else {
        state = "ok"; title = `Wersja ${versionName(s.booted)}`; sub = "Aktualizacje nie były jeszcze sprawdzane";
    }
    setStatus("upd", state, ICONS[state], title, sub);
    // The bar only while there's progress to show -- a check is just a spinner.
    renderSteps(job && (job.kind === "upgrade" || job.kind === "switch") ? job : null, $("job-steps"));
    renderSteps(job && job.kind === "rollback" ? job : null, $("rb-steps"));
    renderChannel(running);
    const avail = !!(s && s.available);
    // One row: [Aktualizuj | Uruchom ponownie] [↻]. Restart replaces
    // "Aktualizuj" once a version waits for it and nothing newer is out.
    const waiting = !running && avail && !!s.staged && !s.update;
    $("sys-upgrade").disabled = running || !(avail && s.update);
    $("sys-upgrade").hidden = waiting;
    $("sys-reboot-now").hidden = !waiting;
    $("sys-check").disabled = running || !avail;
    $("sys-check").classList.toggle("spin", checking);
    $("sys-switch").disabled = running;
    $("sys-rollback").disabled = running || !(avail && s.rollback);
    $("sys-rollback").textContent = avail && s.rollback_queued
        ? "Przytrzymaj: uruchom ponownie teraz" : "Przytrzymaj: przywróć poprzednią wersję";
    const fb = s && s.fallback;
    if (!s) setStatus("rb-st", "busy", ICONS.busy, "Wczytywanie…");
    else if (restoring) setStatus("rb-st", "busy", ICONS.busy, "Przywracanie poprzedniej wersji…",
        s.rollback ? `Wraca do ${versionName(s.rollback)}` : "");
    else if (job && job.kind === "rollback" && job.state === "failed")
        setStatus("rb-st", "err", ICONS.err, "Nie udało się przywrócić", job.detail || "");
    else if (avail && s.rollback_queued) setStatus("rb-st", "ready", ICONS.ready, "Poprzednia wersja włączy się po restarcie",
        `${versionName(s.rollback)} jest ustawiona jako domyślna; do restartu działa ${versionName(s.booted)}.`);
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
    renderBar(i);
    $("dev-model").textContent = i.device.product || "—";
    $("dev-vendor").textContent = i.device.vendor || "—";
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

/* Top bar: battery and clock, next to "Wróć do HMI". */
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
// kioskd's clock, not the browser's: WebKit keeps the time zone it started
// with, so a zone changed in Settings would show up only after a restart.
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

// Network, while connected: Wi-Fi signal + name, or Ethernet. While the
// kiosk waits for its HMI: what it waits for -- the network, or the HMI.
let barNet = null;
function renderNetbar() {
    const n = barNet, nb = $("netbar");
    nb.classList.toggle("waiting", hmiWaiting);
    if (hmiWaiting) {
        nb.hidden = false;
        nb.innerHTML = `${ICONS.busy}<span>${n ? "Łączenie z HMI…" : "Czekam na sieć…"}</span>`;
        nb.title = n ? `${n.name}: HMI jeszcze nie odpowiada, kiosk przełączy się na nie samo`
            : "Kiosk przełączy się na HMI, gdy będzie sieć i HMI odpowie";
        return;
    }
    nb.hidden = !n;
    if (n) {
        const icon = n.type === "wifi" ? wifiIcon(n.signal != null ? sigLevel(n.signal) : 3) : ICONS.ethernet;
        nb.innerHTML = `${icon}<span>${esc(n.type === "wifi" ? n.name : "Ethernet")}</span>`;
        nb.title = n.type === "wifi" && n.signal != null ? `${n.name} · sygnał ${n.signal}%` : n.name;
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

// Short labels: the legend is one line under the bar.
const BOOT_PHASES = {
    firmware: ["UEFI", "#6e7681"], loader: ["GRUB", "#d29922"], kernel: ["Jądro", "#db6d28"],
    initrd: ["initramfs", "#a371f7"], userspace: ["Usługi", "#2f81f7"], hmi: ["HMI", "#3fb950"],
};
// Non-breaking space: "13,3 s" never splits across lines (legend, timeline).
const secs = (v, d = 1) => v.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }) + " s";

let bootLoaded = false;
async function loadBoot() {
    // First load reads this boot's journal -- seconds on the Atom: a spinner,
    // like the update check. Later ones come from kioskd's cache.
    if (!bootLoaded) setStatus("boot-st", "busy", ICONS.busy, "Wczytywanie czasu uruchamiania…", "Czytam dziennik tego startu");
    let b;
    try { b = await api("/boot"); bootLoaded = true; }
    catch (e) { setStatus("boot-st", "err", ICONS.err, "Brak danych o starcie", e.message); return; }
    const ph = Object.fromEntries((b.phases || []).map(p => [p.name, p.sec]));
    const before = (ph.firmware || 0) + (ph.loader || 0);   // before the kernel's clock starts
    const kernelToDone = (ph.kernel || 0) + (ph.initrd || 0) + (ph.userspace || 0);
    // Bar: the phases systemd measured, then whatever the HMI took after
    // graphical.target (first paint is reported by kiosk-shell).
    const segs = Object.keys(BOOT_PHASES).filter(k => ph[k] != null).map(k => [k, ph[k]]);
    if (b.hmi_shown != null && b.hmi_shown > kernelToDone) segs.push(["hmi", b.hmi_shown - kernelToDone]);
    const total = segs.reduce((a, [, v]) => a + v, 0);
    const ready = before + kernelToDone;
    if (b.hmi_shown != null) {
        setStatus("boot-st", "", ICONS.clock, `HMI po ${secs(before + b.hmi_shown)} od włączenia`,
                  `system gotowy po ${secs(ready)}, z tego ${secs(before)} przed startem jądra (UEFI + GRUB)`);
    } else if (b.total) {
        setStatus("boot-st", "", ICONS.clock, `System gotowy po ${secs(ready)}`,
                  "HMI jeszcze się nie wyświetliło (brak adresu albo serwer nie odpowiada)");
    } else {
        setStatus("boot-st", "busy", ICONS.busy, "Start jeszcze trwa", b.error || "");
    }
    $("boot-bar").hidden = $("boot-legend").hidden = !total;
    $("boot-bar").innerHTML = segs.map(([k, v]) =>
        `<i style="flex:${v} 1 0;background:${BOOT_PHASES[k][1]}"></i>`).join("");
    $("boot-legend").innerHTML = segs.map(([k, v]) =>
        `<span><i style="background:${BOOT_PHASES[k][1]}"></i>${esc(BOOT_PHASES[k][0])} <b>${secs(v)}</b></span>`).join("");

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
    // Critical chains: what local-fs and the kiosk waited for, step by step.
    // A step starting long after the one it waited for is the gap's cause.
    $("boot-chains").innerHTML = (b.chains || []).filter(c => c.steps && c.steps.length).map(c =>
        `<h3>Na co czekał start: ${esc(c.title.toLowerCase())}</h3><ul class="chain">` +
        c.steps.map((s, i) =>
            `<li style="--d:${Math.min(i, 8)}"><span class="t">${s.at != null ? secs(s.at) : ""}</span>` +
            `<span class="u">${esc(s.unit)}</span>` +
            `<span class="d${s.took >= 1 ? " long" : ""}">${s.took != null ? "+" + secs(s.took) : ""}</span></li>`).join("") +
        `</ul>`).join("");
    $("boot-more").hidden = !marks.length && !slow.length;

    const problems = [
        ...(b.failed && b.failed.length ? [`Nie uruchomiły się: ${b.failed.join(", ")}`] : []),
        ...(b.journal_error ? [`Brak przebiegu startu (journalctl: ${b.journal_error})`] : []),
    ];
    $("boot-failed").textContent = problems.join(" · ");
    $("boot-failed").hidden = !problems.length;
}

function initSystem() {
    // "Aktualizuj" checks first (kioskd's upgrade job runs the check), then
    // downloads only if there's still something newer.
    $("sys-upgrade").addEventListener("click", () => startSysJob("/system/upgrade"));
    $("sys-check").addEventListener("click", () => startSysJob("/system/check"));
    $("chan").addEventListener("click", e => {
        const b = e.target.closest("button");
        if (!b || b.disabled) return;
        chanPick = b.dataset.v;
        renderChannel(!!(sysJob && sysJob.state === "running"));
    });
    holdButton($("chan-switch"), () => api("/system/channel", { channel: chanPick })
        .then(j => { chanPick = null; sysJob = j; sysWasRunning = true; renderUpdate(); pollSysJob(); })
        .catch(e => toast(e.message, true)));
    holdButton($("sys-switch"), () => api("/system/switch", { image: $("sys-image").value.trim() })
        .then(j => { sysJob = j; sysWasRunning = true; renderUpdate(); pollSysJob(); })
        .catch(e => toast(e.message, true)));
    // A job: bootc rollback, then the restart (kioskd), steps in the card.
    holdButton($("sys-rollback"), () => api("/system/rollback", {})
        .then(j => { sysJob = j; sysWasRunning = true; renderUpdate(); pollSysJob(); })
        .catch(e => toast(e.message, true)));
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
            setClock(r.time);
            renderTz();
            toast(`Strefa czasowa: ${r.timezone}`);
        }).catch(err => { toast(err.message, true); renderTz(); });
    });

    // The top bar's clock ticks locally; kioskd's events bring everything else.
    setInterval(renderClock, 1000);
}

/* Live updates: kioskd says what changed (GET /api/events, Server-Sent
   Events) and only that part is reloaded -- no polling. The top bar always,
   tab contents when their tab is open. A reconnect (kioskd restarted) may
   have missed changes: everything visible is reloaded then. */
function initEvents() {
    const net = () => {
        refreshDevice();
        if (currentTab === "net") { loadWifi(false, true); loadNet(true); }
    };
    const LIVE = {
        net, power: refreshDevice, clock: refreshDevice, device: refreshDevice,
        splash: () => { if (currentTab === "screen") loadSplash(); },
        config: () => api("/config").then(c => { cfg = c; if (currentTab === "screen") loadScreen(); }).catch(() => {}),
    };
    let opened = false;
    const es = new EventSource("/api/events");
    es.addEventListener("change", e => {
        let topics = [];
        try { topics = JSON.parse(e.data); } catch (_) { return; }
        // Under the HMI nothing is reloaded: kioskShown does it on the way back.
        if (settingsVisible) for (const t of topics) LIVE[t]?.();
    });
    es.addEventListener("open", () => {
        if (opened) { net(); LIVE.config(); }
        opened = true;
    });
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
    refreshDevice();  // the top bar's battery and clock right away
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
    applyAccent(cfg.accent);
    if (cfg.mode === "installer") initInstaller(); else initSettings();
})();
