/* Test console UI for index.html. Reads from window.WFHarness (observer.js). */
(function () {
    'use strict';
    var H = window.WFHarness;
    var $ = function (id) { return document.getElementById(id); };
    var logEl = $('log');
    var onlyForm = $('only-form');

    function fmt(ms) {
        if (ms == null) return '—';
        var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        s = s % 60;
        return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    }

    function tag(entry) {
        if (entry.kind === 'message') {
            if (!entry.fromForm) return ['other origin', 'tag-other'];
            return entry.known ? ['handled', 'tag-known'] : ['NOT handled by snippet', 'tag-unknown'];
        }
        return [entry.kind, 'tag-' + entry.kind];
    }

    function render(entry) {
        if (onlyForm.checked && !(entry.kind === 'message' && entry.fromForm)) return;
        var li = document.createElement('li');
        var t = tag(entry);
        var head = document.createElement('div');
        head.className = 'log-head';
        head.innerHTML = '<time></time> <b></b> <span class="tag"></span>';
        head.querySelector('time').textContent = entry.t.slice(11, 19);
        head.querySelector('b').textContent = entry.type;
        head.querySelector('.tag').textContent = t[0];
        head.querySelector('.tag').classList.add(t[1]);
        li.appendChild(head);
        if (entry.detail !== undefined || entry.origin) {
            var pre = document.createElement('pre');
            var body = entry.origin ? { origin: entry.origin, data: entry.detail } : entry.detail;
            pre.textContent = JSON.stringify(body, null, 2);
            li.appendChild(pre);
        }
        logEl.insertBefore(li, logEl.firstChild);
    }

    function renderAll() {
        logEl.innerHTML = '';
        H.entries().forEach(render);
    }

    H.onEntry(function (entry) {
        render(entry);
        if (entry.type === 'iframeInserted' || entry.type === 'iframeLoad') $('iframe-src').textContent = entry.detail.src;
    });
    renderAll();

    var params = new URLSearchParams(location.search);
    $('cur-wfpid').textContent = params.get('wfpid') || 'none';
    if (window.WF_IFRAME) $('iframe-src').textContent = window.WF_IFRAME.src;

    setInterval(function () {
        var now = Date.now(), t = H.timers();
        $('t-page').textContent = fmt(now - t.startedAt);
        $('t-msg').textContent = t.lastIframeMessageAt ? fmt(now - t.lastIframeMessageAt) : '—';
        $('t-focus').textContent = t.lastIframeFocusAt ? fmt(now - t.lastIframeFocusAt) : '—';
    }, 1000);

    // Accept either a bare wfpid or a full resume link from an email.
    $('wfpid-go').onclick = function () {
        var raw = $('wfpid-input').value.trim();
        if (!raw) return;
        var id = raw;
        try { id = new URL(raw).searchParams.get('wfpid') || raw; } catch (e) { /* not a URL */ }
        var u = new URL(location.href);
        u.searchParams.set('wfpid', id);
        H.note('Opening with wfpid=' + id);
        location.href = u.toString();
    };

    $('reload-frame').onclick = function () {
        if (!window.WF_IFRAME) return;
        H.note('Reloaded iframe only (host page kept)');
        window.WF_IFRAME.src = window.WF_IFRAME.src;
    };

    $('new-tab').onclick = function () { window.open(location.href, '_blank'); };

    $('note-add').onclick = function () {
        var v = $('note-input').value.trim();
        if (v) { H.note(v); $('note-input').value = ''; }
    };

    onlyForm.onchange = renderAll;

    $('clear').onclick = function () {
        if (confirm('Clear the saved event log?')) { H.clear(); renderAll(); }
    };

    $('export').onclick = function () {
        var blob = new Blob([JSON.stringify(H.entries(), null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'webform-embed-log-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
        a.click();
    };
})();
