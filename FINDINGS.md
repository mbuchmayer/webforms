# Findings: embedded Web Form, session timeouts and Save Progress

These findings come from internal Confluence, Jira and Slack, and they still need to be confirmed
with the harness. Jira comments and resolutions couldn't be read, so "Accepted" tickets may or may
not have shipped. Confluence base: `https://network-merchants.atlassian.net/wiki`.

## Q1. Timeouts and long idle periods. Is there an `onSessionExpired` callback?

**No.** The embed supports exactly six events: `onLoaded`, `beforeSubmit`, `onSubmitted`,
`onSubmitFailed`, `onESignFailed`, `onFormFinished` (Confluence *Embed Form Events*, IC/3850240030).
PRB-862 added `onFormFinished` and `hasESign`, and it doesn't propose a session event.

- **The embed API is designed without sessions.** PRB-605 added a GraphQL route for embeds "without
  CSRF and session middleware". So there should be no server session to expire while the merchant is
  idle. No doc confirms that, which makes it the main thing to test.
- **Autosave softens idle risk.** Save Progress autosaves in the background. The ADR says every 2 min
  when something changed; PRB-1742 mentions 10 s. Watch the Network tab for `saveWebFormProgress`
  to see the real interval.
- **The only "session timeout" in the docs is Adobe Sign's.** It arrives as
  `onESignFailed(msg, { eSignType: 'SESSION_TIMEOUT' })`. It covers the e-sign step only, not the
  application form.
- **The one documented TTL doesn't apply to embeds.** Password-protected forms keep a 12 h session,
  but password protection can't be used on embedded forms at all.
- **Even if the form sent an extra event, the snippet would drop it.** The snippet dispatches only to
  keys in `events` and ignores anything else silently. Adding `onSessionExpired` later would require
  every client to update their snippet. The harness logs these dropped messages as
  `NOT handled by snippet`.

**What to verify:** after 30 min, 2 h and overnight idle, does page navigation or submit still work?
Does `onSubmitFailed` fire? Does any `NOT handled` message appear? Did autosaved data survive?

## Q2. Save Progress and resume later

**Supported. Embed-specific behaviour is the risk area.**

How it works, from ADR *74 - MRM - Web Forms - Save Form Progress* (PE/3658645506) and the
*Technical Configuration Guide* (IM/5874548744):

- Enabled per form, behind the feature flag `WEB_FORM_SAVE_PROGRESS`. It was released to all
  clients 19 Nov 2024 (PRB-1794).
- The merchant clicks **Save Progress** and enters an email. The progress is also autosaved.
  Reminder emails follow on a configurable cadence, for example 1 h → 3 days → 7 days.
- The resume link carries `wfpid=<uuid>`, which is the saved-progress ID.
- Links expire after **3 days**. Opening one on day 4 sends a fresh link.
- Unfinished progress is **purged after 30 days**, and deleted as soon as the form is submitted.
- **Fields of type `secure` are never saved.** The merchant must re-enter them on resume. IZ-1715
  proposes changing this.

How the Dynamic iFrame fits in. This is inferred from AON-243, AON-353 and AON-374 plus the
snippet code; no single doc spells it out:

1. The snippet sends the host page URL to the form as `wfref`.
2. The backend stores that URL against the progress entry (AON-374).
3. The resume email links back to **the client's page** with `?wfpid=<uuid>`.
4. The snippet on that page reads `wfpid` and passes it into the iframe, which restores the progress.

This is why Save Progress should be hidden on the **Simple iFrame** share (AON-353). It has no
script, so it can't send `wfref` or forward `wfpid`.

**Known gaps and risks:**

- **Resume links for embeds were broken as of March 2025.** Reminder emails pointed at a URL that
  can't render outside the iframe (Slack #pdt-maq-acquiring-onboarding-aon, AON-243). The fix
  tickets are Accepted, but it's unconfirmed whether they shipped. Test this first.
- **`wfref` is double-encoded by the snippet.** It works only if the server decodes twice. Check
  that the emailed link is a clean URL.
- **Clients' software must keep `?wfpid=` on the URL.** Single-page apps that route by hash, strip
  query strings, or put the form behind a login redirect will lose it.
- **Save Progress has open bugs:**
  - infinite loader when switching tabs (MSU4-577)
  - blank screen on in-progress forms (ESE-7436)
  - endless loading (ESE-5831)
  - "An Error Occurred" (ESE-10178)
  - double submit from two tabs (MSU4-208)
- **The host page is never told about saves or resumes.** The server tracks
  `nmi.mc.web-form.saved` and `nmi.mc.web-form.progress.opened`, but no postMessage reaches the host
  page. A client CRM can't mark a lead as "application in progress" without polling MC.

## Product take

- **Q1:** "No session expiry, so no event" is a sound design if testing confirms it. Nothing to
  expire beats an expiry the client has to handle. If testing does find a failure after idle, the
  fix belongs inside the form, by keeping autosave and showing a clear message. An
  `onSessionExpired` callback alone would push the problem onto every client.
- **Q2:** the more valuable gap is **host-page visibility**. `onProgressSaved` and `onProgressResumed`
  events, carrying `wfpid` and the expiry, would let ISO and bank CRMs track abandoned
  applications and run their own follow-up. That fits the same "extend the callbacks" pattern as
  PRB-862. Confirm the demand with two or three embed clients before building it.
