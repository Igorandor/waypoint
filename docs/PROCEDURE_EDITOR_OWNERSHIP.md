# Procedure editor ownership

A procedure edit now retains the ID and revision from the record used to open its draft. Later reads cannot silently replace that write target or increase its optimistic-concurrency revision. **Edit latest** is disabled while the library is refreshing the selected record. Server conflicts retain the draft and version-change note; close the editor and explicitly read the latest version before preparing a fresh edit.

Remote save errors appear immediately above the editor's save controls. After a failed attempt finishes, the named error block receives focus so a long form does not leave the reason outside the viewport. Ordinary editing and repeated renders do not move focus back to the error. A subsequent failed attempt can focus its new error again.

The confirmed pre-fix sequence was: select revision 1, start a held refresh that will return revision 2, open the editor from revision 1, then release the refresh. The editor retained the earlier body but sent revision 2 when saved. The fix does not change backend revision checks or automatically merge, discard, retry or save drafts.

## Reproduction and checks

Run `npm run test:procedure-browser`, then open `http://127.0.0.1:3430/`. The self-contained runner bundles the actual library/editor, executes ten synthetic-transport checks, prints the result and exits 0 only when all pass. No IRIS connection or existing data is used. No additional dependency is required.

The checks cover blocked selection while a read is pending, blocked editing during refresh, freshly captured ID/revision, retained draft after explicit 409, independent draft ownership despite later selected-record reads, and reopening a fresh editor for another record. Two callback-ownership checks deliberately invoke background controls programmatically while a modal is open. They test the save binding independently of the UI lock, and do not claim those background clicks are ordinary user interactions. Captured writes receive synthetic 409 responses and change no records.

Verification on 2026-09-27: production build and **215/215 Node tests passed**, including a repeat after the focus change. The initial actual React browser runner completed **7/7 ownership checks** and exited 0. Three added focus checks cover the end of the failed attempt, normal editing without repeated focus movement, and a separate subsequent failure; their browser result is recorded separately when completed. These synthetic component checks do not establish native execution behavior.

Final integration: all ten actual React browser checks passed with runner exit0. The production client on synthetic fixture3445 passed desktop1280Ă—900 and phone390Ă—844 (content widths1265/375): Edit latest disabled during held refresh; its subsequent editor used the latest body. A desktop accepted fixture save used revision2 and created3. Concurrent updates were rejected with409 while keeping draft and note. The named Procedure save error received focus and was visible beside the save area (desktop top782/bottom831; phone top729/bottom799); Tab proceeds to Cancel. No native connection or native write occurred. Before/after screenshots and detailed fixture states are retained in research/waypoint-procedure-editor-* outside the submission. The original seven-check runner result is historical; the ten-check result replaces it, not an additional ten independent checks.

## Switching tools

You can switch to another tool and return to the open procedure editor without losing its fields or version note. Saved procedures are checked for current read access on return. If that check temporarily fails, use **Read procedure again**; the draft stays hidden until the read succeeds. A denied or missing record closes its protected editor. The draft retains its original revision, so a concurrent change still requires resolving the conflict explicitly. Navigation never saves or retries a write. Save before reloading or signing out; drafts are held only in browser memory.
