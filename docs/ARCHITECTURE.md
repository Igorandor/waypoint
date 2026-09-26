# Waypoint execution architecture

Waypoint separates durable runbooks from one-shot administrative commands.

The runbook engine and store own plans, original state, per-target locks, checkpoints, uncertain outcomes and account-scoped atomic reports. `run-routes.ts` revalidates the native identity and operating privilege before every report request. Cached login identity is not sufficient authorization. See [RUNBOOKS.md](RUNBOOKS.md).

The command station selects a native target, prepares a typed command, shows the target and before/proposed fields, executes once and displays a receipt. Only included update fields are sent. A pre-write read checks those fields for concurrent changes; deletion compares the inspected record. These reads reduce lost updates but do not lock external IRIS writers. Destructive and execution controls require the exact target identifier. A failed request returns to preparation rather than automatically retrying.

`shared/commands.ts` describes target identities and scope requirements. `CommandFields` edits typed nested objects and arrays without requiring JSON entry. `command-draft.ts` contains defaults and field conflict logic. New tasks have complete on-demand records; existing task updates remain partial. Task execution information comes from the separate native info endpoint.

`operator-sessions.ts` manages finite-lifetime operator sessions and a per-address login budget. `command-policy.ts` is an exact operation and query allowlist. `native-response.ts` bounds and validates incoming documents. `upstream.ts` acquires a concurrency slot, sends one native request, checks native status, handles documented wire differences and emits redacted diagnostics. The adapter never follows a native redirect or accepts a caller-provided destination.

All observations retain a source and capture time. CPU counters are cumulative; memory/disk capacity is shown only for valid observations. A stopped native monitor is identified as stale. No background process changes native state.

The independent ObjectScript/Embedded Python extension serves host observations and bounded messages/alerts windows. Its application uses password authentication and the operator's native privileges. Installation failures terminate the installation session with a failure status.

The pinned API JSON and security/native probes retain their origin; the application foundation is independently implemented. See [PROVENANCE.md](PROVENANCE.md).
