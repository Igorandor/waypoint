# Operational workflows

## Begin an operator session

Open Operations desk after signing in. Each source is refreshed independently with current native authorization. Counts describe this account's returned records; an unavailable source remains visible and prevents an all-clear interpretation. A run can appear under restoration, verification and follow-up at the same time.

Inspect a record before acting. The desk reads the durable record, exposes relevant step outcomes and links to its controls. Reconciliation of a command is a read. It never sends the reviewed mutation again. Other operators' runs are not displayed, although their active target reservations still block conflicting application/task commands.

Use **Refresh records** to update the queue. If access to a source is refused, its cached entries and any matching open inspector are removed; other readable sources remain available. A missing or refused individual record is also removed from the desk. A temporary failure while refreshing a source leaves the previously read inspector visible, so check the source error and read time before relying on it. Refresh and inspect the record again after access is restored.

If **Read current result** is refused or reports a missing command, the desk checks access to that saved record separately. Its details and desk-export entry stay hidden during this check. A successful read restores the record; a refused or missing read removes it. If the check is temporarily unavailable, **Retry record access** performs only another read. It does not resend the original command or repeat reconciliation.

## Prepare a change

Application readiness and Task readiness are separate operational dossiers. Each source reports its own permission or availability error. Configuration, live state and historical results are distinct evidence. A task may be running even when future scheduling is suspended. Native task timestamps lack a UTC offset; wall-time duration estimates and schedule explanations do not predict the next execution.

Save a readiness procedure from a dossier, or use Guided procedure in the library. Check the target, required privileges, capacity assumptions and evidence dependencies. Review generated steps in the regular editor before saving a version. A definition contains no native mutations. Use Runbooks for maintenance windows and the command station for individual reviewed changes.

When reviewing two saved versions, inspect the definitions of added and removed steps as well as changed fields. An observation's target, checklist requirements or an assertion's expected result can differ even when the titles match. Recreated steps remain additions and removals because comparison uses stored identifiers. Export the comparison to retain these details; existing runs continue using their selected version.

## Import a procedure definition

In Procedure library, choose **Import procedure** and paste a JSON definition exported by Waypoint. **Validate and import** creates a new procedure owned by your account; it does not replace an existing procedure or execute its steps.

If validation fails, the pasted JSON stays in the dialog. Correct the reported field and try again. Paths identify the JSON location; numeric array positions start at zero, so `$.body.steps[17].items[0].text` means the first checklist item in the eighteenth step. Unsupported fields and unsafe references are rejected rather than silently removed.

## Recover a command result

After an execution attempt, its command ID remains consumed in that view even if the response is lost. If Waypoint cannot confirm read access to the saved result, it hides the previous evidence and keeps the ID for recovery. **Retry receipt access** reads that ID without executing the command or repeating reconciliation. A successful read restores current evidence; it does not make the consumed review executable again.

A denied or missing record cannot be inspected through that account. Use **Open command history** or an authorized management interface to establish the outcome before deliberately preparing another change. Losing access does not prove that execution failed. A conflict detected before dispatch is different: no command was sent, so the station preserves the draft for another review.

## Execute and preserve evidence

Create a run from a selected immutable version. If the creation response cannot be confirmed, use **Check saved runs** before trying again. This reads recent saved plans; it does not execute steps or automatically identify a matching procedure. Open a candidate and inspect its procedure identifier and immutable version. A missing entry does not prove that the first request failed. Only allow another plan after checking the saved records; a failed history read keeps creation blocked. This warning is retained while the page remains open, including switching procedures or tools; after a full browser reload, inspect Runbooks before repeating an interrupted creation.

Each step is explicitly executed. Checklists preserve completed item IDs, the account and its note. Assertions return passed, failed or unknown; missing fields never produce a pass. Capacity assertions compare typed native available/total values against an explicit percentage and retain the measurement.

For list observations, inspect **Requested row limit** beside the result. New successful inventory reads retain the requested maximum of 100 rows; task history retains 50. The value also travels with the JSON package and printable report. It describes the request, not proof that the server returned every matching record or that truncation occurred. The run view and printable report explicitly say when an older observation has no recorded limit. Log excerpts keep their separate source limits. **Export results** downloads only the raw response. Use **Export report**, **JSON package** or **Printable report** to retain the surrounding run and collection context.

Use the run's notes for observations or decisions without rewriting prior notes. Store a handover summary, risks, next actions and deadlines when work continues across shifts. Delivery is an owner declaration only; Waypoint sends no messages and transfers no ownership. Printable packages escape content and disable active scripts and network content.

For an assertion in the printable report, **Referenced observation** identifies its source step by number, title and procedure identifier, with the observation's source and target. Use that reference to find the recorded evidence even when several steps have the same title. A missing reference is reported explicitly; the report does not guess a source or rerun the check.

After closing a run without unresolved restoration, archive it. Compare completed observations by source, target and occurrence. Known root inventories align by application/journal name or stable task ID. Ordered configuration arrays keep their positions. A process inventory needs PID, job number and start time to establish generation identity; otherwise its rows are compared by position. Missing/failed sources and truncated values remain partial evidence, not proof of object deletion.

In a run comparison, **Only in before** and **Only in after** describe the two recorded responses. A task may leave a bounded result when newer rows enter the response; that does not prove the task was deleted. Check the collection notice for each side before acting on a difference. Comparison JSON retains these notices and any recorded request limits. Older observations with no saved limit remain explicitly uncertain. The collection warning remains visible when unchanged sources are hidden. The separate comparison data-limit warning concerns how much saved evidence was compared, not how many records IRIS originally returned.

## Investigate capacity and logs

Capacity watch starts with manual reads. An explicit watch schedules one in-flight read at most, every 30–300 seconds for 5–15 minutes. It stops on page hiding, navigation, read failure or elapsed duration. CPU utilization requires consecutive increasing native counters in the same host scope and topology. Resets and gaps yield unknown values. Charts do not interpolate missing samples.

Capacity samples and log bookmarks are held in browser page memory. Export before navigating away. Use a stored procedure when evidence must survive a gateway or browser restart.

Log investigation reads a fixed messages/alerts source from a bounded native tail. Literal filters cannot execute a regular expression. Context ignores active filters but cannot recover omitted file contents. Word-based signal labels are search aids, not native severity. Two tails are aligned only when an exact suffix/prefix overlap exists; rotation, truncation or missing overlap is explicit.

## Storage and recovery

New runs are refused when the account and instance already have 100 unarchived runs or 1,000 runs in total. Archiving a closed run frees an unarchived slot; it does not delete the record or reduce the total. At the total limit, existing runs remain available. Ask the deployment administrator to review retention after preserving the full data directory. Do not delete records with unresolved execution or restoration obligations to make room.

The journal directory requires one gateway process. Per-record writes use atomic replacement and fsync. Bounded descriptor reads reject non-regular files and oversized records. Corrupt maintenance records block target writes because a missing restoration obligation cannot safely be assumed.

Back up the full directory with IRIS-supported backups managed separately. Keep stable instance/account identity and preserve existing volume names during upgrades. A gateway restart clears sessions and prepared command bodies; saved procedures, reports and dispatch outcomes remain. Read native state to reconcile an interrupted write before preparing another command.

The test suite covers strict imports, version persistence, owner/instance isolation, current privilege checks, cross-owner target reservations, alias normalization, concurrent command execution, interrupted writes, missing readback, reused process generations, journal bounds, assertions, comparison semantics and derived task/capacity/log views. Live fixture checks are documented separately; offline tests do not certify every IRIS version or deployment topology.
