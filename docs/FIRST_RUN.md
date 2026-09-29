# Your first observation and handover

Start with a saved observation. It reads IRIS without changing an application or task schedule. Follow the [installation steps](../README.md#quick-start-complete-local-installation), sign in with an account allowed to read the selected sources, and open **Runs** in the navigation (labelled **Runbooks** in the tool finder). The page heading is **Run queue**.

The **Operations desk** summarizes saved work and follow-ups; use **Run queue** to create the first run.

## Capture an observation

1. Select **New run → Observe an instance**. Keep the four default sources: instance identity, system health, host capacity and recent messages. Give the run a name you will recognize in history.
2. Read the plan and select **Create run**. This saves the plan; it has not collected the observations yet.
3. Select **Run next step**. Inspect the recorded result and timestamp, then repeat for the remaining steps. Selecting an earlier step shows its saved evidence; it does not run that step again.
4. Read any unavailable-source or size-limit notice. A recorded response is evidence of what IRIS returned, not a certificate that the instance is healthy. If a read fails, inspect its error before explicitly retrying.
5. Add an **Observation**, **Decision** or **Follow-up** under **Operator notes**, then select **Append note**. For example, record which source needs further investigation and why.
6. Select **Export report** to retain the run as JSON. Reopen it from run history to confirm that the saved results and note are still present.

If creation reports an uncertain result, the plan may already be saved. Choose **Check saved runs** and inspect the refreshed history before creating another plan. This reads the list without repeating creation or executing a step. If the list cannot be read, the dialog keeps your fields and lets you retry the read. Close and reopen the creation dialog only after checking for the original plan; closing discards its in-memory fields.

## Hand over the result

Select **Prepare handover** in the run. Enter an intended recipient, a short summary and any outstanding risks. Use **Add follow-up** for a concrete next action; its optional deadline is labelled **Due (UTC)**. Select **Save handover details**, then download **Printable report** or **JSON package**. Open the printable HTML file in a browser to read it or print it. Large evidence blocks are shortened and labelled in HTML; include the JSON package when the recipient needs the retained data in full.

If you close an edited handover, choose **Keep editing** to retain the draft or **Discard draft** to remove your unsaved changes. Escape from that confirmation returns to the editor. A refused save leaves your text available to review. Switching tools suspends an open run dialog; returning to **Runs** restores its draft. Drafts remain in memory only: save before reloading the browser or signing out.

Send that file through your normal team channel. Mark delivery only after you have done so: Waypoint records your statement but does not send a message or confirm receipt. The package includes recorded evidence and unresolved work; it does not give another account permission to execute this run. Run history remains scoped to its owner and configured instance.

## Optional: try a maintenance window

Use a disposable application route or task on an instance where you are authorized to change it. The [one-minute recording](https://www.youtube.com/watch?v=ZKfUzavGfEo) demonstrates an application window using a temporary route.

1. Create an **Application maintenance window** or **Task scheduling window** and type the exact target identifier. Inspect the plan before saving it.
2. Execute the first step, **Record the original state** for an application or **Record task scheduling state** for a task. Read the saved value before continuing: restoration returns to this value, so an originally disabled application or suspended task remains that way.
3. Execute the next transition and inspect its read-back. Application maintenance disables the route; task maintenance suspends future scheduling. Neither action promises to terminate existing work or sessions.
4. Do the intended maintenance outside Waypoint, enter the checkpoint note, then continue to restore the original state. **Restore now** allows early restoration if you need to skip the checkpoint. Finish the closing evidence step.
5. If the result is uncertain, use **Check current state** before another decision. If the browser says the action result has not been retrieved, use **Refresh runs** first to retrieve the current saved record.

![A reopened run retains its pending restoration](images/overview.png)

Closing the browser does not restore the target. Keep the run open until its restoration is verified; if access is lost, an authorized administrator must restore it through an available management interface. A handover report does not release that obligation or undo maintenance performed outside Waypoint.

## Resume an interrupted maintenance window

Return to **Runs** with the same IRIS account and configured instance, then reopen the saved run. Use its current journal before deciding what to do next:

| What you see | Next action | What it establishes |
| --- | --- | --- |
| The action result has not been retrieved; actions and exports are paused | Choose **Refresh runs** to retrieve the run detail. Do not create another run for the same maintenance. | The current saved journal, if the detail read succeeds. A refreshed list alone does not establish the outcome. |
| **Result uncertain** | Choose **Check current state** and inspect the recorded observation. | The target's observed state, without repeating the write. A matching value does not prove who changed it. |
| **Original state still needs restoration**, with no unresolved action | Finish the checkpoint, or choose **Restore now**, review the target and type its exact identifier. | Restoration is complete only after its result is verified. Early restoration skips the remaining maintenance checkpoint. |
| The action was saved, but refreshing history failed | Refresh the history. Do not append the note or execute the step again merely to dismiss the warning. | The already returned action remains saved; the history-list error is separate. |

If the target remains uncertain or differs from the expected value, inspect the error and coordinate with whoever else administers it before another explicit action. Losing permission does not release the restoration obligation; an authorized administrator may need to use another management interface.

To rehearse resuming work, use an **enabled disposable application route** or a **disposable task whose scheduling is not suspended**. Record its original state, perform the maintenance transition and wait for its verified result. Close the browser tab at the checkpoint, reopen the portal and select the same saved run. The original value and pending restoration should still be recorded. Restore that value, complete the closing evidence step and export the report. This exercises reopening a saved maintenance window; it does not simulate a lost write response or test gateway crash recovery. An originally disabled route or suspended task may require no maintenance write, so it is a different case.

See [runbook behavior and recovery](RUNBOOKS.md) for exact transitions, persistence and limits. The [run detail](../src/features/runbooks/RunDetail.tsx) and [handover controls](../src/features/runbooks/RunRecordTools.tsx) implement the actions above.
