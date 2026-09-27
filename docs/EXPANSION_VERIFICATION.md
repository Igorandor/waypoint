# Expansion verification — 27 September 2026

The expansion adds versioned procedures, durable target reservations, reviewed-command journals with native readback, report archival/comparison/handover, application and task readiness, bounded capacity/log investigations, an operations desk and validated existing-instance deployment.

## Offline checks

`npm run check` passed the TypeScript client/server build and 158 tests. `git diff --check` passed. Route-based loading splits the application into separate workspace chunks; no chunk exceeds the bundler's 500 kB warning threshold.

The focused regressions cover:

- Strict data-only procedure imports and source-compatible assertions.
- Immutable versions and owner/instance isolation across restarts.
- Required checklist items, notes and recorded-result semantics.
- Active maintenance reservations across operators and native-equivalent target aliases.
- Serialized command execution on a canonical target, including separate reviewed commands.
- Status reads/reconciliation concurrent with a real in-flight dispatch.
- Lost response recovery without mutation replay; current process generation checks.
- Revoked native privileges on stored reports and command evidence.
- Descriptor-bounded journal reads and projected command summaries.
- Incomplete comparison data, identity-aligned arrays and collision-free field paths.
- Task schedules, unknown history status and native wall-time limitations.
- Capacity counter resets, missing intervals, scope changes and threshold streaks.
- Literal log filters, context, tail overlap and rotation/truncation ambiguity.
- Current-account desk visibility, restoration obligations and follow-up deadlines.
- Exact endpoint privilege groups for Wallet, Manage, OAuth2_Client, Secure and Task/Operate, including authorization to stored readback evidence after revocation.
- Ordered configuration arrays versus identity-aligned native inventories, with process generations kept distinct.
- The native messages-log timestamp/PID prefix, including millisecond fields, without interpreting undocumented numeric severity values.

## Native integration

The following commands passed against the existing development IRIS instance on port 52790 and gateway on port 3300, using scoped temporary fixture objects:

```sh
npm run test:install
npm run test:live
npm run test:workflows
npm run test:authorization
```

`test:install` checks the installed gateway, authentication and read endpoints; it does not execute an installer or reset an instance. Smoke/workflow checks exercised native inventory, configuration create/edit/read/delete, wallet metadata, task suspension/resumption/run, OAuth and asynchronous audit. Temporary fixture cleanup completed.

The authorization harness uses the public reviewed-command API for administrative setup and teardown. A limited operator receives 403 from a forbidden command review and 409 from an attempted raw write. Removing native database read access preserves a 403 response. Revoked operating permissions block stored reports and direct extension access in the existing session. Temporary account and role cleanup completed.

Independent integration checks in the parent workspace additionally exercised immutable procedure execution, assertions, checklist validation, notes, handover, relogin, archive and resource command readback/replay guards. Application readiness was evaluated with native application, namespace and resource observations. Those parent reports are separate artifacts, not files required by this repository.

## Browser review

Independent browser checks loaded real application configuration and its namespace/resource dependencies on desktop and mobile, real task configuration/state/history, a 200-line native messages-log capture, and the Operations desk. Two capacity readings displayed actual memory, disk and CPU counter-delta observations. Review identified and corrected nested main landmarks, zero-duration labels at native second precision, scoped panel spacing and a capacity-table overflow on a narrow viewport. The final mobile capacity, log and Operations desk checks confirmed document scroll width equal to client width (375 px); tables scroll locally. The log view showed native millisecond timestamps and recognized process IDs. The Operations desk contained one main landmark, readable panel spacing and actual recorded follow-ups.

Screenshots in `docs/images` include `application-readiness-desktop.png`, `application-readiness-mobile.png`, `capacity-watch-mobile.png`, `log-investigation-mobile.png` and `operations-desk-desktop.png`/`operations-desk-mobile.png`. They show the tested existing instance rather than substituted fixture UI data.

## Operational limits

The filesystem journal supports one gateway process per directory. Native changes made outside Waypoint are not locked by its command serialization. Process readback identifies a process generation, and reconciliation reports current state without claiming which actor caused it.

Capacity samples and log bookmarks are page-memory investigations with explicit export. Persisted procedures collect fresh evidence into durable runs. A handover package records information and owner-declared delivery; it does not send messages or transfer execution authority.

These checks establish the tested behavior on this instance. They do not claim that every deployment, native version or future change is defect-free. Preserve the configured instance identity and existing volume during upgrades, and use `compose.existing.yaml` when connecting a gateway to an existing IRIS server.
