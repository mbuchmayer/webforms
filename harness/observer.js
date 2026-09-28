/*
 * Web Form embed test observer.
 *
 * Loaded BEFORE the client embed snippet so it sees every postMessage the
 * iframe sends — including message types the snippet silently drops.
 * The snippet only dispatches types it has a callback for
 * (`et[e.data.type]?.(...)`), so an undocumented event such as a session
 * expiry notice would be invisible to a real client. This observer is how
 * we find out whether any such event exists.
 *
 * It does not modify the snippet or the iframe; it only listens.
 */
(function () {
    'use strict';

    // Callbacks documented in the embed snippet.
    var KNOWN = ['onLoaded', 'beforeSubmit', 'onSubmitted', 'onSubmitFailed', 'onESignFailed', 'onFormFinished'];
    var STORE_KEY = 'wf-harness-log';
    var startedAt = Date.now();
    var lastIframeMessageAt = null;
    var lastIframeFocusAt = null;
    var log = [];
    var listeners = [];
    var formOrigin = null; // taken from the iframe the snippet inserts

    function readStore() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch (e) { return []; }
    }
    function writeStore() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(log.slice(-500))); } catch (e) { /* storage unavailable */ }
    }

    // Values can contain DOM nodes or functions; keep only what serializes.
    function safeClone(value) {
        try { return JSON.parse(JSON.stringify(value)); } catch (e) { return String(value); }
    }

    function add(entry) {
        entry.t = new Date().toISOString();
        entry.page = location.pathname + location.search;
        log.push(entry);
        writeStore();
        listeners.forEach(function (fn) { fn(entry); });
    }

    // Keep entries from earlier page loads so save-and-resume tests can be
    // followed across reloads and new tabs.
    log = readStore();
    add({ kind: 'harness', type: 'pageLoad', detail: { href: location.href, wfpid: new URLSearchParams(location.search).get('wfpid') } });

    window.addEventListener('message', function (e) {
        var data = e.data;
        var type = data && typeof data === 'object' ? data.type : undefined;
        var fromForm = !!(formOrigin && e.origin === formOrigin);
        if (fromForm) lastIframeMessageAt = Date.now();
        add({
            kind: 'message',
            type: type || '(no type)',
            origin: e.origin,
            fromForm: fromForm,
            known: KNOWN.indexOf(type) !== -1,
            detail: safeClone(data)
        });
    });

    // A cross-origin iframe hides the user's keystrokes from the host page,
    // but focus moving into it is visible as a window blur.
    window.addEventListener('blur', function () {
        setTimeout(function () {
            var el = document.activeElement;
            if (el && el.tagName === 'IFRAME') {
                lastIframeFocusAt = Date.now();
                add({ kind: 'harness', type: 'iframeFocused' });
            }
        }, 0);
    });

    document.addEventListener('visibilitychange', function () {
        add({ kind: 'harness', type: 'visibility', detail: { state: document.visibilityState } });
    });

    // Record the iframe the snippet built, including the final src with
    // wfpid/wfref appended, plus every load/reload of it.
    function watchIframe() {
        var mo = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                m.addedNodes.forEach(function (n) {
                    if (n.tagName !== 'IFRAME') return;
                    try { formOrigin = new URL(n.src).origin; } catch (e) { /* no src yet */ }
                    add({ kind: 'harness', type: 'iframeInserted', detail: { src: n.src, width: n.width, height: n.height } });
                    n.addEventListener('load', function () {
                        add({ kind: 'harness', type: 'iframeLoad', detail: { src: n.src } });
                    });
                    window.WF_IFRAME = n;
                });
            });
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
    }
    watchIframe();

    window.WFHarness = {
        KNOWN: KNOWN,
        entries: function () { return log.slice(); },
        onEntry: function (fn) { listeners.push(fn); },
        note: function (text) { add({ kind: 'note', type: 'note', detail: { text: text } }); },
        clear: function () { log = []; writeStore(); },
        formOrigin: function () { return formOrigin; },
        timers: function () {
            return { startedAt: startedAt, lastIframeMessageAt: lastIframeMessageAt, lastIframeFocusAt: lastIframeFocusAt };
        }
    };
})();
