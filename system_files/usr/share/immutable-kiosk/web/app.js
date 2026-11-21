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
            <dt>Nazwa</dt><dd>${esc(n.hostname)}</dd>
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
    $("zoom-val").textContent = Math.round(cfg.zoom * 100) + "%";
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
    const step = d => saveCfg({ zoom: Math.min(3, Math.max(0.5, Math.round((cfg.zoom + d) * 10) / 10)) })
        .then(loadScreen).catch(e => toast(e.message, true));
    $("zoom-minus").addEventListener("click", () => step(-0.1));
    $("zoom-plus").addEventListener("click", () => step(0.1));

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

async function loadSystem() {
    const info = $("sys-info");
    let s;
    try { s = await api("/system"); }
    catch (e) { info.innerHTML = `<dt>Błąd</dt><dd>${esc(e.message)}</dd>`; return; }
    if (!s.available) {
        info.innerHTML = `<dt>bootc</dt><dd>${esc(s.error || "niedostępny")}</dd>`;
    } else {
        const b = s.booted || {};
        info.innerHTML = `
            <dt>Obraz</dt><dd>${esc(b.image || "—")}</dd>
            <dt>Wersja</dt><dd>${esc(b.version || "—")}</dd>
            <dt>Zbudowany</dt><dd>${esc(fmtTime(b.timestamp))}</dd>
            ${s.staged ? `<dt>Po restarcie</dt><dd>${esc(s.staged.version || s.staged.image)}</dd>` : ""}
            ${s.rollback ? `<dt>Poprzednia</dt><dd>${esc(s.rollback.version || s.rollback.image)}</dd>` : ""}`;
        msg($("sys-msg"), s.staged ? "Nowa wersja jest pobrana — uruchom ponownie, aby ją włączyć."
            : s.update ? `Dostępna aktualizacja: ${s.update.version || s.update.digest.slice(0, 19)}` : "", s.staged || s.update ? "ok" : "");
        $("sys-reboot-box").hidden = !s.staged;
        $("sys-rollback").disabled = !s.rollback;
        if (!$("sys-image").value) $("sys-image").value = b.image || "";
    }
    pollJob(job => {
        renderJob(job && job.kind !== "install" ? job : null, sysJobEls());
        const running = job && job.state === "running";
        ["sys-check", "sys-upgrade", "sys-switch", "sys-rollback"].forEach(id => { $(id).disabled = running || (id === "sys-rollback" && !(s && s.rollback)); });
        if (job && job.state !== "running" && job.finished && Date.now() / 1000 - job.finished < 2) loadSystem();
        if (job && job.state === "failed") msg($("sys-msg"), job.detail, "err");
    });
    const i = await api("/info").catch(() => null);
    if (i) $("dev-info").innerHTML = `
        <dt>Urządzenie</dt><dd>${esc(i.device.name || i.device.product || "—")}</dd>
        <dt>Producent</dt><dd>${esc(i.device.vendor || "—")}</dd>
        <dt>Nazwa hosta</dt><dd>${esc(i.hostname)}</dd>
        <dt>Zasilanie</dt><dd>${powerText(i.power)}</dd>
        <dt>Czas</dt><dd>${esc(i.time)}</dd>`;
}

function initSystem() {
    const startJob = path => e => busy(e.currentTarget, async () => {
        msg($("sys-msg"), "");
        await api(path, {});
        loadSystem();
    }).catch(() => {});
    $("sys-check").addEventListener("click", startJob("/system/check"));
    $("sys-upgrade").addEventListener("click", startJob("/system/upgrade"));
    holdButton($("sys-switch"), () => api("/system/switch", { image: $("sys-image").value.trim() })
        .then(loadSystem).catch(e => toast(e.message, true)));
    holdButton($("sys-rollback"), () => api("/system/rollback", {})
        .then(() => { toast("Poprzednia wersja uruchomi się po restarcie"); loadSystem(); }).catch(e => toast(e.message, true)));
    const power = action => () => api("/power", { action }).then(() => toast(action === "reboot" ? "Ponowne uruchamianie…" : "Wyłączanie…"))
        .catch(e => toast(e.message, true));
    holdButton($("sys-reboot-now"), power("reboot"));
    holdButton($("pw-reboot"), power("reboot"));
    holdButton($("pw-off"), power("poweroff"));
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
