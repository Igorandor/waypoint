# Waypoint implementation history

Waypoint's product is a durable operations workflow: original-state capture, guarded transitions, operator checkpoints, restoration and recovery of uncertain writes. The model, execution engine, atomic report store and runbook UI were implemented for Waypoint.

The initial general administration layer came from Harbor's custom code, not a supplied contest application template. That layer has now been removed from the current source. Waypoint uses a command station built around target selection, preparation, review, one execution and a receipt. `src/commands` owns this workflow and typed command fields. `server/operator-sessions.ts`, `command-policy.ts`, `native-response.ts` and the native command adapter implement its separate request path. Its application entry, data presentation, schema utilities, redaction, activity retention and IRIS extension were rewritten as part of the separation.

Waypoint has its own repository, dependency lockfile, builds, installer, CI and Compose stack. Its run reports belong to the Waypoint data volume. It requires neither Harbor nor Atlas.

## Retained references and validation

The API JSON originates from InterSystems; endpoint names and native task fields therefore agree with other clients. Npm packages, conventional build bootstrap and small test fixtures are not unique inventions. Existing security regression suites and disposable native API probes retain their earlier provenance and exercise the new code. `shared/catalog.ts` is now only a compatibility surface for those probes; runtime target selection uses `shared/commands.ts`.

The license retains the Harbor notice for this support material and past revisions. Git history has not been rewritten to conceal the earlier foundation. A current-file comparison found no identical production TypeScript files between the three repositories, but exact equality alone cannot establish originality. Contest acceptance remains the organizer's decision.

## Rename from Relay

The earlier working name was Relay. The user selected Waypoint after an unrelated public entry named IRIS Relay was found. The rename does not claim or copy that other project. Historical commits and reports retain their original names. On an existing installation keep IRIS_INSTANCE_ID and the report volume stable; these identify the owner/instance partition. The prepared local .env preserves the old Compose project/volume and instance identifier, while fresh installs use Waypoint names. Existing authenticated /api/relay classes may remain in persisted IRIS storage; current code calls /api/waypoint and protects both management paths from maintenance windows.
