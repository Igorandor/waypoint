# Account policy visibility

The pinned native User contract declares `ChangePassword`, `PasswordNeverExpires` and `HOTPKeyDisplay` as booleans. The output redactor previously classified their names as credentials and replaced both true and false with a redaction marker, preventing operators from seeing these account policies.

The exception is limited to those three exact, case-sensitive names with primitive boolean values. Strings, numbers, objects, arrays, null and differently named credential-like fields remain masked. A protected parent field is still replaced as a whole, so a nested policy name cannot reopen a secret branch. Credential collection for masking diagnostic echoes is unchanged. This change affects output visibility, not authorization or command verification policy.

Known boundary: `server/command-readback.ts` still uses the conservative credential-name classifier when determining protected/write-only fields. This round does not change that classifier or claim that a write to these policy flags can now be verified by readback. Preparing and verifying policy changes requires a separate targeted review.

The regression file `tests/account-policy-redaction.test.ts` covers true/false in nested objects and arrays, wrong types and names, protected parent branches, credential echo collection, and the actual IrisClient user-read projection with a mocked upstream response. Before the fix, both the output-projection and user-read tests failed because the booleans were masked. No live IRIS request or browser verification is claimed by these tests.

Validation on 2026-09-27: `npm run check` passed, including TypeScript, the production build and 176 tests (four new regressions). No containers or live services were rebuilt or restarted.
# Native display verification

After rebuilding only the existing gateway, an authorized read of the existing SuperUser account displayed Change Password, Password Never Expires and HOTPKey Display as No. Desktop1280×900 and mobile390×844 (375 CSS pixels for client and scroll width) were checked in the actual browser. No policy was changed. Evidence is retained in the parent workspace's `research/waypoint-policy-flags-desktop.png` and `waypoint-policy-flags-mobile.png`.
