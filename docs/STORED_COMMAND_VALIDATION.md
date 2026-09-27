# Stored command receipts

Command receipts are bounded to 1 MiB and scoped to their owner, instance and UUID.
The reader rejects links and non-regular files and checks file identity while reading.
It now also validates the fields used by history, authorization, recovery and readback:
operation and read contracts, field lists, event entries, outcome values, timestamps
and optional process identities. Invalid records produce a controlled server error
instructing the operator to preserve the data directory before repair.

Validation happens before automatic recovery of an interrupted dispatch or expiry of
a review. A malformed receipt therefore cannot be returned to the history view or
rewritten merely by opening it. The list also fails closed if a stored receipt is
unreadable. Preserve a backup and investigate the damaged file; no automatic repair,
deletion or pruning is performed.

The check does not replace the parsed record with the schema's output. Arbitrary
evidence, unknown extension fields and absent optional legacy fields are retained.
Existing parseable timestamp forms remain accepted, including timezone offsets.
No new size quota is imposed and no existing receipt is migrated. This is protection
against malformed stored data, not a claim that an untrusted client can edit journal
files or that structurally valid tampering can be detected.

## Verification

`tests/command-journal-validation.test.ts` uses new temporary directories and the real
journal/service. Thirteen malformed variants are rejected by read, list, get, execute
and reconcile; their bytes stay unchanged and no native request occurs. A healthy
legacy-shaped receipt retains nested evidence and extensions through validation and
the existing dispatching-to-uncertain recovery. Full `npm run check` passes builds and
236 Node tests. There is no interface change or native-instance test in this scope.
