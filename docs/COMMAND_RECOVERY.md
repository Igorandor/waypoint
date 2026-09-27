# Recovering a command draft

The command station separates a failed preparation check from a request that may already have reached the gateway execution endpoint.

If the current-target read fails or a selected field changes before execution, no execution request is sent. The station keeps the selected target and proposed fields, returns to preparation and clears the old review and typed confirmation. Review the command again manually. The new review displays current native values and becomes the baseline for the next check, so an acknowledged concurrent change does not cause a permanent conflict loop. A deletion review displays the complete current record.

If the execution request was attempted but its response was lost, Waypoint reads that command's existing receipt. If the receipt cannot be obtained, the result remains uncertain and points to command history. The draft is not offered for immediate replay. Read or reconcile the existing result before deciding whether another command is appropriate.

Pending drafts remain in component memory. This correction does not add browser persistence or prevent losing a draft when leaving the command station. A failed native authorization check does not restore the revoked permission. A review already saved in command history may remain unexecuted until it expires.

## Regression evidence

`tests/command-recovery.test.ts` calls the same preparation/dispatch functions used by the command station with an isolated in-memory transport. Six tests cover denied and failed preflight reads, same-field conflict recovery, a fresh baseline after re-review, unrelated-field preservation, deletion confirmation reset, receipt recovery after execution response loss and commands without readable baselines. Assertions distinguish zero execution calls before dispatch from exactly one call after dispatch; no test contacts IRIS.

The focused tests and production build passed on September 27, 2026. Desktop/mobile browser verification is performed separately against an isolated disposable fixture; passing these tests alone is not claimed as browser proof.
