/* i18n.js -- the page is written in English; other languages translate it
 * live from lang/<code>.js. A MutationObserver translates every text node and
 * placeholder / title / aria-label as it appears: EXACT (whole trimmed
 * strings). Unlisted text stays English.
 * Text with values comes from templates: i18n.t("Connected to {ssid}",
 * {ssid}) in app.js; kioskd's own (Msg) arrive with each API answer as
 * "_i18n" {English text: [template, values]}, which api() hands to
 * i18n.learn, so the observer translates them like the page's own. A
 * template's translation is EXACT[template]: the same {names}, or a function
 * of the values.
 * The language comes from kioskd's config (app.js calls i18n.use) and is
 * cached in localStorage so the page doesn't flash English first. Each
 * node's English original is kept, so a change of language re-translates the
 * page in place, no reload.
 */
(function () {
    "use strict";

    // lang/<code>.js (loaded first): each gets `tr` for nested values.
    const DICTS = {};
    for (const [code, make] of Object.entries(window.I18N_LANGS || {})) DICTS[code] = make(tr);
    const ATTRS = ["placeholder", "title", "aria-label"];
    const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"]);

    let lang = "en";
    try { lang = localStorage.getItem("ik-lang") || "en"; } catch (_) { /* no storage */ }

    // kioskd's texts with values: English text -> [template, values].
    const LEARNED = new Map();

    // A template filled in, in the page's language. Values are translated
    // too when they're English text themselves (a job's title in an error);
    // a function translation gets them as they are.
    function t(template, values) {
        const v = values || {};
        const dict = DICTS[lang];
        const out = dict ? dict.EXACT[template] : undefined;
        if (typeof out === "function") return out(v);
        return (out === undefined ? template : out).replace(/\{(\w+)\}/g, (m, k) =>
            k in v ? (dict ? tr(String(v[k])) : String(v[k])) : m);
    }

    function tr(text) {
        const dict = DICTS[lang];
        if (!dict || !text) return text;
        const s = text.trim();
        if (!s) return text;
        let out = dict.EXACT[s];
        if (typeof out !== "string") {
            const known = LEARNED.get(s);
            out = known ? t(known[0], known[1]) : undefined;
        }
        return out === undefined ? text : text.replace(s, out);
    }

    function skipped(node) {
        for (let el = node.parentElement; el; el = el.parentElement) {
            if (SKIP.has(el.tagName) || el.hasAttribute("translate") && el.getAttribute("translate") === "no") return true;
        }
        return false;
    }

    // node -> {orig, out}: the English it had and what it was turned into.
    // A value equal to `out` is our own translation; anything else is new.
    const TEXTS = new WeakMap();
    const ATTRS_DONE = new WeakMap();   // element -> {attr: {orig, out}}

    function doText(n, again) {
        if (skipped(n)) return;
        const cur = n.nodeValue, k = TEXTS.get(n);
        if (k && k.out === cur && !again) return;
        const orig = k && k.out === cur ? k.orig : cur;
        const out = tr(orig);
        TEXTS.set(n, { orig, out });
        if (out !== cur) n.nodeValue = out;
    }

    function doElement(el, again) {
        let done = ATTRS_DONE.get(el);
        for (const a of ATTRS) {
            const cur = el.getAttribute(a);
            if (!cur) continue;
            const k = done && done[a];
            if (k && k.out === cur && !again) continue;
            const orig = k && k.out === cur ? k.orig : cur;
            const out = tr(orig);
            if (!done) ATTRS_DONE.set(el, done = {});
            done[a] = { orig, out };
            if (out !== cur) el.setAttribute(a, out);
        }
    }

    function walk(root, again) {
        if (root.nodeType === Node.TEXT_NODE) { doText(root, again); return; }
        if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.tagName)) return;
        doElement(root, again);
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
            if (n.nodeType === Node.TEXT_NODE) doText(n, again);
            else doElement(n, again);
        }
    }

    const observer = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === "characterData") doText(m.target);
            else if (m.type === "attributes") doElement(m.target);
            else m.addedNodes.forEach(walk);
        }
    });

    const OBSERVE = { subtree: true, childList: true, characterData: true,
                      attributes: true, attributeFilter: ATTRS };

    function start() {
        document.documentElement.lang = lang;
        walk(document.body);
        observer.observe(document.body, OBSERVE);
    }

    window.i18n = {
        get lang() { return lang; },
        tr,
        t,
        // kioskd's "_i18n": its texts with values, as it built them.
        learn(map) {
            for (const [text, tv] of Object.entries(map || {})) {
                LEARNED.delete(text);
                LEARNED.set(text, tv);
            }
            // Progress texts change every second: keep the newest only.
            for (const old of LEARNED.keys()) {
                if (LEARNED.size <= 300) break;
                LEARNED.delete(old);
            }
        },
        // kioskd's language: the page re-translated in place if it differs.
        // True if it changed (app.js then redraws what it formats itself).
        use(l) {
            l = l || "en";
            try { localStorage.setItem("ik-lang", l); } catch (_) { /* no storage */ }
            if (l === lang) return false;
            lang = l;
            document.documentElement.lang = lang;
            observer.disconnect();          // our own changes aren't news
            walk(document.body, true);
            observer.observe(document.body, OBSERVE);
            return true;
        },
    };

    start();
})();
