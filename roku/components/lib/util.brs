' Helpers shared by the KinCast components.

' ---- Saved settings (registry) ----
function settingsRead(key as string, fallback = "" as string) as string
    sec = CreateObject("roRegistrySection", "kincast")
    if sec.Exists(key) then return sec.Read(key)
    return fallback
end function

sub settingsWrite(key as string, value as string)
    sec = CreateObject("roRegistrySection", "kincast")
    if value = "" then
        sec.Delete(key)
    else
        sec.Write(key, value)
    end if
    sec.Flush()
end sub

' ---- Server addresses ----

' "kincast.example.net" -> "https://kincast.example.net"
' Home-network addresses default to http: "192.168.1.20:8095", "nas:8095",
' "hardynas.local" -> "http://...". A typed scheme is kept.
function normalizeServer(input as string) as string
    s = LCase(input.Trim())
    if s = "" then return ""
    if Left(s, 7) <> "http://" and Left(s, 8) <> "https://" then
        host = s.Split("/")[0]
        hostOnly = host.Split(":")[0]
        isIp = CreateObject("roRegex", "^[0-9]{1,3}(\.[0-9]{1,3}){3}$", "").IsMatch(hostOnly)
        hasPort = InStr(1, host, ":") > 0
        isLocal = Right(hostOnly, 6) = ".local" or InStr(1, hostOnly, ".") = 0
        if isIp or hasPort or isLocal then
            s = "http://" + s
        else
            s = "https://" + s
        end if
    end if
    while Right(s, 1) = "/"
        s = Left(s, Len(s) - 1)
    end while
    if InStr(1, s, " ") > 0 then return ""
    return s
end function

' "/media/x/thumb.jpg" -> "https://server/media/x/thumb.jpg"; absolute URLs pass through.
function absUrl(path as dynamic) as string
    if path = invalid or path = "" then return ""
    if Left(path, 4) = "http" then return path
    return m.global.server + path
end function

' The address shown to people, without the scheme.
function displayServer(url as string) as string
    s = url
    if Left(s, 8) = "https://" then s = Mid(s, 9)
    if Left(s, 7) = "http://" then s = Mid(s, 8)
    return s
end function

' ---- Formatting ----

' 75 -> "1:15", 3725 -> "1:02:05"
function formatDuration(sec as dynamic) as string
    if sec = invalid then return ""
    total = Int(sec)
    if total < 0 then total = 0
    h = Int(total / 3600)
    mm = Int((total mod 3600) / 60)
    ss = total mod 60
    s2 = Right("0" + ss.ToStr(), 2)
    if h > 0 then return h.ToStr() + ":" + Right("0" + mm.ToStr(), 2) + ":" + s2
    return mm.ToStr() + ":" + s2
end function

function isoSeconds(iso as dynamic) as integer
    if iso = invalid or iso = "" then return 0
    dt = CreateObject("roDateTime")
    ' roDateTime wants "YYYY-MM-DDTHH:MM:SSZ" (no fractions).
    dt.FromISO8601String(Left(iso, 19) + "Z")
    return dt.AsSeconds()
end function

' "2026-10-26T01:00:00.000Z" -> "3 days ago"
function agoText(iso as dynamic) as string
    t = isoSeconds(iso)
    if t = 0 then return ""
    now = CreateObject("roDateTime")
    diff = now.AsSeconds() - t
    if diff < 60 then return "just now"
    units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]
    for each u in units
        n = Int(diff / u[1])
        if n >= 1 then
            if n = 1 then return "1 " + u[0] + " ago"
            return n.ToStr() + " " + u[0] + "s ago"
        end if
    end for
    return "just now"
end function

' "2019-07-04" -> "Jul 4, 2019"
function filmedText(d as dynamic) as string
    if d = invalid or Len(d) < 10 then return ""
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    mo = Val(Mid(d, 6, 2))
    if mo < 1 or mo > 12 then return ""
    return months[mo - 1] + " " + Val(Mid(d, 9, 2)).ToStr() + ", " + Left(d, 4)
end function

' 1 -> "1 view", 1200 -> "1.2K views". "watching" doesn't take an s.
function countText(n as dynamic, word as string) as string
    if n = invalid then n = 0
    if n >= 1000000 then
        s = (Int(n / 100000) / 10).ToStr() + "M"
    else if n >= 1000 then
        s = (Int(n / 100) / 10).ToStr() + "K"
    else
        s = n.ToStr()
    end if
    if n = 1 or word = "watching" then return s + " " + word
    return s + " " + word + "s"
end function

' Puts each label just below the one before it (for titles that wrap to 1-3 lines).
sub stackLabels(labels as object, startY as float, gap as float)
    y = startY
    for each l in labels
        l.translation = [l.translation[0], y]
        if l.text <> "" then y = y + l.localBoundingRect().height + gap
    end for
end sub

' "Cade Hardy" -> "CH"
function initials(name as dynamic) as string
    if name = invalid or name = "" then return "?"
    parts = name.Trim().Split(" ")
    s = ""
    for each p in parts
        if p <> "" and Len(s) < 2 then s = s + UCase(Left(p, 1))
    end for
    return s
end function

' "#22D3EE" -> "0x22D3EEFF" (SceneGraph colors)
function sgColor(hex as dynamic, fallback = "0x6366F1FF" as string) as string
    if hex = invalid or Len(hex) <> 7 or Left(hex, 1) <> "#" then return fallback
    return "0x" + UCase(Mid(hex, 2)) + "FF"
end function

' ---- Playback positions, so a video resumes where it was left ----
function bookmarkGet(id as string) as integer
    sec = CreateObject("roRegistrySection", "kincast-resume")
    if not sec.Exists(id) then return 0
    return Val(sec.Read(id))
end function

sub bookmarkSet(id as string, position as integer, duration as dynamic)
    sec = CreateObject("roRegistrySection", "kincast-resume")
    ' Near the start or the end there's nothing to resume.
    nearEnd = duration <> invalid and duration > 0 and position > duration - 20
    if position < 30 or nearEnd then
        sec.Delete(id)
    else
        sec.Write(id, position.ToStr())
        ' Keep the section small: forget the oldest when there are many.
        keys = sec.GetKeyList()
        if keys.Count() > 200 then sec.Delete(keys[0])
    end if
    sec.Flush()
end sub

' ---- Fonts and images ----

' Barlow, KinCast's typeface (fonts/). weight: "400", "500", "600", "700", or "c700" (condensed).
function makeFont(weight as string, size as integer) as object
    f = CreateObject("roSGNode", "Font")
    if weight = "c700" or weight = "c600" then
        f.uri = "pkg:/fonts/BarlowCondensed-" + Mid(weight, 2) + ".ttf"
    else
        f.uri = "pkg:/fonts/Barlow-" + weight + ".ttf"
    end if
    f.size = size
    return f
end function

' An HTTP agent that signs requests in as this TV. Posters and the video
' player need it: thumbnails and HLS are only served to signed-in family.
function authAgent() as object
    agent = CreateObject("roHttpAgent")
    agent.SetCertificatesFile("common:/certs/ca-bundle.crt")
    agent.InitClientCertificates()
    if m.global.token <> "" then agent.AddHeader("Authorization", "Bearer " + m.global.token)
    return agent
end function

' Sets a Poster's image, signed in.
sub setImage(poster as object, path as dynamic)
    url = absUrl(path)
    if url = "" then
        poster.uri = ""
        return
    end if
    if Left(url, 4) = "http" then poster.setHttpAgent(authAgent())
    poster.uri = url
end sub

' Closes a standard dialog and gives the focus back.
sub closeDialog(d as object, focusTo as object)
    if d <> invalid then d.close = true
    scene = m.top.getScene()
    if scene <> invalid and scene.dialog <> invalid then scene.dialog = invalid
    if focusTo <> invalid then focusTo.setFocus(true)
end sub
