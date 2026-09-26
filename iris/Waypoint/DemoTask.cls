/// Safe integration-test task. Writes a timestamp only to the Waypoint demo global.
Class Waypoint.DemoTask Extends %SYS.Task.Definition
{
/// Test-only worker. Never started by the portal automatically.
ClassMethod Worker()
{
    Set ^WaypointDemo("workerPid")=$JOB
    Hang 120
}
Parameter TaskName = "Waypoint demonstration task";
Method OnTask() As %Status
{
    Set ^WaypointDemo("lastRun")=$ZDATETIME($HOROLOG,3)
    Quit $$$OK
}
}
