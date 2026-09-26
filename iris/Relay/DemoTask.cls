/// Safe integration-test task. Writes a timestamp only to the Relay demo global.
Class Relay.DemoTask Extends %SYS.Task.Definition
{
/// Test-only worker. Never started by the portal automatically.
ClassMethod Worker()
{
    Set ^RelayDemo("workerPid")=$JOB
    Hang 120
}
Parameter TaskName = "Relay demonstration task";
Method OnTask() As %Status
{
    Set ^RelayDemo("lastRun")=$ZDATETIME($HOROLOG,3)
    Quit $$$OK
}
}
