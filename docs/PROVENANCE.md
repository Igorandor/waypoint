# Source references

The SysAdmin API specification and generated request projection come from InterSystems. Runtime target selection uses `shared/commands.ts`; `shared/catalog.ts` supports native integration and regression probes. API behavior and verified adaptations are recorded in [VERIFICATION.md](VERIFICATION.md).

Third-party packages, icons and API references are attributed in [THIRD_PARTY.md](../THIRD_PARTY.md). Copyright notices for retained test and support material remain in [LICENSE](../LICENSE).

## Existing installations

Keep `IRIS_INSTANCE_ID` and the report volume stable during upgrades: together with the account, they identify stored run ownership. Earlier installations may use the `Relay` name in their Compose project, volume or native classes. Current code calls `/api/waypoint` and protects both `/api/waypoint` and the legacy `/api/relay` path from maintenance windows. See [deployment](DEPLOYMENT.md) before changing an existing installation.
