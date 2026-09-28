# Verification record

## Uncertain plan creation — September 28, 2026

After a lost response, unreadable success response or gateway failure, Create run previously offered a direct retry even if the first plan had already been saved. It now explains the uncertain outcome, keeps the fields and blocks another creation in that dialog. Check saved runs reads history without resending the creation. Successful history reads clear its filters for manual inspection; failed reads retain the draft and permit another read. A denied history read also removes a previously selected protected run. The client neither guesses a matching record nor concludes that an empty list proves nothing was saved. Closing and reopening deliberately starts a new creation form; this is recovery guidance, not server-side deduplication.

Build and 236 Node tests pass. Seventeen actual Runbooks/CreateRun browser checks cover transport loss, unreadable201,503, definitive4xx, pending calls, retained fields, history failures, authorization cleanup, known success and focus. The recovery button receives focus when the uncertain result appears or a recovery read fails, without refocusing on ordinary typing. Desktop and 390px checks verified visible recovery controls, cleared history filters, retained phone draft after503 and explicit200 recovery with one creation request. The phone document measured390px client and scroll width. All records stayed in fixture memory; no native or durable writes. An initial manual fixture omitted the production theme; visual checks were repeated after correcting that fixture. Responsive checks are not physical-device coverage.

## Procedure draft dismissal — September 28, 2026

Release 1.0.6 protects a changed procedure draft when Escape, Cancel or the close button is used. Keep editing retains the fields and version note, while explicit discard closes the editor. Unchanged or reverted drafts close immediately. Pending saves block dismissal and duplicate submission; a denied source read still clears protected drafts.

The release passed the production build and 236 Node tests, 41 actual-App navigation/dismissal checks and 10 editor ownership checks. Desktop and 390px checks covered keeping and discarding edits. These used synthetic transport and made no native or durable writes. Drafts remain in memory and do not survive reload or logout.

## Procedure drafts across navigation — September 28, 2026

Leaving Procedure library through the tool finder used to unmount the editor and discard its unsaved name, steps and version note. The library now stays mounted after its first visit. Its dialogs suspend while another workspace is active and return with the same in-memory draft. Opening other tools first does not load procedures.

On return, the library refreshes its list and verifies read access to the selected/edited record before showing details or allowing an edit to be saved. A denied or missing record clears its protected draft; a temporary read failure hides the draft and exports until Read procedure again succeeds. Return checks wait for a pending save, preserve its failure message and never resend the mutation. A refreshed record cannot replace the draft's bound ID or original concurrency revision. Older reads cannot expose it after a later denied return.

Production build and 236 Node tests passed. Actual-App navigation regressions passed 23 checks, including new drafts, denied/missing/transient reads, repeated navigation, stale responses, revision conflicts and pending saves. The 19 existing access checks and 10 procedure editor ownership checks passed. Desktop and 390px browser checks retained an edited name, task ID and version note through the tool finder and return. Transport was synthetic; no native or durable data was changed. Drafts remain in memory only and are lost on reload/logout or explicit dismissal.

## Retained run dialogs during navigation — September 28, 2026

Opening Find a tool from a run dialog and choosing another workspace previously hid the dialog's ancestor while leaving the native dialog modal. The destination page could no longer receive clicks. The retained Runs workspace now suspends its native dialogs when another tool is selected and reopens them on return. The React editor remains mounted, preserving its in-memory fields; suspension does not save a run or invoke the editor's close action.

Production build and 236 tests pass. Fifteen actual-App browser checks cover the runbook chooser, finder navigation, direct hash navigation, destination focus, retained observation title/source selection, and ordinary close/cancel behavior. Desktop and 390px browser checks confirmed that the destination remains usable and the title, added source and dialog focus survive return to Runs. Native Escape still closes the ordinary Create run dialog. These checks use synthetic transport and make no IRIS or durable writes. This boundary applies to retained run dialogs; it does not promise draft persistence after reload, logout or departure from other workspaces.

All 14 existing handover component regressions also pass after the shared modal lifecycle change, including Keep editing / Discard draft, refused saves, revision payloads and pending-save protection. Those regressions dispatch a cancel event; they do not by themselves verify native keyboard Escape.

## Recorded checks and first-run guidance — September 28, 2026

The step list previously marked passed, failed and unknown assertions alike as Recorded. The list and selected-step badge now show their actual recorded outcome with a separate label and warning icon for failed or unknown results. Completed read-only runs with outstanding checks distinguish finished steps from passed checks. The shared outcome reader also supplies the existing aggregate counts; execution states, native actions and assertion evaluation are unchanged. Procedure checkpoint notes now ask for the decision and follow-up instead of readiness to restore a target. FIRST_RUN directs newcomers to Runs / Runbooks, where New run actually appears.

Production build and 236 tests pass. Fourteen actual-component browser regressions cover mixed and passed-only results, failed native observations, required checklist items and notes, and unchanged maintenance wording. Desktop/light and dark plus 390px browser checks confirmed distinct labels, retained evidence, completion warning, and an explicit note/checklist action. These used the actual planner/evaluator and UI with synthetic observations; no IRIS or durable writes occurred.

## Access recheck after refused changes — September 28, 2026

Run and procedure mutations returning 403 previously left cached details and local exports available until manual refresh. The client now checks read access separately. GET200 retains drafts; GET403/404 removes the record; transient recheck failure hides evidence and exports until an explicit read succeeds. Handover and procedure editor drafts survive that temporary pause. Confirmed saves followed by list403 remain reported as saved, and new or duplicated procedures are checked using their returned ID. No mutation is replayed. This is client state handling, not a newly demonstrated backend authorization bypass.

Build and 236 automated tests pass. Browser runs passed 19 new access checks, 15 dispatch recovery checks and 10 procedure ownership/editor checks using actual React components and synthetic transport. Separate production-style desktop and 390px checks verified the handover dialog disappearing during unavailable access and returning with its exact summary, plus a procedure editor retaining its name and change note after an internal retry. No IRIS requests or stored-data writes occurred. Draft persistence across reload/logout is not provided.

## Handover draft dismissal — September 28, 2026

Reproduced loss of a typed handover summary after Cancel and reopening. Closing an edited handover now offers Keep editing or Discard draft. Failed saves retain the draft and error; an in-flight save blocks duplicate submission and dismissal. Unchanged or reverted drafts close directly. This applies to handover modal dismissal, not persistent drafts across reload/logout or other run forms.

Build and 236 automated tests pass. Run `node scripts/test-hook-browser.mjs --handover` and open its loopback URL for 14 real-component browser regressions, including summary/follow-up retention, busy and failed saves, original revision, saved handover edits and explicit discard. All 14 passed with a synthetic callback and no native requests.

Separate desktop and 390px checks used the real component and production styles. Actual repeated Escape initially exposed a native dialog closing while React retained the draft; remounting the local dialog on confirmation transitions fixed it without changing the shared Modal. Repeated Escape now returns to an open editor with exact summary and follow-up text. Refused saves keep the draft. The 356px confirmation fits the 390px document. These are browser-responsive tests, not physical-phone tests; no existing run or IRIS data was changed.

## Refused saved-data reads — September 27, 2026

Command history, runs and procedures now remove the specific cached resource after a forbidden GET, including its export. Temporary failures retain previous data, and rejected writes retain drafts. List and selected-detail refreshes are checked independently. Four new focused regressions pass; the full `npm run check` passes both production bundles and **172 tests**. See [behavior and isolated UI scenarios](PROTECTED_READ_RECOVERY.md). No native changes were needed; browser evidence belongs to the integration checkpoint.

## Recovery browser integration — September 27, 2026

The production client was inspected at 1280 × 900 and 390 × 844. An isolated command fixture confirmed that conflicts and failed current-target reads retain the draft without dispatch or receipt reads; a manual fresh review followed by execution produced exactly one in-memory write. A separate run fixture confirmed that a successful note survives a history-list failure, clears the submitted draft and does not invite duplication. Handover and restoration errors remain visible inside the active dialog with the entered values intact. These fixtures never connect to IRIS.

Procedure import validation was reproduced on the running native-backed gateway: malformed JSON previously displayed its error behind the modal. Errors for import, editing and duplication now appear inside their respective dialogs, and import/copy inputs are disabled while saving. Desktop and phone checks confirmed the malformed JSON message and retained input, with no page-width overflow. No procedure was imported by that validation test. The latest full check remains **168 passing tests** plus frontend/server builds.

## Run action recovery — September 27, 2026

Successful run writes now remain successful when the following history read fails, so saved notes are cleared instead of inviting duplicate submission. Restoration and handover show server errors within the active dialog and retain their fields. Checkpoint notes are locked while their action is pending. The full `npm run check` passes production frontend/server builds and **168 tests**, including four focused run-recovery regressions. See [run recovery behavior and isolated browser scenarios](RUN_RECOVERY.md). Native data and volumes were not changed. Browser verification belongs to the separate integration checkpoint.

## Command draft recovery — September 27, 2026

The command station now retains prepared fields after a failed preflight read or same-field conflict, invalidates the previous review and requires a manual fresh review. A new review supplies the new comparison baseline. Only failures after attempting the execution request consult the command receipt and may display an uncertain result. Six focused in-memory regressions pass; the full `npm run check` passes the production build and **164 tests**. See [recovery semantics and test scope](COMMAND_RECOVERY.md). No native writes or volume changes were needed for this correction. Browser verification is recorded separately after the isolated fixture check.

Verified September 26, 2026 on disposable IRIS Community 2026.2 build 221U. Each dated entry records the version and checks available at that time.

| Check                    | Current result                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| npm run check            | TypeScript, production frontend/server bundles and 97 tests pass.                                                       |
| npm audit                | Zero reported vulnerable dependencies at verification time; this does not audit the OS or IRIS image.                   |
| Clean native image build | The configure and install scripts compile the current extension successfully.                                           |
| test:authorization       | Limited native account, rejected escalation, database-read revocation and existing-session revocation pass.             |
| test:install             | Deployed static files, CSP, login, CSRF, info, native reads, extension and logout pass.                                 |
| test:live                | Native list/detail coverage, disposable CRUD and observation sources pass.                                              |
| test:workflows           | Users, wallet metadata isolation, complete task creation/control, OAuth configuration/credentials and async audit pass. |
| test:x509                | Disposable certificate creation/import/update/read/removal passes.                                                      |
| test:process             | Explicit demo worker suspend/resume/terminate passes; disappearance checked.                                            |
| test:runbooks            | Observation, application/task windows, state verification, restoration and ownership isolation pass.                    |

The replacement kept security and API regression contracts. Five tests for the removed Harbor-style presentation helper were retired with that helper. Four new command tests cover selective conflicts, detached defaults, target contracts and complete task payloads. Lower totals than an earlier revision do not indicate that failing security tests were deleted.

## Browser verification

Current production builds were inspected at desktop and 390 × 844 widths. Separate localhost fixtures exercised a task update end to end: the browser sent only Description, preserved an externally changed SuspendOnError value, and refused a second write after an external Description conflict. A failed logout kept the authenticated view and showed the error. Fixture writes never reached IRIS.

The real native suites and these isolated UI checks test different boundaries. They do not certify every combination of administrator configuration or every browser. Current screenshots are under docs/images; old screenshots remain historical illustrations where named accordingly.

## Reproduction

Run npm ci and npm run check in this repository. Native scripts require a disposable local instance and IRIS_TEST_USER, IRIS_TEST_PASSWORD and IRIS_URL. On the reviewed host use http://127.0.0.1:52790 for IRIS and PORTAL_URL=http://127.0.0.1:3300, PORTAL_ORIGIN=http://localhost:3300 for the gateway. The origin must match PUBLIC_ORIGIN even if transport uses a different loopback address.

Run test:install, test:authorization, test:live, test:workflows and test:runbooks. For X.509 set IRIS_TEST_CERT to a disposable PEM path inside the container. For process control run iris/start-test-worker.script and pass the printed PID as IRIS_TEST_PID within two minutes. The suite refuses any process whose routine does not identify Waypoint.DemoTask.

Installation failure paths were tested in separate native sessions: both a failing status and an unexpected runtime exception exited with code 1 before the subsequent success marker. Error traps are set on the same direct-mode command as the protected operation.

## Limits and retained evidence

IRIS for Health and a complete external identity-provider authorization flow were not tested. Host observations are not container quotas. The earlier volume-replacement persistence checks remain historical evidence; the current native image build did not delete or replace the live data volumes. No public GitHub/Open Exchange publication or contest submission was performed.

See PROVENANCE.md, CONTEST_SECURITY_REVIEW.md and DEPLOYMENT.md for origins, boundaries and deployment prerequisites. Test resources are temporary and cleaned up by the native scripts.

## Final independent release verification

September 27 addition: the product is now Waypoint, with its own namespace, package and /api/waypoint extension. The complete set has 97 tests, including configurable observation validation and engine execution without native writes. A real eight-source plan completed 8/8 steps, and its stored report reopened successfully. Earlier reports survived the rename. Native installation, authorization, smoke, workflows and runbooks were rerun under the new name; the Waypoint.DemoTask worker also passed suspend/resume/terminate. The renamed native image built successfully. Desktop and 390 × 844 layouts were inspected. The attempted browser download-event automation timed out and is not claimed as a successful on-disk export.

## Native observation ownership — September 27, 2026

Native target lists now stay bound to their path/query scope. Same-source transient errors preserve the last read; access denial removes it. Production builds and 201 Node tests pass, plus 12 standalone real-React browser checks from `npm run test:hook-browser`. Desktop/mobile production-client checks passed using synthetic responses. See [reproduction, standalone test instructions and limits](NATIVE_OBSERVATION_OWNERSHIP.md).

## Stored runs and procedure draft ownership — September 27, 2026

The current full `npm run check` passes frontend/server builds and **215 tests**. Stored-run shape validation and legacy/evidence compatibility are documented in [stored run validation](STORED_RUN_VALIDATION.md). The procedure editor now pins its write ID and revision to its draft and blocks editing during refresh; see [procedure editor ownership and its standalone actual-component runner](PROCEDURE_EDITOR_OWNERSHIP.md). Earlier counts in this record describe historical checkpoints. No existing run/procedure data or native instance was used for these checks.

## Procedure import/export bounds — September 27, 2026

The current full check passes frontend/server builds and **220 tests**. Procedure imports now accept supported own exports within derived UTF-8 and formatting limits; the global 256 KiB request limit is unchanged, with only the exact POST import envelope receiving its 41-byte overhead. See [procedure import/export limits and exact-boundary verification](PROCEDURE_IMPORT_LIMITS.md). Earlier counts remain historical checkpoints. No existing data or native procedure execution was involved.

## Pending login ownership — September 27, 2026

The full check now passes frontend/server builds and **226 tests**, including six actual HTTP middleware regressions for login completing after logout, session replacement or expiry. Rejected late authentication cannot issue a replacement session cookie. See [login replacement ownership and limits](LOGIN_REPLACEMENT_OWNERSHIP.md). Tests use synthetic native responses and new temporary directories; no existing data or native operation is used.

## Follow-up deadline ordering — September 27, 2026

The full check passes frontend/server builds and **227 tests**. One added engine/store/summary regression verifies chronological ordering and overdue detection for accepted UTC timestamps with different fractional precision. The regular UTC-minute editor is unchanged. See [handover deadline boundaries and verification](HANDOVER_DEADLINES.md).

## Journal evidence and diagnostic budgets — September 27, 2026

The full check passes frontend/server builds and **231 tests** (exit 0). Four additional regressions verify restoration after three large native diagnostic responses, a durable command outcome when nested evidence is explicitly omitted, bounded readback/reconciliation failures and UTF-8/JSON-escape budgets. Existing stored data and record-size caps remain unchanged. See [journal budgets and legacy recovery limitations](JOURNAL_EVIDENCE_BUDGETS.md).

## Guided procedure loading — September 27, 2026

The full check passes frontend/server builds and **234 tests** (exit 0). Three component callback/effect-lifecycle regressions cover switching away from pending inventory, ignoring late responses and keeping application/task inventory scopes separate. The correction resets loading only when the selected workflow needs no inventory. See [planner loading and test boundaries](PROCEDURE_PLANNER_LOADING.md).

## Stored command receipts — September 27, 2026

The full check passes frontend/server builds and **236 tests** (exit 0). Two additional real-journal/service regressions cover thirteen malformed stored receipt variants and a compatible legacy/evidence control. Invalid nested records fail before history consumers or automatic recovery, preserving their bytes and making zero native requests. See [stored command validation and its limits](STORED_COMMAND_VALIDATION.md).

Round 30 reference display: the library and active checkpoint now show each HTTPS reference's parsed host/port before it is opened, with its full URL in the title. Existing validation disallows non-HTTPS schemes and embedded credentials; target/rel protections remain unchanged. The final production bundle passed desktop 1280×900 and phone 390×844 checks using schema-valid synthetic procedures/runs. Both views displayed normal and long destinations, preserved keyboard focus and full href/title, and had client/scroll widths1265/1265 and375/375. No external link was followed and no step or native request was executed. Full build and231tests passed; no mirror tests were added for the presentation-only change. Parent-workspace evidence: research/reference-navigation-review.md, waypoint-reference-browser-state.json, waypoint-reference-browser-counters.json and waypoint-reference-*.png. Fixture3453 and its temporary tab were stopped/closed.
