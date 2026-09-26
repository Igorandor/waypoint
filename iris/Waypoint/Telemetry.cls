Class Waypoint.Telemetry Extends %RegisteredObject
{
/// A single host observation for a runbook receipt. No child process is launched.
ClassMethod Read() As %String [ Language = python ]
{
    import json
    import os
    import platform
    import shutil
    import time
    import iris
    from pathlib import Path

    sample = {"scope": "Operating system visible to IRIS; container limits may differ",
              "platform": platform.system(), "sampledAt": time.time()}
    if sample["platform"] == "Linux":
        values = {}
        with open("/proc/meminfo", encoding="ascii") as source:
            for entry in source:
                name, _, remaining = entry.partition(":")
                if name in ("MemTotal", "MemAvailable"):
                    values[name] = int(remaining.split()[0]) * 1024
        sample["memory"] = {"total": values.get("MemTotal"), "available": values.get("MemAvailable")}
        with open("/proc/stat", encoding="ascii") as source:
            counters = list(map(int, source.readline().split()[1:9]))
        sample["cpu"] = {"totalTicks": sum(counters), "idleTicks": sum(counters[3:5]),
                         "logicalCount": os.cpu_count(), "loadAverage": os.getloadavg()}
        with open("/proc/uptime", encoding="ascii") as source:
            sample["uptimeSeconds"] = float(source.readline().split()[0])
    else:
        sample["notice"] = "CPU and memory observations require Linux."
    manager = str(iris.system.Util.ManagerDirectory())
    capacity = shutil.disk_usage(manager)
    sample["disk"] = dict(zip(("total", "used", "free"), capacity))
    sample["disk"]["path"] = manager
    return json.dumps(sample)
}

/// Read the final bounded window before splitting; even a single huge line stays bounded.
ClassMethod Logs(source As %String = "messages", limit As %Integer = 200) As %String [ Language = python ]
{
    import iris
    import json
    import re
    from pathlib import Path
    filename = {"messages": "messages.log", "alerts": "alerts.log"}.get(source)
    if filename is None:
        raise ValueError("Unsupported log observation")
    path = Path(str(iris.system.Util.ManagerDirectory())) / filename
    try:
        with path.open("rb") as stream:
            stream.seek(0, 2)
            length = stream.tell()
            window = min(length, 1024 * 1024)
            stream.seek(-window, 2)
            tail = stream.read(window)
    except FileNotFoundError:
        return json.dumps({"source": source, "lines": [], "notice": "No log file has been created."})
    if length > window:
        separator = tail.find(b"\n")
        tail = tail[separator + 1:] if separator >= 0 else b""
    count = max(1, min(500, int(limit)))
    lines = tail.decode("utf-8", errors="replace").splitlines()[-count:]
    mask = re.compile(r"(?i)(password|secret|token)([=: ]+)([^\s]+)")
    return json.dumps({"source": source, "bytes": length, "bounded": True,
                      "lines": [mask.sub(lambda match: match[1] + match[2] + "[redacted]", line) for line in lines]})
}
}
