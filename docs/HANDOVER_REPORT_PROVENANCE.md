# Observation provenance in HTML handovers

A procedure can give an observation any title. Previously, the standalone HTML report printed that title and its evidence without the structured observation source or target. For example, “Check scheduling” followed by `{"Suspended":false}` did not identify which task had been read.

Observation steps now include Source and Target in their existing metadata list. Source uses the current observation-source label together with its stored identifier; Target uses the stored target, or “No specific target” for an observation without one. Both are HTML-escaped. An unrecognized stored source is printed as escaped text rather than being assigned an invented meaning. Legacy steps and other procedure step kinds retain their existing output. Recorded timestamps are unchanged.

`tests/handover-report.test.ts` exercises the actual HTML generator: a custom title with `task-state` and task `7241`, hostile source/target text, an instance-wide observation, and unchanged legacy/assertion metadata. Before the fix, three tests failed because provenance was absent; the legacy test passed. The root research artifact `research/waypoint-report-provenance.html` is a synthetic report generated for separate desktop/mobile inspection. It does not represent a live IRIS observation.

Validation on 2026-09-27: `npm run check` passed (TypeScript, production build and 185 tests, including four new report regressions). The implementation task started no HTTP fixture, native operation or service/container rebuild. Browser inspection is recorded separately; these generator tests do not establish responsive layout by themselves.

Integration browser check on 27 September 2026: the actual generated synthetic report was inspected at desktop 1280×900 and phone 390×844. Source, target and recorded time were visible and readable; mobile client/scroll width was 375/375. Evidence outside the submission: research/waypoint-report-provenance-desktop.png and research/waypoint-report-provenance-mobile.png. The bounded preview had no native connection or write route and was stopped after inspection.
