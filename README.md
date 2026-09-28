# Web Form embed test harness

A mock partner CRM ("Northwind Partner CRM") that embeds a Merchant Central web form using the
client's dynamic JS snippet, unchanged, the way an ISO or bank would put it in their own software.
A test console next to the form records everything the form sends to the host page.

## What's here

| File | Purpose |
| --- | --- |
| `harness/index.html` | Mock CRM merchant record with the snippet pasted verbatim, plus the test console |
| `harness/bare.html` | The snippet on an empty page, with no CRM styling and no observer. Use it as a control |
| `harness/observer.js` | Loads before the snippet and logs every `postMessage`, including types the snippet ignores |
| `harness/console.js`, `harness/crm.css` | Test console UI and CRM styling |

## Run it

The page must be served over `http(s)://`, not opened as a `file://`. The snippet sends the host
page URL to the form as `wfref`, and a `file://` URL is not something a real client would have.

```bash
cd harness
python3 -m http.server 8080
# open http://localhost:8080/
```

To test from a real public domain (closer to production, and needed if the resume email should link
back to a page other people can open), serve the same folder with a tunnel such as
`ngrok http 8080` or `cloudflared tunnel --url http://localhost:8080`, or upload it to any static host.

To test a different form, change the form URL in the snippet in both `index.html` and `bare.html`.

## Reading the test console

- **Timers**: time on page, time since the form last sent a message, and time since focus last
  entered the form. The form is cross-origin, so the host page can't see keystrokes inside it.
  Focus moving into it is the closest activity signal the host has.
- **Save & resume**: shows the `wfpid` in the page URL and the final iframe `src` the snippet built.
  Paste a resume link or bare `wfpid` to reopen the page with it.
- **Event log**: kept in `localStorage` across reloads and tabs, so a save → close → resume run can
  be read end to end. Each form message is tagged:
  - `handled`: one of the six documented callbacks.
  - `NOT handled by snippet`: the form sent a type the snippet drops silently. A session-expiry
    event would show up here.
  - `other origin`: a message from somewhere else, such as an e-sign provider frame.
- **Export JSON** saves the log to attach to a ticket.

Also keep DevTools open on the **Network** tab, filtered to the form's domain. The requests the form
makes (autosave calls, 401/403/419 responses after idle, token refreshes) are the other half of the
evidence.

## Test plan

### Q1: Timeouts and long idle periods

1. Open `index.html`, confirm `onLoaded` appears as `handled`.
2. Fill part of the first page. Add a note ("filled page 1, going idle").
3. Leave the tab alone for a series of idle periods: 15 min, 30 min, 60 min, 2 h, overnight.
   Run one series with the tab in the foreground and one with it in the background (a `visibility`
   entry is logged either way).
4. After each idle period, try in order: move to the next page, then submit.
5. Record for each run:
   - Any `NOT handled by snippet` entries. This is the direct test for an undocumented
     `onSessionExpired`-style event.
   - Whether `onSubmitFailed` fires, and the exact `msg`.
   - What the merchant sees inside the iframe: an error, a silent reload, a blank form, or no problem.
   - Whether entered data survived.
   - Network responses from the form domain (status codes).
6. Repeat on `bare.html` for any surprising result, to rule out the harness.

### Q2: Save progress and resume later

1. Start the form on `index.html` (no `wfpid` in the URL). Fill some fields.
2. Use the form's save / "finish later" control, if one is configured for this form.
3. Check the resume email or link. Record where it points: the host CRM page (built from `wfref`)
   or a Merchant Central hosted URL, and whether it carries `wfpid`.
4. Open the resume link. If it points at the host page, `wfpid in this page URL` should fill in and
   the iframe `src` should carry it. Confirm the saved values come back (look at
   `onLoaded.initialValues` in the log).
5. Edge cases:
   - Resume in a different browser or incognito (proves progress is stored on the server, not in
     the browser).
   - Resume after 24 h / 7 days / 30 days (finds any expiry).
   - Resume the same link twice, including after a completed submit.
   - Open the host page with a made-up `wfpid` (what the merchant sees for a bad or expired link).
   - Host page URL that already has its own query string, such as `index.html?lead=48213`. Check that
     the resume link keeps it.

What the docs lead you to expect is in [`FINDINGS.md`](FINDINGS.md): 3-day link expiry, a 30-day
purge, `secure` fields never saved, and a known issue with resume links from embeds. Use it to
decide which results are bugs.

### Known snippet behaviour to keep in mind

- The snippet only calls callbacks it knows (`et[e.data.type]?.(...)`). Any other message type is
  dropped without a console warning. A new event such as `onSessionExpired` would need clients to
  update their snippet before they could use it.
- `wfref` is encoded twice: `encodeURIComponent()` and then `URLSearchParams.set()`, which encodes
  again. For example `http://localhost:8080/?wfpid=abc` arrives as
  `http%253A%252F%252Flocalhost...`. That works only if the server decodes twice. Check that a
  resume link built from `wfref` is a clean URL.
- `wfpid` is read only from the host page's own query string. If the client's CRM is a single-page
  app that routes by hash (`#/merchant/123`) or drops unknown query parameters, resume links won't
  reach the form.
