# Run action recovery

A successful run action and its following history refresh are separate results. The returned run is displayed immediately. If only the list read fails, the action remains successful: saved notes are cleared, completed dialogs close, and a warning asks the operator to refresh the list without repeating the write. Existing history remains visible until refreshed.

Rejected actions return their actual error to the caller. Restoration and handover display it inside the active dialog, where it remains accessible while the background is inert. The confirmation or handover draft stays available. No action is automatically replayed. If a connection fails during a write, inspect the current run before deciding whether to retry.

## Verification

`tests/run-action-recovery.test.ts` exercises the actual action handler with controlled transports:

- POST success followed by history GET failure returns success, publishes the saved revision first, retains the previous list, and sends exactly one write.
- Handover and restoration rejections retain the server's message and perform no auxiliary list read or state replacement.
- Successful action and list responses publish in order.
- The checkpoint note field is disabled during an action and editable afterward, so text entered during a pending save cannot be cleared by that save.

The full `npm run check` passed on 27 September 2026: production frontend/server builds and **168 tests**, including the four new regression tests. Browser evidence is recorded in the integration checkpoint after testing the shared bundle.

## Isolated browser proof

The workspace-only `research/waypoint-run-recovery-fixture.cjs` serves the built application at `http://127.0.0.1:3407/#runbooks`. It has one disposable in-memory run, a fixture account, and no native connection. Start it only after the intended bundle has been built. Restarting the process resets its state.

1. Open Operator notes and enter a note. Send `POST /_test/control` with `{"failNextList":true}`, then click Append note. The note should appear once, the textarea should clear, and the warning should explain that the action was saved. `GET /_test/state` must show one applied notes action. Refresh runs should remove the warning without another mutation.
2. Open Prepare handover and fill its summary. Set `{"failNextHandover":true}` before saving. The dialog must remain open, keep the summary, and display the fixture's 409 message inside the dialog. The applied counter must not increase. A later deliberate save can succeed because this fixture simulates a one-shot rejection, not an actual concurrent edit.
3. Open Restore now and enter target `7`. Set `{"failNextRestore":true}` before Restore and verify. The dialog must retain the confirmation and show the restoration-specific 409 message. The fixture's target and applied counter must remain unchanged. Canceling sends no action.

Repeat the visible error checks on desktop and a narrow viewport. Inspect `/_test/state` rather than inferring mutation counts from UI text. These controlled UI checks do not establish native IRIS behavior or change its data.
