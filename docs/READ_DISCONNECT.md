# Caller-owned native reads

The generic `/api/iris` observation route accepts a native `GET` inside the portal's authenticated JSON POST envelope. It previously kept that single upstream fetch running after its browser connection closed. A local regression using the actual Express router and `IrisClient` confirmed that the fetch signal remained active after a fully received request and a disconnected response. The deferred synthetic fetch reproduced the issue in milliseconds; no IRIS instance, slow body or load probe was used.

The route now gives only native GET observations a cancellation controller tied to the response's premature `close` event. Normal response completion does not cancel the observation. Its listener is removed when the operation settles. The client combines this optional caller signal with the existing 20-second timeout and avoids dispatch if already canceled. Fetch also uses this signal while receiving its body. Existing response-size and JSON limits remain in place.

An abandoned GET creates no activity entry, whether its transport rejects or finishes after cancellation. Closing a tab is not recorded as an IRIS outage. Real failures from connected reads and completed asynchronous audit POSTs still appear in activity.

This does not cancel native jobs. In particular, an async-result GET only abandons fetching that result; the job's lifetime is separate. The asynchronous audit POST receives no caller signal. Durable command preparation, execution, readback, run transitions, reconciliation and shared work receive no new signal, and the client ignores caller signals for native writes. Losing a browser connection remains insufficient evidence to declare a dispatched write canceled.

Eight tests in `tests/read-disconnect.test.ts` cover a disconnected GET, a normal response and listener cleanup, an audit POST that continues, a pre-aborted GET with no dispatch or exposed private reason, the unchanged deadline using a controlled timeout signal, a native write that ignores caller cancellation, completion after caller cancellation and a genuine upstream failure. Activity assertions distinguish canceled reads from failed reads and completed POSTs. Router tests use one bounded loopback request at a time and synthetic upstream responses. Their three-second test deadlines are safeguards, not awaited IRIS timeouts.

Before the fix, the disconnect test failed while the normal GET and audit POST controls passed. Run the targeted suite with `npx tsx --test tests/read-disconnect.test.ts`, or use `npm run check` for the full build and test suite.

Validation on 2026-09-27: `npm run check` passed TypeScript, production builds and all 209 tests, including these eight regressions. No live IRIS operation, container rebuild or commit was performed for this change.
