Class Waypoint.Installer Extends %RegisteredObject
{
/// Password authentication under the caller's own native operating privileges.
ClassMethod Install() As %Status
{
    New $Namespace
    Set $Namespace="%SYS"
    Set endpoint="/api/waypoint"
    Set config("Enabled")=1
    Set config("AutheEnabled")=32
    Set config("Resource")="%Admin_Operate"
    Set config("NameSpace")="%SYS"
    Set config("DispatchClass")="Waypoint.Rest"
    Set present=##class(Security.Applications).Exists(endpoint)
    If present Return ##class(Security.Applications).Modify(endpoint,.config)
    Return ##class(Security.Applications).Create(endpoint,.config)
}

}
