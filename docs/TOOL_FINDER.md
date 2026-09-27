# Finding a tool

Open **Find a tool** in the header or press Ctrl+K (Command+K on macOS). Focus starts in **Search tools**. The list filters by tool name and a small set of domain keywords: for example, wallet, certificate or OAuth finds Security; user or role finds Permissions; CPU or memory finds Capacity watch.

Search ignores case and extra whitespace. All entered words must occur in a tool's name or keywords. An empty search shows all tools; no matches produces an explicit message. Typing does not navigate, read native data or dispatch operations. Select a result to navigate. Escape, the close button or toggling the shortcut closes the existing modal and discards its search. Nothing is saved to browser storage.

Browser regression checklist: open by button and shortcut; check input focus; search `USER   ROLE` with leading/trailing spaces and `wallet`; try an unknown phrase; confirm typing leaves the current page unchanged; select a result; close with Escape and reopen to confirm the empty list; verify Tab stays inside the modal and focus returns to the trigger. Repeat at a narrow viewport. The modal's native dialog behavior is unchanged.

Validation on 2026-09-27: `npm run check` passed TypeScript, production builds and all 209 existing tests. This small interaction change adds no source-mirroring unit test; desktop/mobile and keyboard checks are recorded by the integration reviewer. Search state belongs to the mounted finder component and is discarded on close. A local ref focuses its input after the existing dialog opens.

Integration browser result: production client passed wallet keyword matching, mixed case and extra spaces, no-results feedback, Escape/reopen reset, actual initial input focus, Ctrl K and explicit navigation. Desktop1280×900 and phone390×844 passed (phone document/scroll width375/375). The synthetic session/read fixture performed zero native operations or writes; this is a bounded interaction check, not a complete accessibility audit.

The final browser check also confirmed singular '1 matching tool' and Tab/Enter selection of Task readiness. The production build passed after that copy correction; the preceding full Node suite passed209 tests.
