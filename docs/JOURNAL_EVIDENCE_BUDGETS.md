# Journal diagnostics and evidence budgets

Reviewed September 27, 2026.

New run/command diagnostic messages are limited to **2,048 bytes of JSON-encoded UTF-8**, including their explicit shortening notice. Escapes and multibyte text count toward that budget. Ordinary messages remain unchanged; shortened messages preserve the beginning and state that the operator should inspect the native source for the full message. Unicode pairs are retained intact.

The small limit protects bounded event histories: at most 200 run events and 50 command events. Previously three accepted but unusually large native error responses could fill a maintenance journal and prevent the initial save needed for restoration even after the source recovered. New diagnostic bounds apply to step errors and newly appended events, including command observation/reconciliation failures. They do not remove or rewrite earlier evidence.

Command evidence keeps its existing 150 KB per-value budget, measured using the journal's indented UTF-8 encoding and the enclosing field indentation. A deeply nested value can be small in compact JSON yet exceed the 1 MiB record cap when formatted. Such a new value is now replaced by an explicit **Evidence omitted** notice. The operation's HTTP status and final outcome remain recordable; omission is not evidence of a verified native state. Secret masking precedes measurement, and no command is retried.

The 4 MiB run-record and 1 MiB command-record caps are unchanged. Dispatch intent and restoration obligations are still saved before native writes. These changes prevent the reproduced new-growth paths; they do not promise storage will always be writable or that every legacy record has spare capacity.

## Existing full records

Already near-cap records are not pruned or silently repaired. They can still reject a metadata update or restoration request. Preserve/export the journal and have the responsible administrator inspect the native target and recovery requirements. Do not delete the run, reset its data directory, assume a failed save canceled a native action, or retry an already dispatched command. Any manual native restoration must be verified before treating the obligation as resolved; this release adds no automatic legacy-record repair.

## Verification

`tests/journal-budgets.test.ts` uses actual stores/services in fresh temporary directories with a synthetic native transport. It checks normal create→inspect→disable→three large diagnostic failures→healthy restore; a compact nested write reply with durable acknowledged outcome and an explicit omission; bounded failures during command readback and reconciliation without replay; and UTF-8/JSON-escape handling. Existing temporary directories are untouched, and each new directory is removed after verifying its absolute parent.

The diagnostic-growth regression uses three deliberately large native replies, not a flood or a claim about typical native output. The command test preserves a durable acknowledgement for a write-only operation and does not claim to verify its secret. Browser display verification is separate from these server-side tests.

Full `npm run check` on September 27, 2026 passed frontend/server builds and **231 tests** (exit 0). The first build attempt exposed a test-only use of a string API newer than the configured TypeScript library; the assertion now checks Unicode validity through the supported URI encoder. Production library targets were not changed.

Browser integration used the actual production bundle with read-only synthetic snapshots produced by the real engine. Desktop 1280×900 and phone 390×844 displayed the diagnostic-shortening notice alongside the unresolved restoration workflow, and the command's HTTP 200 acknowledgement with its explicit evidence-omission notice. Page/client widths were 1265/1265 and 375/375; wide tables retained internal scrolling. No restore, retry, command, reconciliation or download action was submitted. Evidence in the parent workspace: research/waypoint-journal-browser-state.json, waypoint-journal-desktop/mobile.png and waypoint-command-evidence-desktop/mobile.png. Fixture 3452 and its temporary tab were stopped/closed afterward.
