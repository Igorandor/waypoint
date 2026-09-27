# Handover deadlines

Reviewed September 27, 2026.

The handover editor labels its date/time field **Due (UTC)**. It stores an ISO UTC timestamp, reopens that same UTC minute and retains the timestamp in JSON and printable exports. A cleared date is optional and prints as “Not set”. Completion is recorded separately; completed actions do not contribute to outstanding deadlines. This remains a simple UTC editor, without automatic local-time conversion.

The API accepts valid UTC timestamps with or without fractional seconds. The run summary previously sorted those strings lexicographically: `12:00:00.500Z` sorted before the earlier `12:00:00Z`. This could make the operations desk briefly miss an overdue follow-up. The summary now compares parsed timestamps, while retaining original stored values. The ordinary UI's canonical minute-based timestamps were not affected; neither the UI nor the accepted schema changed.

`tests/handover-deadlines.test.ts` saves a handover through the actual RunEngine in a new temporary RunStore, reads it back and evaluates the summary and operations desk between two mixed-precision deadlines. It checks the correct earliest/open action, overdue state, exclusion of completed/undated deadlines and preservation of stored timestamps. The synthetic native client fails if contacted. No existing records or native operation are involved.

A separate bounded audit executed the actual RunRecordTools callbacks with controlled hook state in Europe/Warsaw and America/New_York, then saved/read/exported the record. UTC roundtrips and blank dates passed. Malformed, impossible-calendar, unqualified local and offset timestamps were rejected by the existing schema without changing the record. Those audit observations are not extra repository tests or browser/DOM verification.

Full `npm run check` passed frontend/server builds and **227 tests** on September 27, 2026.
