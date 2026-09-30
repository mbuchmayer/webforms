/*
 * Widget inspector. Open the page with ?debug=1 to show it.
 *
 * Reports how the MC widget renders (plain page DOM, shadow root or iframe),
 * which class names and CSS variables it uses, and whether the Odyssey theme
 * is reaching its fields. Copy the report and send it back so the theme can
 * target the widget's real class names.
 */
(function () {
    'use strict';
    if (new URLSearchParams(location.search).get('debug') !== '1') return;

    var panel = document.createElement('aside');
    panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;width:min(420px,calc(100vw - 32px));' +
        'max-height:60vh;overflow:auto;background:#111827;color:#e5e7eb;font:12px/1.4 ui-monospace,monospace;' +
        'border-radius:8px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    panel.innerHTML = '<b>Widget inspector</b> <button type="button" id="ins-run">Refresh</button> ' +
        '<button type="button" id="ins-copy">Copy report</button><pre id="ins-out" style="white-space:pre-wrap;margin:8px 0 0"></pre>';
    document.body.appendChild(panel);
    var out = panel.querySelector('#ins-out');

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

    function report() {
        var root = document.getElementById('wf-widget');
        if (!root) return { error: '#wf-widget not found' };
        var scope = root.shadowRoot || root;
        var tags = {}, classes = {};
        scope.querySelectorAll('*').forEach(function (el) {
            tags[el.tagName.toLowerCase()] = (tags[el.tagName.toLowerCase()] || 0) + 1;
            (el.getAttribute('class') || '').split(/\s+/).forEach(function (c) { if (c) classes[c] = (classes[c] || 0) + 1; });
        });
        var input = scope.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
        var button = scope.querySelector('button');
        var tokenBorder = getComputedStyle(document.documentElement).getPropertyValue('--border-default').trim();
        var probe = document.createElement('div');
        probe.style.color = tokenBorder;
        document.body.appendChild(probe);
        var tokenBorderRgb = getComputedStyle(probe).color;
        probe.remove();
        var inputStyle = input && getComputedStyle(input);
        return {
            renderMode: root.shadowRoot ? 'shadow root' : (scope.querySelector('iframe') ? 'contains iframe' : 'page DOM'),
            elementCount: scope.querySelectorAll('*').length,
            tags: tags,
            classes: Object.keys(classes).sort().slice(0, 200),
            firstInput: inputStyle ? {
                font: inputStyle.fontFamily, border: inputStyle.borderColor, radius: inputStyle.borderRadius,
                themeApplied: inputStyle.borderColor === tokenBorderRgb
            } : null,
            firstButton: button ? { text: button.textContent.trim(), type: button.type, class: button.className } : null,
            widgetCssVariables: cssVariables(),
            stylesheets: Array.prototype.map.call(document.styleSheets, function (s) { return s.href || '(inline)'; }),
            widgetGlobals: Object.keys(window).filter(function (k) { return /^wf|WF/.test(k); })
        };
    }

    function run() { out.textContent = JSON.stringify(report(), null, 2); }
    panel.querySelector('#ins-run').onclick = run;
    panel.querySelector('#ins-copy').onclick = function () {
        run();
        navigator.clipboard.writeText(out.textContent).then(
            function () { panel.querySelector('#ins-copy').textContent = 'Copied'; },
            function () { panel.querySelector('#ins-copy').textContent = 'Select the text and copy it'; }
        );
    };
    window.addEventListener('load', function () { setTimeout(run, 3000); });
    window.WFInspect = run;
})();
