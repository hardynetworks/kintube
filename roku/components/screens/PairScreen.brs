sub init()
    m.top.findNode("title").font = makeFont("c700", 72)
    m.top.findNode("step1").font = makeFont("500", 32)
    m.top.findNode("step2").font = makeFont("500", 32)
    m.top.findNode("scan").font = makeFont("600", 30)
    m.top.findNode("or2").font = makeFont("500", 28)
    m.url = m.top.findNode("url")
    m.url.font = makeFont("700", 50)
    m.qr = m.top.findNode("qr")
    m.qr.observeField("loadStatus", "onQrLoaded")
    m.qrSpinner = m.top.findNode("qrSpinner")
    m.qrSpinner.poster.uri = "pkg:/images/spinner.png"
    m.qrSpinner.poster.width = 96
    m.qrSpinner.poster.height = 96
    m.qrSpinner.control = "start"
    m.status = m.top.findNode("status")
    m.status.font = makeFont("500", 30)
    m.footer = m.top.findNode("footer")
    m.footer.font = makeFont("400", 26)
    m.footer.text = "Server: " + displayServer(m.global.server) + "     Press * to change it"
    m.codeGroup = m.top.findNode("code")
    m.poll = m.top.findNode("poll")
    m.poll.observeField("fire", "poll")
    requestCode()
end sub

sub takeFocus(_unused as dynamic)
    m.top.setFocus(true)
end sub

sub onClosing()
    m.poll.control = "stop"
end sub

sub requestCode()
    m.poll.control = "stop"
    m.status.text = ""
    di = CreateObject("roDeviceInfo")
    name = di.GetFriendlyName()
    if name = invalid or name = "" then name = di.GetModelDisplayName()
    apiCall("POST", "/api/tv/pair", { name: name }, "onCode")
end sub

sub onCode(event as object)
    r = apiResult(event)
    if not r.ok then
        m.qrSpinner.visible = false
        m.qr.uri = ""
        m.url.text = displayServer(m.global.server) + "/tv"
        m.status.text = r.error + "   Press OK to try again."
        m.failed = true
        return
    end if
    m.failed = false
    m.pollToken = r.data.pollToken
    m.url.text = r.data.verifyUrlShort
    m.qrSpinner.visible = true
    if r.data.qrUrl <> invalid then setImage(m.qr, r.data.qrUrl)
    showCode(r.data.code)
    m.status.text = "Waiting for you to enter the code…"
    m.poll.duration = r.data.interval
    m.poll.control = "start"
end sub

sub onQrLoaded()
    if m.qr.loadStatus <> "loading" then m.qrSpinner.visible = false
end sub

' The code as big tiles: ABCD-EFGH.
sub showCode(code as string)
    m.codeGroup.removeChildrenIndex(m.codeGroup.getChildCount(), 0)
    tileW = 92
    gap = 12
    dash = 40
    x = 0
    for i = 1 to Len(code)
        ch = Mid(code, i, 1)
        if ch = "-" then
            d = CreateObject("roSGNode", "Rectangle")
            d.width = 28
            d.height = 8
            d.color = "0x777777FF"
            d.translation = [x + gap + (dash - 28) / 2, 62]
            m.codeGroup.appendChild(d)
            x = x + dash + 2 * gap
        else
            tile = CreateObject("roSGNode", "Poster")
            tile.uri = "pkg:/images/tile.9.png"
            tile.width = tileW
            tile.height = 124
            tile.translation = [x, 0]
            m.codeGroup.appendChild(tile)
            l = CreateObject("roSGNode", "Label")
            l.text = ch
            l.font = makeFont("700", 76)
            l.width = tileW
            l.height = 124
            l.horizAlign = "center"
            l.vertAlign = "center"
            l.color = "0xF1F1F1FF"
            l.translation = [x, 0]
            m.codeGroup.appendChild(l)
            x = x + tileW + gap
        end if
    end for
end sub

sub poll()
    if m.polling = true then return
    m.polling = true
    apiCall("POST", "/api/tv/pair/poll", { pollToken: m.pollToken }, "onPoll")
end sub

sub onPoll(event as object)
    m.polling = false
    r = apiResult(event)
    if m.top.closing then return
    if r.status = 200 and r.data.token <> invalid then
        m.poll.control = "stop"
        m.status.text = "Signed in"
        m.top.action = { type: "signedIn", token: r.data.token, deviceId: r.data.deviceId, user: r.data.user }
    else if r.status = 410 then
        ' The code expired: get a fresh one.
        requestCode()
    end if
    ' 202 (waiting) or a network blip: keep polling.
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "options" then
        m.poll.control = "stop"
        m.top.action = { type: "changeServer" }
        return true
    end if
    if key = "OK" and m.failed = true then
        m.qrSpinner.visible = true
        requestCode()
        return true
    end if
    return false
end function
