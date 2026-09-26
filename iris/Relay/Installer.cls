Class Relay.Installer Extends %RegisteredObject
{
ClassMethod Install() As %Status
{
    New $Namespace
    Set $Namespace = "%SYS"
    Set props("DispatchClass")="Relay.Rest",props("NameSpace")="%SYS"
    Set props("AutheEnabled")=32,props("Enabled")=1,props("Resource")="%Admin_Operate"
    If ##class(Security.Applications).Exists("/api/relay") {
        Quit ##class(Security.Applications).Modify("/api/relay",.props)
    }
    Quit ##class(Security.Applications).Create("/api/relay",.props)
}
}
