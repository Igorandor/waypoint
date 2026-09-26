Class Waypoint.Rest Extends %CSP.REST
{
Parameter UseSession = 0;
Parameter CHARSET = "utf-8";
XData UrlMap
{
<Routes>
<Route Url="/telemetry" Method="GET" Call="ObserveHost"/>
<Route Url="/logs" Method="GET" Call="ObserveLog"/>
</Routes>
}
ClassMethod OnPreDispatch(pUrl As %String, pMethod As %String, ByRef pContinue As %Boolean) As %Status
{
    Set %response.ContentType="application/json"
    Set pContinue=$SYSTEM.Security.Check("%Admin_Operate","USE")
    If 'pContinue {
        Set %response.Status="403 Forbidden"
        Write {"error":"Operating privilege is required."}.%ToJSON()
    }
    Return $$$OK
}
ClassMethod ObserveHost() As %Status
{
    Write ##class(Waypoint.Telemetry).Read()
    Return $$$OK
}
ClassMethod ObserveLog() As %Status
{
    Set kind=$Get(%request.Data("source",1),"messages")
    If (kind="messages")!(kind="alerts") {
        Write ##class(Waypoint.Telemetry).Logs(kind,+$Get(%request.Data("limit",1),200))
    } Else {
        Set %response.Status="400 Bad Request"
        Write {"error":"Unsupported log observation."}.%ToJSON()
    }
    Return $$$OK
}
}
