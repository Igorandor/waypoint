# Running and restoring IRIS maintenance procedures with Waypoint

When you disable an application for maintenance, you need to remember its starting state and restore it afterward. A lost response or a shift change makes this harder: another operator needs to know what happened and which steps remain.

Waypoint records each step of an IRIS maintenance run, including observations, operator notes and unfinished restoration work. The Operations desk lists runs that need attention. This walkthrough begins with a read-only run before explaining the maintenance and handover workflows.

The [repository](https://github.com/Igorandor/waypoint) includes the source, installation instructions and recovery documentation. Development used AI assistance; the implementation history and retained third-party references are described in [provenance](https://github.com/Igorandor/waypoint/blob/main/docs/PROVENANCE.md).

## Start with an observation run

The supplied installation uses Docker with Compose v2 and Linux containers. Allow at least 4 GB of available RAM and approximately 5 GB of disk space.

```sh
git clone https://github.com/Igorandor/waypoint.git
cd waypoint
docker compose up -d --build
docker compose ps
```

After the first build completes, open `http://localhost:3300`. The bundled account is `SuperUser`, with password `WaypointLocal-2026!`. This is a published development-image credential. Both published ports bind to loopback. Deployments for other users need private accounts and HTTPS; the [deployment guide](https://github.com/Igorandor/waypoint/blob/main/docs/DEPLOYMENT.md) covers the existing-instance configuration.

For a first walkthrough, use the observation plan:

1. Open **Runbooks** and choose **New run → Observe an instance**.
2. Read the four planned steps before choosing **Create run**.
3. Select **Run next step** to record the instance identity. Inspect the result before continuing.
4. Advance through the dashboard, host capacity and bounded system-log observations. Each step needs an explicit operator action.
5. Inspect source timestamps and any missing or limited evidence. A recorded response does not certify that the instance is healthy.
6. Export the run report and inspect its contents before sharing operational data.

This walkthrough reads IRIS and saves Waypoint records. It does not suspend tasks, change web applications or execute arbitrary commands. The separate journal volume retains run records across gateway restarts.

## A maintenance window remembers the starting state

The application maintenance plan first reads the selected route's `Enabled` value. It checks that state again before disabling the application, waits for a maintenance note, then restores the original boolean and reads it back. An application that was already disabled is restored to disabled, rather than being enabled unconditionally.

Management routes are excluded from this plan to reduce the risk of locking the operator out. Disabling a route does not promise to drain or terminate existing sessions. Use a disposable application when trying this changing workflow for the first time.

The task scheduling plan follows a related sequence around the native suspended state. Suspending scheduling does not terminate task code that is already running. The closing history read is filtered to the selected task; an empty result remains a legitimate observation.

**Restore now** provides an explicit early restoration path. It requires the exact target, records that the remaining checkpoint was skipped, restores the recorded state and verifies it. It does not undo deployments, file edits or database changes performed outside Waypoint.

Closing the browser, signing out or stopping the gateway does not automatically restore the target. The pending obligation stays in the journal, and the run cannot be closed while restoration remains outstanding. If privileges or connectivity are lost, an authorized administrator may need another management interface to restore service.

## Handle a lost response without sending the write again

Before a changing step, the gateway records its dispatch state and restoration obligation. If a response is lost, the result becomes uncertain. **Check current state** reads the target; it does not replay the mutation.

A matching read establishes the observed state, not which actor produced it. A differing read remains visible and requires another decision. Read-before-write checks reduce stale changes, but the native API contract does not provide an atomic compare-and-set against another administrator.

The command station uses the same separation between reviewing a command, confirming its target, dispatching once and inspecting the receipt. It covers the broader administrative tools alongside the runbooks: applications, permissions, secrets, tasks, host resources and logs.

## Reuse procedures and prepare a handover

The Procedure library stores versioned definitions made from known observations, manual checklist steps and predefined assertions. A run keeps its selected version. Editing a procedure therefore does not silently replace the plan of a run already in progress.

The guided planner helps assemble application, task, capacity or handover reviews. Imports accept procedure definitions, not executable code or old run evidence for execution. Failed or unknown assertions remain visible; they do not automatically change IRIS.

Handover packages retain follow-up actions and unresolved obligations in JSON or a printable HTML report. Recording delivery neither sends a message nor proves recipient acceptance. Reports are account-scoped and do not transfer execution authority to another operator.

## Implementation and verification

The React client connects to a same-origin Node gateway with cookie sessions and CSRF protection. The gateway calls native SysAdmin v2 APIs using the operator's privileges. A protected ObjectScript extension uses Embedded Python for host telemetry and bounded log reads without starting a shell. Host observations describe the operating system visible to IRIS, which can differ from container resource limits.

One gateway process owns each journal directory. Saved records use bounded reads and atomic file replacement; they are not cryptographically immutable audit records. Back up the journal and IRIS separately.

The September 27 checkpoint passed production builds and 236 Node tests. Earlier native verification used IRIS Community 2026.2; IRIS for Health and a complete external OAuth-provider flow remain unverified. The [runbook guide](https://github.com/Igorandor/waypoint/blob/main/docs/RUNBOOKS.md) and [verification record](https://github.com/Igorandor/waypoint/blob/main/docs/VERIFICATION.md) document the tested recovery paths and their limits.

## Video walkthrough

[Watch the recorded workflow on YouTube](https://www.youtube.com/watch?v=75ABhoRBS-4).
