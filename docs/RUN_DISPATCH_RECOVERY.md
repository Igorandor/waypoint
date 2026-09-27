# Recovering a missing run action response

Waypoint treats a network failure, an unreadable successful response, or a gateway 5xx after a run action as a missing outcome. The action may already have been accepted. It makes one read-only GET of that run ID; it never automatically repeats next, restore, notes, or handover.

If that GET succeeds, the recorded journal state is displayed. Existing running/uncertain step controls still apply. A received journal is evidence about its recorded state, not a new claim that native work succeeded.

If the GET fails, the run remains locally unresolved. Its dated last-known report and drafts stay visible, but further actions and its report/handover exports are paused. Use **Refresh runs** to retrieve current detail. A successful list read alone does not remove the guard. Selecting another separately authorized run does not transfer the guard. A detail 403 follows the existing protected-read rule and removes the denied record; it is never restored from the failed action's older closure.

Known HTTP 4xx rejections retain their actual error message. The missing-outcome rule does not convert an explicit rejection into an accepted operation. Successful POST followed by history-list failure retains its previous saved-action behavior.

## Reproducible checks

Run `npm run check` for build and Node tests. The additional actual React component checks are self-contained in this repository:

1. Run `npm run test:dispatch-browser`.
2. Open `http://127.0.0.1:3430/` in a browser.
3. The runner exercises 15 checks, prints their JSON result and exits 0 only when all pass. It times out after ten minutes if no browser completes the run.

The transport is synthetic: a POST updates an in-memory record and then loses its response. Cases cover immediate journal recovery; failed detail recovery; retained note draft; blocked exports and mutations; list-only recovery; independently selected run; unreadable 2xx; 502; exact 403/409 rejection behavior; denied detail invalidation; and the existing reviewed-command recovery with both uncertain and unavailable receipts. No IRIS connection or native write is made.

Verification on 2026-09-27: full build and 210 Node tests passed. The actual React browser runner completed **15/15 checks** and exited 0. The built application was also checked at desktop width 1280 and mobile width 375: an accepted synthetic action followed by a 502 response and failed detail GET displayed the dated last-known report with actions and all three exports disabled. A successful detail read through **Refresh runs** then displayed the next checkpoint and required restoration, and enabled exports. The fixture recorded exactly one accepted action; no IRIS request or native write occurred. These checks establish client recovery behavior, not native execution or server idempotency.

The pre-fix actual-component investigation observed a stale write-step button and revision-1 export after a synthetic accepted action advanced the journal to revision 2. Manual refresh recovered it. That evidence does not establish repeated native writes; the probe did not send a second next action. One command-control observation in the original probe sampled before receipt recovery completed; the standalone runner waits for recovery completion instead.
