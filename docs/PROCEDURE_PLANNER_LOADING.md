# Guided procedure inventory loading

Reviewed September 27, 2026.

Switching away from an unfinished application/task inventory read could leave **Preview steps** disabled in Capacity readiness or Operator handover observations. The earlier effect's cleanup correctly stopped its late response from modifying the new workflow, but the non-inventory effect returned without resetting loading. The button could therefore remain disabled even after the old request completed.

The non-inventory branch now explicitly clears loading. Target/error resets and request-ownership guards remain unchanged. Application→task still waits for the current task inventory; a late application response cannot replace its targets or end its loading state. Preview and opening the editor remain explicit operator actions, with no automatic save.

`tests/procedure-planner.test.ts` compiles and executes the actual component with controlled state/effect scheduling and deferred inventory promises. Before the fix, application→capacity and task→handover assertions failed because Preview steps stayed disabled; application→task ownership already passed. After the fix, three tests cover immediate preview availability, late success/error preservation, current-source inventory ownership and no creation before an explicit editor action.

This test harness models effect dependency cleanup and state transitions; it is not a browser DOM or real React-rendering proof. Root's actual-dist fixture review is separate. No native operations, application writes, existing data or external dependency additions are needed for the regressions.

Full `npm run check` on September 27, 2026 passed frontend/server builds and **234 tests**, exit 0.

Final browser verification used the production bundle at localhost3455, with only held synthetic inventory reads. Desktop1280×900: application→capacity allowed Preview before the old reply; its late success left the preview intact. Phone390×844: task→handover allowed Preview, and the old task error did not appear in the current plan. An application→task control kept the task inventory disabled when only the application response arrived, then offered task7 after its own response. The preview identified target7. Four reads were released; no native calls, native writes or application mutations occurred. Screenshots and state/counters are in workspace research/waypoint-planner-*.png and waypoint-planner-browser-*.json. Page widths matched scroll widths; the long modal scrolled vertically. No procedure or run was saved.
