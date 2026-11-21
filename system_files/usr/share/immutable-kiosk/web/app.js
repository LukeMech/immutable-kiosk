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

function renderHmiUrl() {
    const h = hmiDraft;
    if (!h.host) { $("hmi-url").textContent = "—"; return; }
    const def = h.scheme === "https" ? 443 : 80;
    const port = Number(h.port) && Number(h.port) !== def ? ":" + h.port : "";
    let path = h.path || "/";
    if (!path.startsWith("/")) path = "/" + path;
    $("hmi-url").textContent = `${h.scheme}://${h.host}${port}${path}`;
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
    msg($("hmi-msg"), cfg.hmi_url ? "" : "Podaj adres serwera HMI, żeby wyświetlić wizualizację.", cfg.hmi_url ? "" : "warn");
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
    $("hmi-test").addEventListener("click", e => busy(e.currentTarget, async () => {
        readHmiForm();
        msg($("hmi-msg"), "Sprawdzanie…");
        const r = await api("/hmi/test", { host: hmiDraft.host, port: hmiDraft.port });
        msg($("hmi-msg"), r.message, r.ok ? "ok" : "err");
    }).catch(() => msg($("hmi-msg"), "")));
    $("hmi-save").addEventListener("click", e => busy(e.currentTarget, async () => {
        readHmiForm();
        cfg = await api("/config", { hmi: hmiDraft });
        shell("config-changed");
        if (cfg.hmi_url) shell("reload-hmi");
        $("back").disabled = !cfg.hmi_url;
    }));
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
const bars = s => {
    const n = s >= 75 ? 4 : s >= 50 ? 3 : s >= 25 ? 2 : 1;
    return `<span class="sig">${[1, 2, 3, 4].map(i => `<i class="${i <= n ? "on" : ""}" style="height:${i * 25}%"></i>`).join("")}</span>`;
};
let openSsid = null;

async function loadWifi(rescan) {
    const m = $("wifi-msg");
    if (rescan) msg(m, "Szukanie sieci…");
    let w;
    try { w = await api("/wifi" + (rescan ? "?rescan=1" : "")); }
    catch (e) { msg(m, e.message, "err"); return; }
    msg(m, w.enabled ? "" : "Wi-Fi jest wyłączone.");
    $("wifi-radio").checked = w.enabled;
    const list = $("wifi-list");
    list.innerHTML = w.networks.length ? "" : `<li class="empty">${w.enabled ? "Nie znaleziono sieci." : ""}</li>`;
    for (const n of w.networks) {
        const li = document.createElement("li");
        const lock = n.security ? "🔒 " + esc(n.security) : "otwarta";
        li.innerHTML = `<div class="item">${bars(n.signal)}
            <div class="name">${esc(n.ssid)}<div class="sub">${lock}</div></div>
            ${n.in_use ? '<span class="badge ok">połączono</span>' : n.saved ? '<span class="badge">zapisana</span>' : ""}
          </div>`;
        const ex = document.createElement("div");
        ex.className = "expand";
        ex.hidden = openSsid !== n.ssid;
        if (n.in_use) {
            ex.innerHTML = `<p class="hint">Połączono z tą siecią.</p>`;
        } else {
            ex.innerHTML = (n.security ? `<label>Hasło${n.saved ? " (puste = zapisane)" : ""}
                    <input type="password" autocomplete="off"></label>` : "") +
                `<div class="actions"><button class="btn primary">Połącz</button></div>`;
            const btn = ex.querySelector("button");
            btn.addEventListener("click", () => busy(btn, async () => {
                const pass = ex.querySelector("input")?.value || "";
                msg(m, `Łączenie z ${n.ssid}…`);
                try {
                    await api("/wifi/connect", { ssid: n.ssid, password: pass });
                    msg(m, `Połączono z ${n.ssid}`, "ok");
                    openSsid = null;
                } catch (e) { msg(m, e.message, "err"); throw e; }
                await loadWifi(false);
            }).catch(() => {}));
        }
        li.querySelector(".item").addEventListener("click", () => {
            openSsid = ex.hidden ? n.ssid : null;
            list.querySelectorAll(".expand").forEach(x => { if (x !== ex) x.hidden = true; });
            ex.hidden = !ex.hidden;
            if (!ex.hidden) ex.querySelector("input")?.focus();
        });
        li.appendChild(ex);
        list.appendChild(li);
    }
    const saved = $("wifi-saved");
    saved.innerHTML = w.saved.length ? "" : '<li class="empty">Brak zapisanych sieci.</li>';
    for (const s of w.saved) {
        const li = document.createElement("li");
        li.innerHTML = `<div class="item"><div class="name">${esc(s.ssid)}</div>
            ${s.active ? '<span class="badge ok">aktywna</span>' : ""}
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
    $("wifi-scan").addEventListener("click", e => busy(e.currentTarget, () => loadWifi(true)));
    $("wifi-radio").addEventListener("change", e => api("/wifi/radio", { enabled: e.target.checked })
        .then(() => loadWifi(e.target.checked)).catch(err => toast(err.message, true)));
    $("hid-connect").addEventListener("click", e => busy(e.currentTarget, async () => {
        const ssid = $("hid-ssid").value.trim();
        await api("/wifi/connect", { ssid, password: $("hid-pass").value, hidden: true });
        $("hid-pass").value = "";
        toast(`Połączono z ${ssid}`);
        await loadWifi(false);
    }).catch(() => {}));
}

/* ---------- Network (IP) */
async function loadNet() {
    const box = $("net-list");
    let n;
    try { n = await api("/network"); }
    catch (e) { box.innerHTML = `<div class="card"><p class="msg err">${esc(e.message)}</p></div>`; return; }
    if (!n.connections.length) {
        box.innerHTML = `<div class="card"><h2>Brak aktywnego połączenia</h2>
            <p class="hint">Połącz się z siecią Wi-Fi albo podłącz kabel (adapter USB-Ethernet).</p></div>`;
        return;
    }
    box.innerHTML = "";
    for (const c of n.connections) {
        const card = document.createElement("div");
        card.className = "card";
        const cur = c.current;
        card.innerHTML = `<h2>${esc(c.type === "wifi" ? "Wi-Fi: " : c.type === "ethernet" ? "Ethernet: " : "")}${esc(c.name)}</h2>
          <dl class="kv">
            <dt>Adres</dt><dd>${esc(cur.addresses.join(", ") || "—")}</dd>
            <dt>Brama</dt><dd>${esc(cur.gateway || "—")}</dd>
            <dt>DNS</dt><dd>${esc(cur.dns.join(", ") || "—")}</dd>
          </dl>
          <div class="seg" style="margin-top:16px"><button data-v="auto">Automatycznie (DHCP)</button><button data-v="manual">Statyczny adres</button></div>
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
          <div class="actions"><button class="btn primary save">Zastosuj</button></div>`;
        let method = c.method === "manual" ? "manual" : "auto";
        const segEl = card.querySelector(".seg"), manual = card.querySelector(".manual");
        const f = name => card.querySelector(`[name=${name}]`);
        f("address").value = c.address || (cur.addresses[0] || "").split("/")[0];
        f("prefix").value = c.prefix || (cur.addresses[0] || "/24").split("/")[1];
        f("gateway").value = c.gateway || cur.gateway;
        f("dns1").value = (c.dns.length ? c.dns : cur.dns)[0] || "";
        f("dns2").value = (c.dns.length ? c.dns : cur.dns)[1] || "";
        const pick = v => { method = v; seg(segEl, v); manual.hidden = v !== "manual"; };
        seg(segEl, method, pick);
        pick(method);
        const save = card.querySelector(".save"), m = card.querySelector(".msg");
        save.addEventListener("click", () => busy(save, async () => {
            await api("/network", {
                uuid: c.uuid, method, address: f("address").value, prefix: Number(f("prefix").value),
                gateway: f("gateway").value, dns: [f("dns1").value, f("dns2").value],
            });
            msg(m, "Zastosowano. Połączenie jest odnawiane…", "ok");
            setTimeout(loadNet, 4000);
        }).catch(e => msg(m, e.message, "err")));
        box.appendChild(card);
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
}

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

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const UPD_ICONS = {
    ok: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    new: svg('<path d="M12 4v12"/><path d="M6.5 11l5.5 5.5 5.5-5.5"/><path d="M5 20h14"/>'),
    ready: svg('<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>'),
    err: svg('<path d="M12 7v6"/><path d="M12 17h.01"/>'),
    busy: svg('<path d="M12 3a9 9 0 1 0 9 9"/>'),
};

// "latest.20261121-22d3877" -> "20261121-22d3877" when no release matches.
const shortVersion = e => !e ? "—" : ((e.version || "").replace(/^[^.]*\./, "") || (e.digest || "").slice(7, 19) || "—");
function releaseOf(e) {
    if (!e || !e.sha || !sysNotes) return null;
    return [sysNotes.current, sysNotes.target, ...(sysNotes.news || [])]
        .find(r => r && r.sha && r.sha.startsWith(e.sha)) || null;
}
const versionName = e => { const r = releaseOf(e); return r ? r.tag : shortVersion(e); };

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
    $("upd").className = "upd " + state;
    $("upd-icon").innerHTML = UPD_ICONS[state];
    $("upd-title").textContent = title;
    $("upd-sub").textContent = sub;
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
    $("dev-name").textContent = i.device.name || i.device.product || "—";
    $("dev-vendor").textContent = i.device.vendor || "—";
    $("dev-power").textContent = powerText(i.power);
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

const BOOT_PHASES = { firmware: "Firmware (UEFI)", loader: "Bootloader (GRUB)", kernel: "Jądro", initrd: "initramfs", userspace: "Usługi systemu" };
async function loadBoot() {
    let b;
    try { b = await api("/boot"); } catch (_) { return; }
    const sec = v => v.toLocaleString("pl-PL", { maximumFractionDigits: 1 }) + " s";
    const rows = [];
    if (b.hmi_shown != null) rows.push(["HMI widoczne", `${sec(b.hmi_shown)} od startu jądra`]);
    for (const p of b.phases || []) rows.push([BOOT_PHASES[p.name] || p.name, p.time]);
    if (b.total) rows.push(["System gotowy po", b.total]);
    if (!rows.length) rows.push(["Stan", b.error || "brak danych"]);
    $("boot-info").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    $("boot-detail").textContent = ["Najdłużej startujące usługi:", ...(b.blame || []), "",
        "Łańcuch startu kiosku (@ = kiedy ruszyła, + = ile trwała):", ...(b.chain || [])].join("\n");
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
    showTab("hmi");
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
