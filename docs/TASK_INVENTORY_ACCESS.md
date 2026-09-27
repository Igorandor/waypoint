# Task inventory and independently observed details

A task-inventory refresh previously retained the list and its collection timestamp after HTTP 403. The actual production UI reproduced this with synthetic inventory names and an independently loaded selected dossier. The fix clears only `tasks` and `listAt` on `RequestError`403. HTTP 500 and other transient failures preserve the prior inventory and its original timestamp with the error displayed.

The selected dossier is not derived solely from permission to list tasks. Its configuration, execution state and history are read separately. Denial of the list therefore does not erase previously permitted detail observations or their export. Refreshing the dossier replaces its observations: an individually denied source contains an error and no old data, while successful sources remain available. The existing selection ticket discards late responses from a previously selected task.

## Standalone component regression

After installing normal project dependencies, run `npm run test:task-browser` and open the printed loopback address. Eight checks execute automatically against the actual React `TaskWorkspace` and API client with synthetic transport. They verify list403 removal, permitted detail preservation, list500 preservation, retained detail export, partial history/configuration denial, hiding a pending dossier and rejection of late task7 results after selecting task8. The test intercepts download blobs to inspect their actual JSON without downloading files or navigating. No source-pattern or duplicate implementation is used.

The existing browser runner builds in memory, prints each result and exits with code0 only when all eight pass; failure or timeout exits1. This is a separate browser command, not part of `npm test`. It requires no IRIS, gateway, extra dependencies or parent research files. The harness omits styles and does not establish visual layout correctness.

Validation on 2026-09-27: `npm run check` passed TypeScript, production builds and all 209 Node tests. The baseline production browser demonstrated the403 issue, while partial history403 already removed denied history and retained allowed configuration/state. Updated component and production-browser results are recorded separately by the integration reviewer.

Integration result: `npm run test:task-browser` completed8/8 checks in an actual browser and exited0. Separately, the production UI fixture reproduced the old stale-list403 behavior before the fix, then confirmed same-list500 retention and403 invalidation on desktop and phone390×844 (375/375). Independently authorized selected configuration remained visible; only inventory names and its collection timestamp disappeared. Native history403 retained allowed configuration/state, without old history data. Zero native calls or writes. The runner inspects generated Blob contents; this does not claim a filesystem download was completed.
