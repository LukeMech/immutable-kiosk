/* i18n.js -- Settings and the installer in English (the default) or Polish.
 *
 * The page is written in Polish. In any other language every text node and
 * the placeholder / title / aria-label attributes are translated as they
 * appear -- a MutationObserver over the whole document -- from that
 * language's dictionary, lang/<code>.js: EXACT (whole strings, trimmed) and
 * PATTERNS (anchored regular expressions for strings with values in them:
 * the first that matches wins, its $1, $2... carry the values over). kioskd's messages (errors, job titles and steps, boot
 * timeline labels) reach the page as Polish text and are translated the
 * same way. Anything not listed stays Polish: add it to the dictionary.
 *
 * The language is kioskd's config "language" (app.js calls i18n.use with
 * it); the last one is remembered in localStorage, so the page doesn't
 * flash in Polish before the config arrives.
 */
(function () {
    "use strict";

    // The dictionaries (lang/<code>.js, loaded before this file): each is a
    // function of `tr`, for patterns that translate a value inside them.
    const DICTS = {};
    for (const [code, make] of Object.entries(window.I18N_LANGS || {})) DICTS[code] = make(tr);
    const ATTRS = ["placeholder", "title", "aria-label"];
    const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"]);

    let lang = "en";
    try { lang = localStorage.getItem("ik-lang") || "en"; } catch (_) { /* no storage */ }

    function tr(text) {
        const dict = DICTS[lang];
        if (!dict || !text) return text;
        const s = text.trim();
        if (!s) return text;
        let out = dict.EXACT[s];
        if (out === undefined) {
            for (const [re, rep] of dict.PATTERNS) {
                if (re.test(s)) { out = s.replace(re, rep); break; }
            }
        }
        return out === undefined ? text : text.replace(s, out);
    }

    function skipped(node) {
        for (let el = node.parentElement; el; el = el.parentElement) {
            if (SKIP.has(el.tagName) || el.hasAttribute("translate") && el.getAttribute("translate") === "no") return true;
        }
        return false;
    }

    function doText(n) {
        if (skipped(n)) return;
        const t = tr(n.nodeValue);
        if (t !== n.nodeValue) n.nodeValue = t;
    }

    function doElement(el) {
        for (const a of ATTRS) {
            const v = el.getAttribute(a);
            if (v) {
                const t = tr(v);
                if (t !== v) el.setAttribute(a, t);
            }
        }
    }

    function walk(root) {
        if (root.nodeType === Node.TEXT_NODE) { doText(root); return; }
        if (root.nodeType !== Node.ELEMENT_NODE || SKIP.has(root.tagName)) return;
        doElement(root);
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
            if (n.nodeType === Node.TEXT_NODE) doText(n);
            else doElement(n);
        }
    }

    const observer = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === "characterData") doText(m.target);
            else if (m.type === "attributes") doElement(m.target);
            else m.addedNodes.forEach(walk);
        }
    });

    function start() {
        document.documentElement.lang = lang;
        if (!DICTS[lang]) return;
        walk(document.body);
        observer.observe(document.body, {
            subtree: true, childList: true, characterData: true,
            attributes: true, attributeFilter: ATTRS,
        });
    }

    window.i18n = {
        get lang() { return lang; },
        tr,
        // The language kioskd has: a different one than the page started
        // with reloads the page in it.
        use(l) {
            l = l || "en";
            try { localStorage.setItem("ik-lang", l); } catch (_) { /* no storage */ }
            if (l !== lang) location.reload();
        },
    };

    start();
})();
