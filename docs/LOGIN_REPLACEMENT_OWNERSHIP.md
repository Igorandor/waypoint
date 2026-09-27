# Pending login and session replacement

Reviewed September 27, 2026.

A pending login previously captured only the request cookie. If another request logged that session out while the native identity check was pending, the late login response could create a new session and send a new cookie after the acknowledged logout. Client response-generation checks could discard the JSON, but they cannot prevent a browser from applying an HTTP Set-Cookie header.

Login now captures the active session being replaced before awaiting native authentication. Session establishment verifies that the same session is still active after expiration cleanup. Logout, a completed replacement login, idle expiry or absolute expiry makes the delayed replacement return HTTP 409 without Set-Cookie. Authentication that fails leaves the current session intact. A cookie already missing, revoked or expired when login begins does not prevent a normal new login. No session tombstones or additional stored credentials are introduced.

The boundary applies to replacing an existing active session. It does not coordinate concurrent anonymous login requests, undo native writes or cancel operations authorized before logout. Prepared command bodies remain account-scoped for their existing ten-minute lifetime: a newly authenticated session of the same account can explicitly confirm an earlier review, subject to current privileges and target revalidation. Another account cannot execute it; an expired/revoked cookie and an old CSRF token are rejected. This change does not alter that command contract.

## Reproduction and verification

Run `npx tsx --test tests/login-replacement.test.ts`. Six tests exercise the actual Express application, Operators and IrisClient with controlled deferred authentication responses and a clock. They cover acknowledged logout, concurrent replacement, failed authentication, initially stale cookies, idle expiry and absolute expiry. Rejected late responses must have no Set-Cookie header; a successful concurrent account remains accessible with its own cookie.

The tests use newly created temporary directories and a synthetic transport. They perform no native writes, contact no IRIS instance and do not use existing records. Supertest drives local HTTP requests; applying cookies in a browser is not part of these regressions. The prior client generation and cross-tab session tests remain separate coverage.

The full `npm run check` passed frontend/server builds and **226 tests** on September 27, 2026.
