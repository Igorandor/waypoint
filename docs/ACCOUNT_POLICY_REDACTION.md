# Account policy visibility

The pinned native User contract declares `ChangePassword`, `PasswordNeverExpires` and `HOTPKeyDisplay` as booleans. The output redactor previously classified their names as credentials and replaced both true and false with a redaction marker, preventing operators from seeing these account policies.

The exception is limited to those three exact, case-sensitive names with primitive boolean values. Strings, numbers, objects, arrays, null and differently named credential-like fields remain masked. A protected parent field is still replaced as a whole, so a nested policy name cannot reopen a secret branch. Credential collection for masking diagnostic echoes is unchanged. This change affects output visibility, not authorization or command verification policy.

The initial display fix left command verification unchanged. A subsequent targeted review confirmed that `server/command-readback.ts` also classified these booleans as write-only: a policy-only change remained uncertain despite matching fresh readback, and a concurrent policy change was excluded from the pre-dispatch conflict check. Its field classifier now accepts only these exact names with primitive boolean values as readable. Protected parent branches and real credential fields remain write-only. Malformed policy values remain masked and cannot qualify as readable evidence; this is not a new general request-schema validator.

The regression file `tests/account-policy-redaction.test.ts` covers true/false in nested objects and arrays, wrong types and names, protected parent branches, credential echo collection, and the actual IrisClient user-read projection with a mocked upstream response. Before the fix, both the output-projection and user-read tests failed because the booleans were masked. No live IRIS request or browser verification is claimed by these tests.

Validation on 2026-09-27: `npm run check` passed, including TypeScript, the production build and 176 tests (four new regressions). No containers or live services were rebuilt or restarted.

## Command verification regression

`tests/account-policy-readback.test.ts` exercises the real CommandService and IrisClient, substituting only in-memory persistence/reservations and a synthetic HTTP transport. Four of its five tests failed before the readback fix. The tests cover both boolean directions, the native `User` request envelope and flat response, zero writes during preparation, changed-policy rejection before dispatch, missing/different/malformed observations, read-only reconciliation, malformed submitted values, and a mixed password/policy command. The mixed command verifies only readable policy fields and explicitly states that the password cannot be compared; persisted test evidence contains no credential values.

Previously stored reviews retain their recorded field classification; the fix does not reinterpret old receipts or replay commands. A new review is needed to use the new classification. No live policy was changed in this verification round, and the earlier browser display evidence below is not evidence of a native write/readback test.

Readback validation on 2026-09-27: `npm run check` passed (TypeScript, production build and 181 tests, including the five new in-memory regressions). The regression fixture creates no temporary files, listeners or network connections.

After the integration reviewer rebuilt the gateway, the actual browser prepared a PasswordNeverExpires=false proposal for the existing SuperUser account without executing it. The review displayed boolean No in both before and proposed, on desktop and mobile (375 CSS pixels client/scroll). The proposal was discarded through Back to preparation and Discard command; no Execute action was used. This verifies preparation/display only; the full write/readback regression remains the controlled in-memory test above. Screenshots are retained in the parent workspace's `research/waypoint-policy-review-*.png`.

# Native display verification

After rebuilding only the existing gateway, an authorized read of the existing SuperUser account displayed Change Password, Password Never Expires and HOTPKey Display as No. Desktop1280×900 and mobile390×844 (375 CSS pixels for client and scroll width) were checked in the actual browser. No policy was changed. Evidence is retained in the parent workspace's `research/waypoint-policy-flags-desktop.png` and `waypoint-policy-flags-mobile.png`.
