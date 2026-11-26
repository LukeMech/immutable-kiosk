/*
 * On-screen keyboard. Self-contained: loaded by the Settings page and
 * injected by kiosk-shell into every HMI frame (WebKit user script).
 * Types with execCommand("insertText") so frameworks (TcHmi, React) see
 * real input events. Lives in a closed shadow root, isolated from page CSS.
 * "ąę" accents the next letter, like AltGr.
 * "Fn" shows an extra row (remembered per page): Esc, Tab, Ctrl, Alt, Home,
 * arrows, End -- for terminals and editors. They go out as key events; a
 * page that doesn't take one (cancels its keydown) gets its usual effect
 * from here: Tab to the next field, the caret moved, Ctrl+A/C/X/V/Z/Y.
 * Ctrl and Alt hold for the next key (twice: locked), as Shift.
 * Coloured by the accent (Settings → Display), --ik-accent: inherited from
 * the Settings page; in the HMI kiosk-shell passes it in
 * (window.__kioskOskAccent) and changes it live (__kioskOskSetAccent).
 */
(() => {
    "use strict";
    if (window.__kioskOsk) return;
    window.__kioskOsk = true;

    const PL = { a: "ą", c: "ć", e: "ę", l: "ł", n: "ń", o: "ó", s: "ś", z: "ż", x: "ź" };

    const LAYOUTS = {
        abc: [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
            ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
            ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
            ["{shift}", "z", "x", "c", "v", "b", "n", "m", "{bksp}"],
            ["{sym}", "{ext}", "{pl}", ",", "{space}", ".", "{enter}", "{hide}"],
        ],
        sym: [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
            ["@", "#", "$", "%", "&", "*", "-", "+", "(", ")"],
            ["!", "\"", "'", ":", ";", "/", "?", "_", "=", "`"],
            ["[", "]", "{", "}", "<", ">", "\\", "|", "{bksp}"],
            ["{abc}", "{ext}", "~", "^", "{space}", ".", "{enter}", "{hide}"],
        ],
        num: [
            ["1", "2", "3"],
            ["4", "5", "6"],
            ["7", "8", "9"],
            [".", "0", "-"],
            ["{abc}", "{bksp}", "{enter}", "{hide}"],
        ],
    };

    // "Fn": above abc and sym (not the number pad).
    const EXT_ROW = ["{esc}", "{tab}", "{ctrl}", "{alt}", "{home}", "{left}", "{up}", "{down}", "{right}", "{end}"];
    // Keys sent as events only: [key, keyCode].
    const KEYS = {
        "{esc}": ["Escape", 27], "{tab}": ["Tab", 9], "{home}": ["Home", 36], "{end}": ["End", 35],
        "{left}": ["ArrowLeft", 37], "{up}": ["ArrowUp", 38], "{right}": ["ArrowRight", 39], "{down}": ["ArrowDown", 40],
    };
    // Held down: again and again (as Backspace).
    const REPEAT = new Set(["{bksp}", "{left}", "{up}", "{right}", "{down}"]);
    // keyCode of a punctuation key, for Ctrl/Alt with it (US layout).
    const PUNCT = { "-": 189, "=": 187, "[": 219, "]": 221, "\\": 220, ";": 186, "'": 222, ",": 188,
                    ".": 190, "/": 191, "`": 192 };
    const EXT_SAVED = "kiosk-osk-ext";

    const LABELS = {
        "{shift}": "⇧", "{bksp}": "⌫", "{enter}": "↵", "{hide}": "⌨▾",
        "{space}": " ", "{sym}": "?123", "{abc}": "ABC", "{pl}": "ąę", "{ext}": "Fn",
        "{esc}": "Esc", "{tab}": "Tab", "{ctrl}": "Ctrl", "{alt}": "Alt", "{home}": "Home", "{end}": "End",
        "{left}": "←", "{up}": "↑", "{right}": "→", "{down}": "↓",
    };
    const WIDE = { "{space}": 4, "{shift}": 1.5, "{bksp}": 1.5, "{enter}": 1.5, "{sym}": 1.4, "{abc}": 1.4 };

    const CSS = `
    :host { all: initial; }
    .kb {
        position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483647;
        background: #1b222c; border-top: 1px solid #3a4655;
        box-shadow: 0 -6px 24px rgba(0,0,0,.45);
        padding: 8px 6px calc(8px + env(safe-area-inset-bottom, 0px));
        font: 600 22px/1 "Noto Sans", system-ui, sans-serif; color: #e6edf3;
        -webkit-user-select: none; user-select: none; touch-action: manipulation;
        display: flex; flex-direction: column; gap: 6px;
    }
    /* display: flex above beats the UA's [hidden] { display: none }: without
       this, kb.hidden = true never hid anything (⌨▾, ↵, a tap elsewhere). */
    .kb[hidden] { display: none; }
    .kb.top { top: 0; bottom: auto; border-top: 0; border-bottom: 1px solid #3a4655;
        box-shadow: 0 6px 24px rgba(0,0,0,.45); }
    .kb.num { left: 50%; right: auto; transform: translateX(-50%); width: min(560px, 100%);
        border-left: 1px solid #3a4655; border-right: 1px solid #3a4655; border-radius: 14px 14px 0 0; }
    .kb.num.top { border-radius: 0 0 14px 14px; }
    .kb.num button { height: clamp(56px, 8.5vh, 76px); font-size: 26px; }
    .row { display: flex; gap: 6px; }
    .row.ext button { height: clamp(40px, 6vh, 54px); font-size: 17px; }
    button {
        all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0;
        height: clamp(48px, 7.2vh, 66px); border-radius: 10px;
        background: #2b3542; color: inherit; font: inherit;
        display: flex; align-items: center; justify-content: center;
        position: relative; cursor: default;
    }
    button.fn { background: #222b36; font-size: 19px; color: #b9c5d1; }
    button.on { background: var(--ik-accent, #2f81f7); color: #fff; }
    button.lock { background: var(--ik-accent, #2f81f7); color: #fff; box-shadow: inset 0 -3px 0 #fff; }
    button.down { filter: brightness(1.45); }
    button.enter { background: var(--ik-accent, #2f81f7); color: #fff; }
    button sup { position: absolute; top: 4px; right: 7px; font-size: 13px;
        color: color-mix(in srgb, var(--ik-accent, #2f81f7) 45%, #fff); }
    `;

    let host = null, root = null, kb = null;
    let target = null, layout = "abc", shift = 0 /* 0 off, 1 once, 2 lock */, pl = false;
    let lastShiftTap = 0, hideTimer = null, repeatTimer = null, repeated = false;
    // Ctrl / Alt as Shift: 0 off, 1 the next key, 2 locked.
    const mods = { ctrl: 0, alt: 0 }, lastModTap = { ctrl: 0, alt: 0 };
    let ext = false;
    try { ext = localStorage.getItem(EXT_SAVED) === "1"; } catch (_) { /* storage off */ }

    // The accent from kiosk-shell, on the keyboard's own element: an inline
    // style set from script, which a strict CSP allows.
    function setAccent(hex) {
        if (host && /^#[0-9a-f]{6}$/i.test(hex || "")) host.style.setProperty("--ik-accent", hex);
    }
    window.__kioskOskSetAccent = hex => { window.__kioskOskAccent = hex; setAccent(hex); };

    function editable(el) {
        if (!el || el.disabled || el.readOnly) return false;
        if (el.closest && el.closest("[data-osk='off']")) return false;
        if ((el.getAttribute && el.getAttribute("inputmode")) === "none") return false;
        if (el.isContentEditable) return true;
        if (el.tagName === "TEXTAREA") return true;
        if (el.tagName !== "INPUT") return false;
        return ["", "text", "password", "email", "number", "search", "tel", "url"].includes(
            (el.getAttribute("type") || "").toLowerCase());
    }

    function wantsNumpad(el) {
        const t = (el.getAttribute && el.getAttribute("type") || "").toLowerCase();
        const m = (el.getAttribute && el.getAttribute("inputmode") || "").toLowerCase();
        return t === "number" || t === "tel" || m === "numeric" || m === "decimal" || m === "tel";
    }

    function ensure() {
        if (host && host.isConnected) return;
        host = document.createElement("kiosk-osk");
        root = host.attachShadow({ mode: "closed" });
        kb = document.createElement("div");
        kb.className = "kb";
        kb.hidden = true;
        root.append(kb);
        // A constructed sheet, not a <style>: pages with a strict CSP
        // (style-src without 'unsafe-inline', e.g. Authelia logins) block
        // injected <style> elements, which left the keyboard unstyled.
        try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(CSS);
            root.adoptedStyleSheets = [sheet];
        } catch (_) {
            const style = document.createElement("style");
            style.textContent = CSS;
            root.prepend(style);
        }
        (document.body || document.documentElement).appendChild(host);
        setAccent(window.__kioskOskAccent);
        // Keep focus in the field: nothing on the keyboard may take it.
        for (const ev of ["pointerdown", "mousedown", "touchstart"]) {
            kb.addEventListener(ev, e => e.preventDefault(), { passive: false });
        }
        kb.addEventListener("pointerdown", onDown);
        kb.addEventListener("pointerup", onUp);
        const cancelRepeat = () => { stopRepeat(); repeated = false; };
        kb.addEventListener("pointercancel", cancelRepeat);
        kb.addEventListener("pointerleave", cancelRepeat);
        // A finger lifted anywhere ends a repeat, even if its pointerup
        // never reached the keyboard; repeated is left to onUp if it did.
        window.addEventListener("pointerup", () => {
            stopRepeat();
            setTimeout(() => { repeated = false; }, 0);
        }, true);
    }

    function render() {
        const rows = layout !== "num" && ext ? [EXT_ROW, ...LAYOUTS[layout]] : LAYOUTS[layout];
        kb.classList.toggle("num", layout === "num");
        kb.replaceChildren(...rows.map(row => {
            const r = document.createElement("div");
            r.className = row === EXT_ROW ? "row ext" : "row";
            for (const key of row) {
                const b = document.createElement("button");
                b.dataset.key = key;
                const special = key.startsWith("{") && key.length > 1;
                if (special) {
                    b.textContent = LABELS[key] || key;
                    b.className = "fn";
                    if (key === "{shift}" && shift) b.className = shift === 2 ? "lock" : "on";
                    if (key === "{ctrl}" && mods.ctrl) b.className = mods.ctrl === 2 ? "lock" : "on";
                    if (key === "{alt}" && mods.alt) b.className = mods.alt === 2 ? "lock" : "on";
                    if (key === "{pl}" && pl) b.className = "on";
                    if (key === "{ext}" && ext) b.className = "on";
                    if (key === "{enter}") b.className = "enter";
                } else {
                    let ch = key;
                    if (pl && PL[key]) ch = PL[key];
                    b.textContent = shift ? ch.toUpperCase() : ch;
                    if (!pl && PL[key] && layout === "abc") {
                        const s = document.createElement("sup");
                        s.textContent = shift ? PL[key].toUpperCase() : PL[key];
                        b.appendChild(s);
                    }
                }
                if (WIDE[key]) b.style.flexGrow = WIDE[key];
                r.appendChild(b);
            }
            return r;
        }));
    }

    function show(el) {
        ensure();
        clearTimeout(hideTimer);
        target = el;
        layout = wantsNumpad(el) ? "num" : (layout === "num" ? "abc" : layout);
        render();
        kb.hidden = false;
        announce(true);
        place();
    }

    // Settings adds bottom room on this; an event since we also run in HMI pages.
    function announce(open) {
        window.dispatchEvent(new CustomEvent("kiosk-osk", { detail: { open } }));
    }

    function place() {
        if (!target || kb.hidden) return;
        const r = target.getBoundingClientRect();
        // Low field: keyboard goes on top (HMI pages usually can't scroll).
        const kbH = kb.getBoundingClientRect().height || window.innerHeight * 0.4;
        const top = r.bottom > window.innerHeight - kbH - 12 && r.top > kbH + 12;
        kb.classList.toggle("top", top);
        if (!top && r.bottom > window.innerHeight - kbH) {
            target.scrollIntoView({ block: "center", behavior: "smooth" });
        }
    }

    function hide() {
        const was = kb && !kb.hidden;
        if (kb) kb.hidden = true;
        target = null;
        shift = 0;
        pl = false;
        mods.ctrl = mods.alt = 0;
        if (was) announce(false);
    }

    function insert(text) {
        const el = target || document.activeElement;
        if (!el) return;
        if (document.execCommand && document.execCommand("insertText", false, text)) return;
        // Fallback: edit the value and fire input.
        if ("value" in el) {
            const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
            try { el.setRangeText(text, s, e, "end"); } catch (_) { el.value += text; }
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
        }
    }

    // A key event as a real keyboard sends it. keyCode/which/charCode can't
    // be set through the constructor (WebKit leaves them 0), and pages that
    // read them -- xterm.js terminals (TwinCAT/BSD's web console), older
    // frameworks -- saw no key at all: defined on the event instead.
    function keyEvent(el, type, key, code, mod = {}, physical = key) {
        const ev = new KeyboardEvent(type, { key, code: physical, bubbles: true, cancelable: true, composed: true,
                                             ctrlKey: !!mod.ctrl, altKey: !!mod.alt, shiftKey: !!mod.shift });
        for (const prop of ["keyCode", "which"]) Object.defineProperty(ev, prop, { get: () => code });
        Object.defineProperty(ev, "charCode", { get: () => (type === "keypress" ? code : 0) });
        return el.dispatchEvent(ev);  // false: the page handled the key (preventDefault)
    }

    // The modifiers for this key; Ctrl/Alt held for one key let go after it.
    function takeMods() {
        const m = { ctrl: mods.ctrl > 0, alt: mods.alt > 0, shift: shift > 0 };
        for (const k of ["ctrl", "alt"]) if (mods[k] === 1) mods[k] = 0;
        return m;
    }

    // A key as a real keyboard sends it; if the page didn't take it
    // (keydown not cancelled), fallback(el, mods) does its usual effect.
    function sendKey(key, code, physical, fallback) {
        const el = target || document.activeElement;
        if (!el) return;
        const m = takeMods();
        if (keyEvent(el, "keydown", key, code, m, physical) && fallback) fallback(el, m);
        keyEvent(el, "keyup", key, code, m, physical);
    }

    // Backspace and Enter go out as real keys: keydown first. A page that
    // handles one itself (a terminal sends it on, an editor acts on it)
    // cancels the keydown, and then the key's usual effect is left out.
    function backspace() {
        sendKey("Backspace", 8, "Backspace", deleteBack);
    }

    // A character with Ctrl or Alt: only the key events (Ctrl+C in a
    // terminal); in a field Ctrl+A/C/X/V/Z/Y do what they would.
    const CTRL_COMMANDS = { a: "selectAll", c: "copy", x: "cut", v: "paste", z: "undo", y: "redo" };
    function combo(ch) {
        const lower = ch.toLowerCase();
        let code = ch.charCodeAt(0), physical = "";
        if (/^[a-z]$/.test(lower)) { code = lower.toUpperCase().charCodeAt(0); physical = "Key" + lower.toUpperCase(); }
        else if (/^[0-9]$/.test(ch)) physical = "Digit" + ch;
        else if (ch === " ") { code = 32; physical = "Space"; }
        else if (PUNCT[ch]) code = PUNCT[ch];
        sendKey(ch, code, physical, (el, m) => {
            const cmd = m.ctrl && !m.alt && CTRL_COMMANDS[lower];
            if (!cmd) return;
            if (cmd === "selectAll" && el.select) el.select();
            else try { document.execCommand(cmd, false); } catch (_) { /* not allowed here */ }
        });
    }

    // Tab: the next (Shift: previous) field or control, as the real key.
    function tabFrom(el, m) {
        const all = [...document.querySelectorAll(
            "input, textarea, select, button, a[href], [tabindex], [contenteditable='true']")]
            .filter(x => x.tabIndex >= 0 && !x.disabled && x.getClientRects().length);
        const i = all.indexOf(el);
        const next = all[i < 0 ? 0 : (i + (m.shift ? -1 : 1) + all.length) % all.length];
        if (next && next !== el) next.focus();
    }

    // Arrows, Home, End: the caret, when the page didn't move it itself.
    function caret(el, key) {
        if (el.isContentEditable || !("value" in el)) {
            const how = { ArrowLeft: ["backward", "character"], ArrowRight: ["forward", "character"],
                          ArrowUp: ["backward", "line"], ArrowDown: ["forward", "line"],
                          Home: ["backward", "lineboundary"], End: ["forward", "lineboundary"] }[key];
            try { window.getSelection().modify("move", how[0], how[1]); } catch (_) { /* no selection */ }
            return;
        }
        let pos;
        try { pos = el.selectionStart; } catch (_) { return; }  // number, email: no caret to move
        if (pos == null) return;
        const v = el.value;
        if (key === "ArrowLeft") pos = Math.max(0, (el.selectionStart === el.selectionEnd ? pos - 1 : pos));
        else if (key === "ArrowRight") pos = el.selectionStart === el.selectionEnd ? Math.min(v.length, pos + 1) : el.selectionEnd;
        else if (key === "Home") pos = v.lastIndexOf("\n", pos - 1) + 1;
        else if (key === "End") { const e = v.indexOf("\n", pos); pos = e < 0 ? v.length : e; }
        else {
            // Up/Down in a textarea: the same column on the line above/below.
            const start = v.lastIndexOf("\n", pos - 1) + 1, col = pos - start;
            if (key === "ArrowUp") {
                if (start === 0) pos = 0;
                else { const prev = v.lastIndexOf("\n", start - 2) + 1; pos = Math.min(prev + col, start - 1); }
            } else {
                const end = v.indexOf("\n", pos);
                if (end < 0) pos = v.length;
                else { const nextEnd = v.indexOf("\n", end + 1); pos = Math.min(end + 1 + col, nextEnd < 0 ? v.length : nextEnd); }
            }
        }
        el.setSelectionRange(pos, pos);
    }

    function toggleMod(name) {
        const now = Date.now(), quick = now - lastModTap[name] < 350;
        mods[name] = mods[name] === 0 ? (quick ? 2 : 1) : (mods[name] === 1 && quick ? 2 : 0);
        lastModTap[name] = now;
    }

    function deleteBack(el) {
        if (document.execCommand && document.execCommand("delete", false)) return;
        if ("value" in el) {
            let s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
            if (s === e && s > 0) s -= 1;
            try { el.setRangeText("", s, e, "end"); } catch (_) { el.value = el.value.slice(0, -1); }
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
        }
    }

    function enter() {
        const el = target;
        if (!el) return;
        const multiline = el.tagName === "TEXTAREA" || el.isContentEditable;
        const m = takeMods();
        const pressed = keyEvent(el, "keydown", "Enter", 13, m) && keyEvent(el, "keypress", "Enter", 13, m);
        // A line break unless the page took the key (a terminal's hidden
        // textarea, a chat box sending on Enter); the keyboard stays open.
        if (multiline && pressed) insert("\n");
        keyEvent(el, "keyup", "Enter", 13, m);
        if (multiline) return;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (pressed && el.form) {
            if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit();
        }
        el.blur();
        hide();
    }

    function press(key) {
        const before = looks();
        switch (key) {
            case "{shift}": {
                const now = Date.now();
                shift = shift === 0 ? (now - lastShiftTap < 350 ? 2 : 1) : (shift === 1 && now - lastShiftTap < 350 ? 2 : 0);
                lastShiftTap = now;
                break;
            }
            case "{ctrl}": toggleMod("ctrl"); break;
            case "{alt}": toggleMod("alt"); break;
            case "{ext}":
                ext = !ext;
                try { localStorage.setItem(EXT_SAVED, ext ? "1" : "0"); } catch (_) { /* storage off */ }
                render();
                place();
                return;
            case "{bksp}": backspace(); break;
            case "{enter}": enter(); break;
            case "{tab}": sendKey("Tab", 9, "Tab", tabFrom); break;
            case "{esc}": case "{home}": case "{end}":
            case "{left}": case "{up}": case "{right}": case "{down}": {
                const [k, code] = KEYS[key];
                sendKey(k, code, k, k === "Escape" ? null : el => caret(el, k));
                break;
            }
            case "{hide}":
                if (target) target.blur();
                hide();
                return;
            case "{space}":
                if (mods.ctrl || mods.alt) combo(" "); else insert(" ");
                break;
            case "{sym}": layout = "sym"; break;
            case "{abc}": layout = "abc"; break;
            case "{pl}": pl = !pl; break;
            default: {
                let ch = pl && PL[key] && !(mods.ctrl || mods.alt) ? PL[key] : key;
                if (shift) ch = ch.toUpperCase();
                if (mods.ctrl || mods.alt) combo(ch); else insert(ch);
                if (shift === 1) shift = 0;
                pl = false;
            }
        }
        // Drawn anew only when it looks different: not under a held finger
        // for nothing (a repeating key).
        if (kb && !kb.hidden && looks() !== before) render();
    }

    function looks() {
        return [layout, shift, pl, mods.ctrl, mods.alt, ext].join();
    }

    function keyOf(e) {
        const b = e.target.closest && e.target.closest("button");
        return b ? b : null;
    }

    function onDown(e) {
        const b = keyOf(e);
        if (!b) return;
        b.classList.add("down");
        const key = b.dataset.key;
        if (REPEAT.has(key)) {
            press(key);
            // Hold to keep deleting / moving. (A module flag, not one on the
            // button: press() may draw the keys anew under the finger.)
            repeated = true;
            repeatTimer = setTimeout(function rep() {
                press(key);
                repeatTimer = setTimeout(rep, 70);
            }, 450);
        }
    }

    function stopRepeat() {
        clearTimeout(repeatTimer);
        repeatTimer = null;
        if (kb) kb.querySelectorAll(".down").forEach(x => x.classList.remove("down"));
    }

    function onUp(e) {
        const b = keyOf(e);
        stopRepeat();
        if (repeated) {
            repeated = false;  // it acted while held
            return;
        }
        if (!b) return;
        press(b.dataset.key);
    }

    document.addEventListener("focusin", e => {
        const el = e.composedPath ? e.composedPath()[0] : e.target;
        if (editable(el)) show(el);
    }, true);

    document.addEventListener("focusout", () => {
        // Hide unless focus moved to another field.
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            const a = document.activeElement;
            if (!editable(a)) hide();
        }, 120);
    }, true);

    // A tap elsewhere closes it: on touch WebKitGTK often keeps focus in the
    // field, so focusout isn't enough. Blur after the click went through.
    document.addEventListener("pointerdown", e => {
        if (!kb || kb.hidden) return;
        const path = e.composedPath ? e.composedPath() : [e.target];
        if (path.includes(host) || editable(path[0])) return;
        // A field's <label> focuses the field: counts as a field tap.
        const label = path[0].closest && path[0].closest("label");
        if (label && label.control && editable(label.control)) return;
        const field = target;
        setTimeout(() => {
            if (document.activeElement === field && field) field.blur();
            if (!editable(document.activeElement)) hide();
        }, 0);
    }, true);

    // Re-tapping the focused field (after ⌨▾) brings the keyboard back.
    document.addEventListener("pointerup", e => {
        const el = e.composedPath ? e.composedPath()[0] : e.target;
        if (editable(el) && el === document.activeElement && (!kb || kb.hidden)) show(el);
    }, true);

    window.addEventListener("resize", place);
    window.kioskOsk = { show, hide };
})();
