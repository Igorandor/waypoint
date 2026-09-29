Class Waypoint.PackageInstaller Extends %RegisteredObject
{
/// Refuse to take over an existing route owned by another class or namespace.
ClassMethod Validate() As %Status
{
    Set targetNamespace=$Namespace
    New $Namespace
    Set $Namespace="%SYS"
    If ##class(Security.Applications).Exists("/api/waypoint") {
        Set sc=##class(Security.Applications).Get("/api/waypoint",.properties)
        If $$$ISERR(sc) Quit sc
        If ($Get(properties("DispatchClass"))'="Waypoint.Rest")!($ZConvert($Get(properties("NameSpace")),"U")'=targetNamespace) Quit $$$ERROR($$$GeneralError,"The /api/waypoint route belongs to another application.")
    }
    Quit $$$OK
}
}
