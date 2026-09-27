# Stored run validation

RunStore validates a loaded run before returning it to the engine, report view or summary builder. Invalid structure receives the existing controlled 500 error with an instruction to preserve the data directory. One invalid document still fails the entire account/instance list; it is not silently omitted and does not produce a replacement empty list.

The check covers the core envelope, known step/status fields, nonempty step list, events, timestamps and optional recorded notes, checklists, procedure snapshot and handover fields. A present handover must contain valid follow-up records, including the array consumed by the summary builder. Existing procedure and handover definitions are reused. Stored procedure fields cannot be supplied by authoring-time defaults.

Validation does not write, normalize, migrate, reset or remove a document. It returns the original parsed record after checking it. Legacy runs may omit revision, notes, handover and other optional additions. Arbitrary evidence values remain untouched and are not subjected to a duplicate native-data schema; native evidence dates and field names are not interpreted as journal metadata. Unknown envelope extensions are retained.

## Verification — 2026-09-27

The pre-fix minimal case was a valid JSON run with `steps: [null]`: direct read accepted it and list construction subsequently threw a TypeError. That shape now fails at the read boundary with the controlled preservation error.

Five focused tests in `tests/run-store-validation.test.ts` use only newly created OS temporary directories. They cover malformed JSON, unsupported version, invalid core/step/event fields, invalid calendar timestamps, malformed handover and notes, legacy omissions, varied arbitrary evidence, valid immutable procedure snapshots and missing stored procedure fields. Both direct reads and lists reject corrupt records. Bad and healthy files remain byte-identical, no repair files appear, healthy records remain directly readable, and other owners/instances retain independent lists. Temporary paths are verified before cleanup.

`npx tsx --test tests/run-store-validation.test.ts`: **5/5 passed**. `npm run check`: **build and 215/215 tests passed**. No existing data directory, IRIS instance or running procedure was used. These checks validate structure and isolation; they do not establish native execution correctness or automatically repair corrupted data.
