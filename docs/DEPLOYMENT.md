# Deployment and security

## Trust boundaries

The portal is an administrative client. It forwards the signed-in operator's identity to a **fixed, administrator-configured IRIS server**. It cannot elevate that operator beyond IRIS permissions. Do not make a shared privileged account available to ordinary users.

- Passwords are kept in process memory for the session, never put into browser storage or logs by the gateway.
- Sessions use 256-bit random opaque identifiers in HttpOnly, SameSite=Strict cookies; 30-minute idle and 8-hour absolute expiry.
- Browser writes require a CSRF token and the configured `PUBLIC_ORIGIN`.
- Requests are limited to paths and parameters in the pinned API contract. Only an explicit list of administrative writes is allowed.
- Secret retrieval endpoints are blocked. Credential-bearing response fields are masked recursively. The wallet only exposes names and types.
- Request bodies are limited to 256 KB; list reads default to 250 rows and cap `maxRows` at 1,000. Upstream requests time out after 20 seconds; writes are never automatically retried.
- In-memory login throttling limits all sign-in attempts (successful and failed) to ten per minute per address. A restart clears sessions and throttling state.
- Portal activity is a bounded, session-local convenience history, not an immutable or durable security audit. Use the native IRIS audit subsystem for authoritative retention.
- Operational log text can contain application data. Pattern masking is best effort; do not assume arbitrary log messages are anonymized.

## Existing installations

Use HTTPS between the browser and gateway and between the gateway and a remote IRIS instance. Set `COOKIE_SECURE=true` and an exact HTTPS `PUBLIC_ORIGIN`. TLS certificate verification remains enabled; there is no insecure-TLS switch.

Bind the server on a private interface or place it behind a trusted reverse proxy. Do not expose the included development credentials or IRIS development container. The example does not configure proxy trust; if your deployment terminates HTTPS at a proxy, pass `COOKIE_SECURE=true` explicitly and configure the public origin.

Credentials remain in memory because HTTP Basic authentication is used against IRIS. Restarting the gateway signs everyone out and expires prepared command bodies. Run one gateway process per data directory: target locks and review bodies are process-owned, so sticky sessions do not make concurrent replicas safe.

`compose.existing.yaml` runs only the gateway and its persistent record volume. Supply `IRIS_URL`, `IRIS_INSTANCE_ID` and an HTTPS `PUBLIC_ORIGIN`; it fixes secure cookies on and publishes the gateway to loopback. Configure your TLS reverse proxy to forward to that listener. The application validates that the upstream is a server origin without credentials, paths, queries or fragments. It rejects public HTTP origins and contradictory cookie settings at startup. A reverse proxy does not need trusted forwarded headers for this configuration.

Preserve `IRIS_INSTANCE_ID` when replacing a gateway for the same IRIS instance: it partitions account records. Changing it intentionally creates a separate record scope and does not migrate or release old maintenance obligations. Preserve the entire data directory, including run files, `procedures` and `commands` subdirectories, during backup and recovery. Existing installations must run only `Waypoint.Installer.Install()` after loading the extension classes; `iris/configure.script` is a development-image provisioner which resets account passwords.

## Extension

`Waypoint.Rest` requires `%Admin_Operate:USE`, `%DB_IRISSYS:R` for its bundled `%SYS` namespace, and password authentication. These permissions are assigned by an administrator, not by the installer. It does not grant application roles. Embedded Python reads `/proc` on Linux and disk usage for the IRIS manager directory. In a container, host CPU and memory numbers may describe the container host, not cgroup quotas; the UI labels this scope.

Log reads use a fixed allowlist (`messages.log`, `alerts.log`), a maximum 1 MB tail and a maximum 500 lines. No caller-supplied filesystem paths, shell commands or arbitrary SQL are accepted. Missing log files return an explicit empty-source notice. Non-Linux environments retain native API functionality and disk telemetry; Linux-specific metrics are described as unavailable.

## Operations

Waypoint's run journal is separate from the in-memory session/activity history. Set a unique `IRIS_INSTANCE_ID` and a writable `WAYPOINT_DATA_DIR`; the Docker stack provides a persistent `waypoint-runs` volume owned by the non-root Node user. Run exactly one gateway process per journal directory. Sticky sessions alone do not make the file store safe for shared replicas. See [runbook storage and recovery](RUNBOOKS.md) for bounds, archival and interrupted-operation handling.

Back up the IRIS data volume with an IRIS-supported backup procedure. Replacing the portal container does not change IRIS records. Replacing the IRIS image may require a supported IRIS upgrade path; pin and test upgrades. `docker compose down` keeps the volume. Removing the volume destroys that instance's data.

Run reports, command records and procedure definitions recheck native account identity on access. Reports require current Operate privilege; reports containing application configuration also require Secure. Command history checks the exact native endpoint/method privilege group from the pinned contract and, where evidence was read, its read endpoint too. Wallet uses Wallet, device configuration uses Manage, OAuth client definitions use OAuth2_Client, and ordinary security configuration uses Secure. Task run requests require Task; suspend/resume reviews additionally require Operate to read native task-info state. Revoked access does not leave a cached report readable through export.

Command reviews store redacted proposed fields and native evidence, while the original body remains in memory for ten minutes. A restart cannot replay it. Journal dispatch is saved before the write; interrupted dispatch becomes uncertain. Named targets are serialized during revalidation, dispatch and readback. Active maintenance runs reserve application/task targets across accounts and restarts until restoration obligations are closed. These gateway safeguards do not lock out independent native IRIS administrators.

`GET /api/health` reports gateway process availability, not successful IRIS authentication. The UI's refresh timestamps and individual API errors describe upstream availability. Use an authenticated external health probe if you need end-to-end monitoring.

## Diagnostic and history bounds

Known authentication echoes are masked in normal and asynchronous diagnostics. Masking is a single literal pass; canonical identifiers remain unchanged. Credential-bearing submissions allow at most 128 values and 32,768 combined characters. Requests exceeding those limits are rejected before forwarding. Session history keeps a console preview of at most 100 lines plus a truncation notice and 16 KiB of serialized UTF-8 console data per entry; the directly requested native response retains its separate response limit. See [the focused security review](SECURITY_REVIEW.md).
