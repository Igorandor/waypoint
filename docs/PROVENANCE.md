# Project scope and shared foundation

Relay is a standalone operations portal centered on durable, step-by-step runbooks. Its domain includes state capture, checked transitions, operator checkpoints, explicit restoration, interruption recovery and exportable evidence.

The original MIT-licensed API gateway, administrative catalog/editors, telemetry extension and general administration screens share a foundation with the sibling Harbor project. Relay's runbook model, persistence and execution engine are separate modules in `shared/runbook.ts`, `server/run-store.ts`, `server/run-engine.ts` and `src/features/runbooks`.

No Harbor or Access Atlas checkout or service is required. Relay includes its own `Relay` native package, `/api/relay` application, Docker stack, tests and installation instructions. The common administration foundation is disclosed; the contest entry should be presented around its distinct operations workflow.

The presentation layer is separate: `src/layout/RelayShell.tsx` provides a compact tool rail and command bar. The run queue, runbook picker and step inspector organize work around an operation and its recorded results. Shared administration editors remain available through the tool rail.
