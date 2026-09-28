# Refused saved-data reads

Command history, run history and the procedure library distinguish a forbidden read from temporary unavailability. A GET response with HTTP 403 invalidates only the data covered by that read. Refusing a list clears that list; refusing a record removes its detail, export and cached list entry. Other permitted records remain available. A 500 response retains the previous record and any draft, with the error visible.

Refreshing a selected record rechecks the list and detail separately. Failure of the list does not skip the detail check. In command history this handles a filtered index followed by a refused receipt: the previously selected receipt no longer remains visible or exportable. Procedure refresh now also rechecks its selected definition.

A 403 response to a run or procedure change now triggers a GET of that same record. A refused change alone does not prove that reading is forbidden. An allowed read restores the existing draft; a forbidden or missing record removes its detail and exports. If the recheck is temporarily unavailable, details, dialogs and exports are hidden until a successful explicit read, while the draft remains in memory. No change is automatically retried. A successful save followed by a refused list refresh is still reported as saved, and the returned record is rechecked. HTTP 401 continues through the existing session-ended flow.

The shared `readProtected` helper always sends GET requests. Its callbacks are exercised with 403/500/401/404, filtered-index/denied-detail, independent list/detail outcomes, and session-ending cases. Existing action recovery tests also verify that a 403 mutation does not publish a replacement run or list. On 27 September 2026, `npm run check` passed both production bundles and **172 tests**.

## Isolated browser verification

The workspace-only `research/waypoint-protected-read-fixture.cjs` serves the current bundle on `http://127.0.0.1:3408`. It has one record per view and no native connections or applied writes. Start it explicitly after building. Choose `#command-history`, `#runbooks`, or `#procedures`; select the record where necessary.

Set controls using `POST /_test/control`, for example `{"resource":"commands","listStatus":200,"detailStatus":500}`. The resource is `commands`, `runs`, or `procedures`. List/detail statuses support 200, 401, 403 and 500; writeStatus supports only 403 or 500. Controls persist until changed. For command history, a forbidden detail is also omitted from an otherwise successful index.

1. Load and select a record, set detailStatus 500, and refresh. The previous detail and export remain available. For runs, a typed checkpoint note remains intact.
2. Set detailStatus 403 and refresh. The forbidden detail and export disappear; the error explains the refusal. In command history the filtered index must not leave the selected receipt behind.
3. Reset both statuses to 200 and reload/select. Set listStatus 403 with detailStatus 200 and refresh. The list disappears while the separately permitted detail remains available.
4. With reads restored to 200, submit a handover or procedure edit. Fixture writes return 403 and apply nothing. The dialog retains its fields, and the previous readable record is preserved.
5. Repeat visible checks at desktop and narrow viewport widths. `GET /_test/state` lists requests and always reports zero applied writes.

These checks concern the UI's handling of already downloaded data; they do not demonstrate a new backend authorization bypass or attempt to revoke copies exported earlier.

Browser verification on 27 September 2026 passed with the production bundle: command detail/export survived GET500 and disappeared after GET403 on desktop; run detail and an unsent checkpoint note survived GET500 on mobile, then detail/export disappeared after GET403. Procedure detail/export survived GET500; a refused list with an allowed detail cleared only the list; a subsequent refused detail removed its export. The narrow viewport measured 375 CSS pixels for both client and scroll width. The fixture recorded zero applied writes. Evidence is retained in the parent workspace's `research/waypoint-protected-read-browser.json` and desktop/mobile screenshots.
