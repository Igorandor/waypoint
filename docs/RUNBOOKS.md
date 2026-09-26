# Runbook behavior and recovery

Waypoint executes fixed, readable plans against native IRIS APIs. Creating a plan does not change IRIS. Each subsequent step requires an operator action; there is no unattended scheduler or arbitrary command executor.

## Included plans

**Observe an instance** records product/API identity, native dashboard values, host capacity and a bounded system-log excerpt. The dashboard's `SystemMonitor` field must be considered when interpreting sampled values. Capturing a response does not certify a healthy system.

**Application maintenance window** reads the original `Enabled` state, checks it again before a change, disables the chosen route, waits for a maintenance note, restores the original boolean value and reads it back. An originally disabled application remains disabled. The native admin API, Waypoint API, root route and Management Portal routes are excluded to avoid locking the operator out. Disabling a web application does not promise to drain or terminate existing sessions.

**Task scheduling window** reads `/v2/task/info`, suspends future scheduling with `LeaveInQueue=true`, waits for a note, and restores the original `Suspended` value. An already suspended task remains suspended. Suspension is not process termination and does not stop arbitrary task code already executing. The final step reads history filtered to this task ID; an empty history is legitimate.

## State transitions

```text
pending → running → done
             │
             ├─ failure before a write → failed → explicit retry
             └─ failure after attempting a write → uncertain → read-only reconciliation
```

The gateway saves `running` before executing a step. Before a changing write, it also persists the obligation to restore the original state. If the response is lost or read-back differs, the result becomes **uncertain**. Waypoint does not automatically resend the write.

**Check current state** reads the target. If its value matches the requested value, the step is recorded as reconciled; this proves the observed state, not which actor changed it. If it differs, the step becomes failed and requires another explicit decision. An interrupted `running` write recovered after a gateway restart also becomes uncertain; interrupted reads become failed and can be retried.

The read-before-write check reduces accidental overwrites but is not an atomic compare-and-set. The SysAdmin contract used here has no ETag precondition. Avoid concurrent administration of the same target during a maintenance window.

## Restoring early

When a restoration is pending, **Restore now** requires the exact target identifier. It skips the remaining maintenance checkpoint, keeps that fact in the journal, restores the original boolean state and verifies it. It does not undo code deployments, file edits, database changes or other maintenance done outside Waypoint. Complete the closing evidence step afterward.

Closing the tab, signing out or stopping the gateway does **not** automatically restore IRIS. Waypoint blocks closing a run while its own restoration obligation remains. If the account loses its native IRIS privilege or the server becomes unavailable, an authorized administrator must restore the target through an available management interface; preserve the run report for investigation.

## Durable records

- Run files are scoped to the IRIS username and `IRIS_INSTANCE_ID`, with opaque hashed storage directories and UUID filenames.
- Passwords, cookies and session credentials are not written into run files. Responses use recursive credential-field masking. Operational logs can still contain application data.
- The gateway uses a temporary file, file sync and atomic rename for each update. This protects against partial replacement; it is not a claim of distributed transactions or storage-level disaster recovery.
- A per-run in-process lock rejects concurrent step submissions. Exactly one gateway process must own a data directory. Do not mount one run volume into multiple replicas.
- Each account/instance can keep up to 100 runs. Each step's evidence is bounded to 100,000 JSON characters and journals retain the latest 200 events. Large evidence is replaced by an explicit size notice, never silently clipped into invalid JSON.
- The Docker `waypoint-runs` volume persists across portal container replacement. For local Node development, `WAYPOINT_DATA_DIR` defaults to `./data`, which Git ignores.

Set a unique, stable `IRIS_INSTANCE_ID` for each deployment. Compose exposes it as `WAYPOINT_INSTANCE_ID`. Do not repoint that label at a different server with active runs. It is a configuration identifier, not cryptographic server identity.

Back up both the IRIS data and run journal separately. To archive old runs, export reports, stop the gateway, preserve a backup of the data directory, then move selected **closed** run files into an offline archive. Never remove a run with pending restoration. The application does not automatically delete operational evidence.

## Reports and limitations

Exported JSON contains the confirmed plan, operator, target, timestamps, original state, step outcomes, notes and journal events. It is an editable report, not a signed or immutable audit record. Native IRIS audit remains the authoritative source for security audit retention.

Runs are account-scoped rather than shared team assignments. A report can be handed to another operator, but importing it never executes or recreates a plan: this version intentionally has no executable run import. To extend the product, add a typed template and a reviewed handler; do not accept arbitrary endpoints or shell commands in imported JSON.
