# Waypoint for InterSystems IRIS

Waypoint combines a complete IRIS administration client with durable, step-by-step operations. Its main workspace guides an observation run, an application maintenance window or a task scheduling window. It remembers the original state, verifies transitions, records checkpoints and handles uncertain write outcomes without automatically replaying them. Operational evidence comes from the real SysAdmin v2 APIs and the protected native telemetry extension.

Built for the [InterSystems Programming Contest: Build Your Own Management Portal](https://community.intersystems.com/post/intersystems-programming-contest-build-your-own-management-portal).

![Waypoint connected to a real IRIS Community instance](docs/images/overview.png)

## Start with the Operations desk

1. Choose **New run → Observe an instance** and review its four steps. **Create run** saves the plan without executing it.
2. Choose **Run next step** to capture each source. Select recorded steps and export the completed report.
3. For a maintenance window, select an application or task and type its exact target. The first step records the original state.
4. Run the next transition and inspect the read-back evidence. Complete the external maintenance work and record a note at the checkpoint.
5. Restore the original state, or use **Restore now** to bypass the checkpoint and restore early. Finish the closing evidence step.
6. If a write result is uncertain, use **Check current state**. Waypoint reads the target before allowing another decision.

Run history survives gateway restarts in the configured data volume and is scoped to the signed-in account. Closing the browser does not automatically restore an open window. Read [runbook semantics and recovery](docs/RUNBOOKS.md).

The left tool rail opens Runs, Status, Apps, Access, Secrets, Tasks, Host, Logs and API. Run history, step selection and the recorded result occupy separate panes. **New run** opens the runbook picker; it does not execute an operation.

## Command station and observations

| Area             | Current workflow                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Applications     | Inspect and change native web application routes, namespaces, dispatch and authentication settings.             |
| Permissions      | Manage accounts, passwords, role inheritance and resource grants.                                               |
| Security         | Wallet metadata and write-only secrets, certificate ownership, TLS and OAuth configuration/credentials.         |
| Tasks            | Create on-demand or scheduled work, edit selected fields, inspect task info and run/suspend/resume with review. |
| Host and devices | Real host observations, processes and eligible controls, device definitions and database inventory.             |
| Logs             | Messages, alerts, asynchronous audit queries, task history, journals and session receipts.                      |

Every write has a separate review step. Execution and destructive controls require a typed target. Updates compare the touched fields with a fresh native read; this reduces lost updates but is not an atomic native lock.

The interface includes light/dark themes, keyboard controls, Ctrl/Cmd+K navigation and responsive layouts. Native API values are never replaced with sample data.

Waypoint uses target selection → command preparation → review → one execution → receipt. Instance watch collects labelled observations; the API observations catalog supports additional read endpoints.

## Quick start: complete local installation

Requirements: Docker Engine/Desktop with Compose v2, at least 4 GB available RAM, and approximately 5 GB free disk space. Linux containers are required. On Windows, start Docker Desktop or a Docker daemon in WSL first.

```sh
docker compose up -d --build
```

Open **http://localhost:3300** and sign in:

- Username: `SuperUser`
- Password: `WaypointLocal-2026!`

This is a known **local demonstration credential**, configured only by the bundled IRIS development image. Both published ports bind to `127.0.0.1`. Do not expose this stack to the public internet. Use your own instance and account for deployment.

The first image build takes several minutes. It installs the small ObjectScript/Embedded Python extension and pins the IRIS Community image by digest. The portal uses a non-root Node.js container. The `iris-data` volume preserves IRIS databases; the separate `waypoint-runs` volume preserves runbook records across container replacement.

```sh
docker compose ps
docker compose logs --tail=80 portal iris
docker compose down          # keeps IRIS data
```

If ports are in use, configure `WAYPOINT_PORT`, `WAYPOINT_ORIGIN` and `IRIS_WEB_PORT` together. Example in Bash:

```sh
WAYPOINT_PORT=3301 WAYPOINT_ORIGIN=http://localhost:3301 IRIS_WEB_PORT=52791 docker compose up -d --build
```

In PowerShell, set the corresponding `$env:WAYPOINT_PORT`, `$env:WAYPOINT_ORIGIN` and `$env:IRIS_WEB_PORT` variables before running Compose. Use the exact configured browser origin; `localhost` and `127.0.0.1` are different origins.

## Connect to an existing IRIS instance

Use IRIS Community **2026.2 with SysAdmin API v2**, or a compatible newer instance. The bundled stack pins 2026.2 build 221U. IRIS for Health exposes the same management APIs, but the included automated live checks were run on standard IRIS Community; a separate IRIS for Health installation has not been certified here.

1. Enable `/api/admin` with password authentication on your IRIS instance. Keep normal IRIS security resource checks in place.
2. Install the extension in `%SYS`. Copy `iris/Waypoint` to your server, then run:

   ```objectscript
   zn "%SYS"
   do $SYSTEM.OBJ.LoadDir("/path/to/iris/Waypoint","ck",,1)
   do $SYSTEM.Status.DisplayError(##class(Waypoint.Installer).Install())
   ```

   The installer creates `/api/waypoint` with password authentication and `%Admin_Operate` protection. It does **not** change existing account passwords. `iris/configure.script` is only for the disposable Docker demonstration image; never run it on an existing environment.

3. Install Node.js 22 LTS or newer and configure the portal:

   ```sh
   npm ci
   cp .env.example .env
   # Set IRIS_URL to your existing instance and PUBLIC_ORIGIN to your browser URL.
   npm run dev
   ```

4. Open **http://localhost:5175** and use your IRIS credentials. You need the relevant `%Admin_*:USE` privileges for each operation. Errors from insufficient privileges are displayed, not bypassed.

For a production build:

```sh
npm run build
# Set PUBLIC_ORIGIN=http://localhost:3300 for this local production server.
npm start
```

See [deployment and security](docs/DEPLOYMENT.md) before serving to other users.

## Command walkthrough

1. Open Applications or another target area. Select an existing target, inspect its evidence and choose Prepare update.
2. Add only the fields you want to change. Existing safe values are loaded into those fields. Omit removes a field from the command. Nested objects and arrays use typed controls.
3. Review command shows the target and before/proposed values. Execute once sends a single native write, then displays a receipt. A conflicting touched field stops the write.
4. For creation, choose Create new. Tasks start with a complete on-demand record. Waypoint.DemoTask in %SYS is a harmless test task which records a timestamp in ^WaypointDemo.
5. Security targets include wallet collections, scoped entries, X.509/TLS and OAuth servers/clients. Secrets are write-only; review masks them.
6. Processes and devices provides native process details, reviewed controls, device administration and database inspection.
7. Instance watch collects host capacity or native dashboard observations. A stopped system monitor is labelled stale; CPU ticks remain cumulative counters.
8. Logs collects messages/alerts, audit results, task history, journals and session command receipts. API observations offers additional read endpoints.

## Development and verification

```sh
npm ci
npm run check                 # TypeScript, browser/server builds, security and contract tests
npm audit                    # dependency audit
```

Live tests create **temporary administrative records** and clean them up. Only run against a disposable instance:

```sh
export IRIS_TEST_USER=SuperUser
export IRIS_TEST_PASSWORD='WaypointLocal-2026!'
npm run test:live
npm run test:workflows
npm run test:runbooks          # Observation, application window, task window and persistent reports
```

For PowerShell, use `$env:IRIS_TEST_USER='SuperUser'` and `$env:IRIS_TEST_PASSWORD='WaypointLocal-2026!'`.

The live suites verify create/update/read/delete behavior, account disablement, wallet metadata isolation, task scheduling and execution controls, OAuth configuration and asynchronous audit retrieval. Read [the verification record](docs/VERIFICATION.md) for exact coverage and known platform differences.

## Architecture

```text
Browser (React + TypeScript)
        │ same-origin JSON + HttpOnly session cookie + CSRF token
Node.js gateway (Express)
        │ fixed IRIS upstream; user's credentials held in memory
        ├── /api/admin → native SysAdmin v2 APIs
        └── /api/waypoint → protected ObjectScript + Embedded Python extension
```

- `src/features/runbooks`: plan review and step-by-step execution UI.
- `shared/runbook.ts`: typed templates, states and summaries.
- `server/run-engine.ts`: guarded transitions, reconciliation and restoration.
- `server/run-store.ts`: account-scoped atomic JSON persistence.
- `src/pages/Runbooks.tsx`: run queue; `src/commands`: independent command station and observations.
- `src/components`: product-specific evidence views and dialogs.
- `shared/commands.ts`: runtime targets; `shared/command-draft.ts`: defaults and conflict checks; `shared/schema.ts`: contract access.
- `shared/iris-openapi.json`: unchanged upstream specification; `iris-contract.json`: generated request-only projection.
- `server`: sessions, origin/CSRF protection, allowlisted upstream requests and response handling.
- `iris/Waypoint`: native extension, installer and harmless demo task.
- `tests`: security boundaries and contract checks; `scripts`: reproducible live checks.

There is no background AI service, analytics, paid API, cloud account requirement or simulated backend. See [architecture](docs/ARCHITECTURE.md) and [contest coverage](docs/CONTEST.md).

## License and attribution

Original application code is MIT licensed. The InterSystems API specification is attributed separately in [THIRD_PARTY.md](THIRD_PARTY.md). InterSystems IRIS is a separately licensed product and is not covered by this repository's MIT license.

## Independent project

The earlier Harbor-derived application foundation has been replaced. Waypoint now owns its administration workflow, gateway/session implementation, presentation components and native extension. Official API references, conventional build scaffolding and retained regression/native probes have their provenance documented in [PROVENANCE.md](docs/PROVENANCE.md). No sibling checkout or service is required. Git history remains intact.

See [data views and limits](docs/DATA_VIEWS.md).

## Custom observation plans

Open Runbooks → New run → Observe an instance. Choose one to eight sources and optionally name the plan. Selection order determines execution order; deselect and reselect a source to move it to the end. Review the displayed plan and create it. Creation only stores the plan. Run next step performs exactly one selected read and stores its result. Available sources are identity, health, host capacity, messages, processes, task definitions, application routes and journal files. Reopen the run after a reload to inspect its saved evidence. Custom sources cannot be inserted into maintenance templates. Lists are capped at 100 rows where supported; the existing per-step report limits still apply.

See [the original project idea](IDEA.md). The written walkthrough above is part of the contest demonstration; no video or public hosted demo is implied.
