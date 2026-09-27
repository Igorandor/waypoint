# Native observation source ownership

`useData` supplies native target lists in the command station and run-creation dialog. A capture now belongs to its exact path and serialized query. When either changes, or the path becomes empty, the hook immediately returns no previous data or timestamp, before its effect starts the next request. Existing effect cleanup continues to discard late responses from a canceled source.

A refresh of the same source preserves the last successful observation and its original timestamp while reading. HTTP 500 and network failures retain that observation with an error. HTTP 403 removes both data and timestamp. Subsequent successful reads clear the error and set a new collection time. No server authorization or command execution behavior changed.

The optional polling branch follows the same refusal rule. Neither current consumer passes a polling interval; the confirmed polling issue was in the hook's supported behavior, not an active polling screen.

## Reproduction and regression evidence

The standalone repository includes [the executable browser checks](../tests/browser/native-observation.jsx) and [their runner](../scripts/test-hook-browser.mjs). After installing the normal project dependencies, run:

```sh
npm run test:hook-browser
```

Open the printed `http://127.0.0.1:3430/` address in a browser. All twelve checks execute automatically. The browser displays the result and sends it to the loopback runner, which prints the individual checks and exits with code 0 only when all twelve pass. A failed check or a ten-minute timeout returns code 1. No additional package, credentials, running gateway or IRIS instance is needed. The runner builds the test bundle in memory and serves only the test page, bundle and result collector. It is a separate browser regression, not part of `npm test` or `npm run check`.

The harness mounts the actual hook and actual client with React/ReactDOM. Its synthetic transport, controlled poll timer and simulated foreground visibility make the cases deterministic. Layout-effect snapshots observe committed render values; they do **not** establish that a browser painted or a user clicked the transient prior-source result.

The baseline browser probe confirmed all ten recorded observations, including previous evidence under a changed query/disabled path, retained data after polling 403, and loss of evidence after manual-refresh 500. Baseline source and bundle were preserved as `waypoint-hook-probe-before.jsx` and `waypoint-hook-probe-before.js` outside the repository before production edits.

The post-fix probe has twelve checks: successful capture; manual403 invalidation; manual500 preservation; polling403 invalidation; polling500 preservation; pending query state; all committed query snapshots; canceled late result after disabling; all committed changed-path snapshots; successful new-path result; all committed disabled snapshots; and no request for the disabled path. All twelve passed in the integration review on 2026-09-27; the same original harness is now included here for independent reproduction. The external development evidence file is `research/waypoint-hook-after-browser.json`; it is not required to run the repository's checks.

`research/waypoint-hook-access-fixture.cjs` serves the actual production bundle on loopback3423 with synthetic users, roles and wallet collections. It supports controlled 200/403/500 and bounded delayed reads, with zero native calls and applied writes. The command-station check changes collection A to B and then to no collection, inspects list loading, and compares same-source 500 preservation with 403 removal. This task does not change separately selected record details or prepared command drafts.

Validation on 2026-09-27: `npm run check` passed TypeScript, production builds and the existing 201 Node tests. The hook regression is an actual React browser probe, not one of those Node tests. No native writes, container rebuilds or commits were performed by this implementation task.

Integration verification on September 27, 2026: the standalone `npm run test:hook-browser` completed all 12 checks and exited 0 after a real browser opened its local harness. The production command station separately preserved ProtectedAccount after same-source 500, removed it after 403, and showed no collection-A entry after B failed or the collection was cleared. Empty collection disabled Reload/Create. Desktop 1280×900 and phone 390×844 passed (phone document/scroll width 375/375). These controlled fixtures made zero native calls or writes.
