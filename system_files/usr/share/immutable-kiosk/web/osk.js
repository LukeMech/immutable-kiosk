/*
 * On-screen keyboard. Self-contained: loaded by the Settings page and
 * injected by kiosk-shell into every HMI frame (WebKit user script).
 * Types with execCommand("insertText") so frameworks (TcHmi, React) see
 * real input events. Lives in a closed shadow root, isolated from page CSS.
 * "ąę" accents the next letter, like AltGr.
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
            ["{sym}", "{pl}", ",", "{space}", ".", "{enter}", "{hide}"],
        ],
        sym: [
            ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
            ["@", "#", "$", "%", "&", "*", "-", "+", "(", ")"],
            ["!", "\"", "'", ":", ";", "/", "?", "_", "="],
            ["[", "]", "{", "}", "<", ">", "\\", "|", "{bksp}"],
            ["{abc}", "~", "^", "{space}", ".", "{enter}", "{hide}"],
        ],
        num: [
            ["1", "2", "3"],
            ["4", "5", "6"],
            ["7", "8", "9"],
            [".", "0", "-"],
            ["{abc}", "{bksp}", "{enter}", "{hide}"],
        ],
    };

    const LABELS = {
        "{shift}": "⇧", "{bksp}": "⌫", "{enter}": "↵", "{hide}": "⌨▾",
        "{space}": " ", "{sym}": "?123", "{abc}": "ABC", "{pl}": "ąę",
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
    button {
        all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0;
        height: clamp(48px, 7.2vh, 66px); border-radius: 10px;
        background: #2b3542; color: inherit; font: inherit;
        display: flex; align-items: center; justify-content: center;
        position: relative; cursor: default;
    }
    button.fn { background: #222b36; font-size: 19px; color: #b9c5d1; }
    button.on { background: var(--ik-accent, #2f81f7); color: #fff; }
    button.lock { background: var(--ik-accent, #1f6feb); color: #fff; box-shadow: inset 0 -3px 0 #fff; }
    button.down { filter: brightness(1.45); }
    button.enter { background: #238636; color: #fff; }
    button sup { position: absolute; top: 4px; right: 7px; font-size: 13px; color: #8fb8ff; }
    `;

    let host = null, root = null, kb = null;
    let target = null, layout = "abc", shift = 0 /* 0 off, 1 once, 2 lock */, pl = false;
    let lastShiftTap = 0, hideTimer = null, repeatTimer = null;

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
        const style = document.createElement("style");
        style.textContent = CSS;
        kb = document.createElement("div");
        kb.className = "kb";
        kb.hidden = true;
        root.append(style, kb);
        (document.body || document.documentElement).appendChild(host);
        // Keep focus in the field: nothing on the keyboard may take it.
        for (const ev of ["pointerdown", "mousedown", "touchstart"]) {
            kb.addEventListener(ev, e => e.preventDefault(), { passive: false });
        }
        kb.addEventListener("pointerdown", onDown);
        kb.addEventListener("pointerup", onUp);
        kb.addEventListener("pointercancel", stopRepeat);
        kb.addEventListener("pointerleave", stopRepeat);
    }

    function render() {
        const rows = LAYOUTS[layout];
        kb.classList.toggle("num", layout === "num");
        kb.replaceChildren(...rows.map(row => {
            const r = document.createElement("div");
            r.className = "row";
            for (const key of row) {
                const b = document.createElement("button");
                b.dataset.key = key;
                const special = key.startsWith("{") && key.length > 1;
                if (special) {
                    b.textContent = LABELS[key] || key;
                    b.className = "fn";
                    if (key === "{shift}" && shift) b.className = shift === 2 ? "lock" : "on";
                    if (key === "{pl}" && pl) b.className = "on";
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

    function backspace() {
        const el = target || document.activeElement;
        if (!el) return;
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
        if (el.tagName === "TEXTAREA" || el.isContentEditable) {
            insert("\n");
            return;
        }
        const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        const notCancelled = el.dispatchEvent(new KeyboardEvent("keydown", init));
        el.dispatchEvent(new KeyboardEvent("keypress", init));
        el.dispatchEvent(new KeyboardEvent("keyup", init));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (notCancelled && el.form) {
            if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit();
        }
        el.blur();
        hide();
    }

    function press(key) {
        switch (key) {
            case "{shift}": {
                const now = Date.now();
                shift = shift === 0 ? (now - lastShiftTap < 350 ? 2 : 1) : (shift === 1 && now - lastShiftTap < 350 ? 2 : 0);
                lastShiftTap = now;
                break;
            }
            case "{bksp}": backspace(); return;
            case "{enter}": enter(); return;
            case "{hide}":
                if (target) target.blur();
                hide();
                return;
            case "{space}": insert(" "); break;
            case "{sym}": layout = "sym"; break;
            case "{abc}": layout = "abc"; break;
            case "{pl}": pl = !pl; break;
            default: {
                let ch = pl && PL[key] ? PL[key] : key;
                if (shift) ch = ch.toUpperCase();
                insert(ch);
                if (shift === 1) shift = 0;
                pl = false;
            }
        }
        render();
    }

    function keyOf(e) {
        const b = e.target.closest && e.target.closest("button");
        return b ? b : null;
    }

    function onDown(e) {
        const b = keyOf(e);
        if (!b) return;
        b.classList.add("down");
        if (b.dataset.key === "{bksp}") {
            backspace();
            // Hold to keep deleting.
            repeatTimer = setTimeout(function rep() {
                backspace();
                repeatTimer = setTimeout(rep, 70);
            }, 450);
            b.dataset.repeated = "1";
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
        if (!b) return;
        if (b.dataset.repeated) {
            delete b.dataset.repeated;
            return;
        }
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
