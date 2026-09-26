# Waypoint commands and evidence

The command station has three stages: select a target, prepare a command, and review before executing it once. A successful response produces a receipt. Existing runbooks keep their separate step inspector and durable evidence.

Targets are loaded with the gateway's default limit of 250 rows. Search works on that loaded subset. Wallet entries and OAuth clients require a scope. Task/process identities and their descriptive names remain visible. Process suspend/terminate controls respect the native capability flags; IRIS still decides authorization when a command executes.

Command fields use typed inputs, booleans, enums, nested objects and repeatable arrays. Choose Add a field to include a value in an update; Omit removes it from the command. Existing safe values initialize selected fields. Review shows the chosen target and before/proposed values, masking credential fields. A pre-write read detects changes to touched fields. New tasks include a complete on-demand native record.

Observation results are labelled by source and collection time. Arrays become searchable evidence cards with at most 250 visible rows. Selecting one opens a property list. Nested sections expand on demand; each level shows at most 100 entries and stops after six nested levels. Export contains the whole loaded, redacted result, not all records on the instance. Forms are limited to eight levels and 200 entries per array.

Host observations show valid memory/disk capacity and CPU load/counters. They do not claim that host metrics are container limits or cumulative ticks are an instantaneous utilization percentage. Native monitor data is labelled stale if its monitor is stopped.

Messages, alerts, audit results, task history, journals and ephemeral session receipts are available under Logs. Audit retrieval uses native asynchronous polling. Runbook history remains in Waypoint's own volume and is scoped to the native account.
