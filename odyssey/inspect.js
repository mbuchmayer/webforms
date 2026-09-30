/*
 * Widget inspector. Open the page with ?debug=1 to show it.
 *
 * Loaded in <head> so it records everything from the start:
 * - script errors and failed promises (the widget loader is async, so its
 *   failures surface as unhandled rejections, not console errors)
 * - every fetch/XHR request and its HTTP status, to see whether MC accepts
 *   this page's domain
 * - how the widget renders (page DOM, shadow root or iframe), its class
 *   names and CSS variables, and whether its CSS leaks onto the host page
 *
 * "Copy report" puts all of it on the clipboard to paste back.
 */
(function () {
    'use strict';
    if (new URLSearchParams(location.search).get('debug') !== '1') return;

    var startedAt = Date.now();
    var errors = [];
    var requests = [];

    function since() { return ((Date.now() - startedAt) / 1000).toFixed(1) + 's'; }
    function short(v) { v = String(v); return v.length > 300 ? v.slice(0, 300) + '…' : v; }

    window.addEventListener('error', function (e) {
        errors.push({ at: since(), type: 'error', message: short(e.message), source: e.filename, line: e.lineno });
    });
    window.addEventListener('unhandledrejection', function (e) {
        var r = e.reason;
        errors.push({ at: since(), type: 'unhandledrejection', message: short(r && r.message ? r.message : r) });
    });
    var origConsoleError = console.error;
    console.error = function () {
        errors.push({ at: since(), type: 'console.error', message: short(Array.prototype.map.call(arguments, String).join(' ')) });
        return origConsoleError.apply(console, arguments);
    };

    var origFetch = window.fetch;
    window.fetch = function (input, init) {
        var entry = { at: since(), via: 'fetch', method: (init && init.method) || 'GET', url: short(input && input.url ? input.url : input) };
        requests.push(entry);
        return origFetch.apply(this, arguments).then(function (res) {
            entry.status = res.status;
            return res;
        }, function (err) {
            entry.status = 'failed';
            entry.error = short(err && err.message ? err.message : err);
            throw err;
        });
    };

    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__wfEntry = { via: 'xhr', method: method, url: short(url) };
        return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
        var entry = this.__wfEntry, xhr = this;
        if (entry) {
            entry.at = since();
            requests.push(entry);
            xhr.addEventListener('loadend', function () { entry.status = xhr.status || 'failed'; });
        }
        return origSend.apply(this, arguments);
    };

    function cssVariables() {
        var found = {}, blocked = [];
        Array.prototype.forEach.call(document.styleSheets, function (sheet) {
            // Skip this page's own stylesheets (the Odyssey tokens) so only the widget's variables are listed.
            var ownSheet = !!(sheet.href && sheet.href.indexOf(location.origin) === 0);
            var rules;
            try { rules = sheet.cssRules; } catch (e) { blocked.push(sheet.href); return; }
            Array.prototype.forEach.call(rules || [], function (rule) {
                if (!rule.style) return;
                for (var i = 0; i < rule.style.length; i++) {
                    var name = rule.style[i];
                    if (name.indexOf('--') === 0 && !ownSheet) found[name] = rule.style.getPropertyValue(name).trim();
                }
            });
        });
        return { found: found, blockedSheets: blocked };
    }

    function colorOf(value) {
        var probe = document.createElement('div');
        probe.style.color = value;
        document.body.appendChild(probe);
        var rgb = getComputedStyle(probe).color;
        probe.remove();
        return rgb;
    }

    // Plain-language reading of the evidence, most likely cause first.
    function diagnose(root, scope) {
        var notes = [];
        var mc = requests.filter(function (r) { return /iriscrm\.com/.test(r.url); });
        var rejected = mc.filter(function (r) { return r.status === 401 || r.status === 403 || r.status === 404; });
        var failed = mc.filter(function (r) { return r.status === 'failed' || (typeof r.status === 'number' && r.status >= 400); });
        var scripts = Array.prototype.map.call(document.scripts, function (s) { return s.src; }).filter(Boolean);
        var bundleScript = scripts.filter(function (s) { return /iriscrm\.com/.test(s); });

        if (!mc.length) notes.push('No requests to MC were made. The widget loader did not run.');
        if (rejected.length) notes.push('MC answered ' + rejected.map(function (r) { return r.status; }).join(', ') +
            '. The most likely cause is that "' + location.host + '" is not in the JS Widget "Domains" list, or the form ID is wrong.');
        else if (failed.length) notes.push('Requests to MC failed (' + failed.map(function (r) { return r.status; }).join(', ') +
            '). "failed" usually means the browser blocked it (CORS), which also points to the Domains setting.');
        if (mc.length && !bundleScript.length) notes.push('The widget bundle script was never added to the page.');
        if (bundleScript.length && root && !scope.querySelector('*')) notes.push('The widget bundle loaded but drew nothing into #wf-widget.');
        if (errors.length) notes.push(errors.length + ' script error(s) recorded; see "errors".');
        if (root && scope.querySelector('input, select, textarea')) notes.push('The form rendered.');
        return notes;
    }

    function report() {
        var root = document.getElementById('wf-widget');
        var scope = root ? (root.shadowRoot || root) : null;
        var tags = {}, classes = {};
        if (scope) {
            scope.querySelectorAll('*').forEach(function (el) {
                var t = el.tagName.toLowerCase();
                tags[t] = (tags[t] || 0) + 1;
                (el.getAttribute('class') || '').split(/\s+/).forEach(function (c) { if (c) classes[c] = (classes[c] || 0) + 1; });
            });
        }
        var input = scope && scope.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
        var inputStyle = input && getComputedStyle(input);
        var rootStyle = getComputedStyle(document.documentElement);
        var card = document.querySelector('.portal-card');
        return {
            diagnosis: diagnose(root, scope),
            page: { host: location.host, secondsSinceLoad: since() },
            errors: errors,
            requests: requests,
            widgetScripts: Array.prototype.map.call(document.scripts, function (s) { return s.src; }).filter(function (s) { return s && s.indexOf(location.origin) !== 0; }),
            renderMode: !root ? '#wf-widget not found' : (!root.shadowRoot && !root.firstElementChild) ? 'empty (nothing drawn yet)' : root.shadowRoot ? 'shadow root' : (scope.querySelector('iframe') ? 'contains iframe' : 'page DOM'),
            elementCount: scope ? scope.querySelectorAll('*').length : 0,
            tags: tags,
            classes: Object.keys(classes).sort().slice(0, 200),
            firstInput: inputStyle ? {
                font: inputStyle.fontFamily, border: inputStyle.borderColor, radius: inputStyle.borderRadius,
                themeApplied: inputStyle.borderColor === colorOf(rootStyle.getPropertyValue('--border-default').trim())
            } : null,
            hostStyleLeak: {
                bodyBackground: getComputedStyle(document.body).backgroundColor,
                expectedBodyBackground: colorOf(rootStyle.getPropertyValue('--bg-page').trim()),
                cardBoxShadow: card ? getComputedStyle(card).boxShadow : null,
                cardBorder: card ? getComputedStyle(card).border : null
            },
            widgetCssVariables: cssVariables(),
            stylesheets: Array.prototype.map.call(document.styleSheets, function (s) { return s.href || '(inline)'; }),
            widgetGlobals: Object.keys(window).filter(function (k) { return /^wf|WF/.test(k); })
        };
    }

    function mount() {
        var panel = document.createElement('aside');
        panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(460px,calc(100vw - 32px));' +
            'max-height:60vh;overflow:auto;background:#111827;color:#e5e7eb;font:12px/1.4 ui-monospace,monospace;' +
            'border-radius:8px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
        panel.innerHTML = '<b>Widget inspector</b> <button type="button" data-a="run">Refresh</button> ' +
            '<button type="button" data-a="copy">Copy report</button><pre style="white-space:pre-wrap;margin:8px 0 0"></pre>';
        document.body.appendChild(panel);
        var out = panel.querySelector('pre');
        var copyBtn = panel.querySelector('[data-a=copy]');
        function run() { out.textContent = JSON.stringify(report(), null, 2); }
        panel.querySelector('[data-a=run]').onclick = run;
        copyBtn.onclick = function () {
            run();
            navigator.clipboard.writeText(out.textContent).then(
                function () { copyBtn.textContent = 'Copied'; },
                function () { copyBtn.textContent = 'Select the text and copy it'; }
            );
        };
        run();
        // The widget loads asynchronously; refresh a few times as it arrives.
        [2000, 5000, 10000].forEach(function (ms) { setTimeout(run, ms); });
        window.WFInspect = run;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();
