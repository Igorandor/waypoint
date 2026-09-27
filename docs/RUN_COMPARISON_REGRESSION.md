# Changing the recorded comparison pair

The Before and After selectors previously changed the selected IDs without clearing the displayed comparison. After a successful comparison, selecting a different run therefore left the previous differences and JSON export available beneath a different pair. Changing either selection now clears both the result and any error belonging to the previous pair. Comparing remains an explicit action. Selectors remain disabled while a request is pending.

## Repeatable browser regression

Use three disposable recorded observations, named Alpha, Bravo and Charlie below. The root research fixture `research/waypoint-comparison-fixture.cjs` serves the actual Waypoint build at loopback port 3409 with these synthetic observations. It has no native transport and applies no writes. `GET /_test/state` reports the comparison count and requested pairs. It is not part of deployment.

1. Open Runs, then Compare runs. Compare Alpha with Bravo. Confirm the result names that pair and shows an export button; the request count increases once.
2. Change **After** to Charlie. Confirm the previous source, totals and export button disappear immediately. The request count must not change. Click Compare runs and confirm the result now names Alpha and Charlie and the count increases once.
3. Change **Before** to Bravo. Confirm the result and export disappear again without a request. Explicitly compare and confirm Bravo versus Charlie.
4. Clear either selector, or select the same run on both sides. Confirm no old result/export remains and Compare runs is disabled.
5. Set fixture control to `{"compareStatus":403}` through `POST /_test/control`, compare a valid pair, and confirm an error. Change either selection: that old error must clear without another request. Set the control back to 200 and explicitly compare to recover.
6. Repeat the selection changes at a narrow viewport and check that both selectors and the action remain usable.

The repository currently provides Node and server-rendering tests, without an interactive DOM test harness. This regression needs a real browser interaction with the real component; a source-pattern assertion would not establish the behavior. Record browser execution results separately from build/unit-test results. No browser or native pass is claimed by this document alone.

Validation on 2026-09-27: `npm run check` passed (TypeScript, production build and 172 Node tests). `node --check` passed for the isolated fixture. These existing automated tests do not exercise this selector interaction; the browser scenario above is the targeted regression check. No gateway, IRIS or fixture server was started by the implementation task.

Integration browser verification passed with the production bundle on desktop and a 390×844 viewport (375 CSS pixels client/scroll). Alpha→Bravo produced one request; changing Before to Charlie removed the result/export without a request. Explicit Charlie→Bravo produced the second request; changing After to Alpha removed that result/export. Empty and identical selections disabled Compare. The third explicit comparison returned a controlled500; changing Before cleared that error without a fourth request. Fixture state recorded three comparisons, zero native calls and zero applied writes. Evidence is retained in the parent workspace's `research/waypoint-comparison-browser.json` and `waypoint-comparison-pair-*.png`. The integration reviewer rebuilt only the existing gateway afterward.
