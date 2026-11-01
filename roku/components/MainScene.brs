sub init()
    m.top.backgroundColor = "0x0F0F0FFF"
    m.top.backgroundUri = ""
    m.screens = m.top.findNode("screens")
    m.starting = m.top.findNode("starting")
    spinner = m.top.findNode("spinner")
    spinner.poster.uri = "pkg:/images/spinner.png"
    spinner.poster.width = 96
    spinner.poster.height = 96
    spinner.control = "start"
    m.stack = []

    m.global.observeField("authLost", "onAuthLost")

    start()
end sub

' Where to begin: the server address, signing in, or (checked) home.
sub start()
    server = settingsRead("server")
    token = settingsRead("token")
    if server = "" then
        showSetup("")
    else if token = "" then
        m.global.server = server
        showPair()
    else
        m.global.server = server
        m.global.token = token
        m.global.deviceId = settingsRead("deviceId")
        apiCall("GET", "/api/auth/me", invalid, "onMe")
    end if
end sub

sub onMe(event as object)
    r = apiResult(event)
    if r.ok and r.data.user <> invalid then
        signedIn(r.data.user)
    else if r.status = 401 or (r.ok and r.data.user = invalid) then
        forgetSignIn()
        showPair()
    else
        ' Couldn't reach the server: let them fix the address or try again.
        showSetup(r.error)
    end if
end sub

sub signedIn(user as object)
    m.global.user = user
    if user.familyName <> invalid then m.global.familyName = user.familyName
    home = CreateObject("roSGNode", "HomeScreen")
    replaceAll(home)
end sub

sub forgetSignIn()
    settingsWrite("token", "")
    settingsWrite("deviceId", "")
    m.global.token = ""
    m.global.deviceId = ""
    m.global.user = {}
end sub

sub showSetup(errorText as string)
    s = CreateObject("roSGNode", "SetupScreen")
    s.address = displayServer(m.global.server)
    s.error = errorText
    replaceAll(s)
end sub

sub showPair()
    replaceAll(CreateObject("roSGNode", "PairScreen"))
end sub

' The website removed this TV, or its account is gone.
sub onAuthLost()
    if not m.global.authLost then return
    m.global.authLost = false
    if m.global.token = "" then return
    forgetSignIn()
    showPair()
end sub

' ---- Screen stack ----
sub pushScreen(s as object)
    if m.stack.Count() > 0 then m.stack.Peek().visible = false
    s.observeField("action", "onAction")
    m.screens.appendChild(s)
    m.stack.Push(s)
    m.starting.visible = false
    s.visible = true
    s.callFunc("takeFocus", invalid)
end sub

sub popScreen()
    if m.stack.Count() < 2 then return
    s = m.stack.Pop()
    closeScreen(s)
    top = m.stack.Peek()
    top.visible = true
    top.callFunc("takeFocus", invalid)
    top.shown = true
end sub

sub replaceAll(s as object)
    while m.stack.Count() > 0
        closeScreen(m.stack.Pop())
    end while
    pushScreen(s)
end sub

sub closeScreen(s as object)
    s.unobserveField("action")
    s.closing = true
    m.screens.removeChild(s)
end sub

' What screens ask for: {type: ...}
sub onAction(event as object)
    a = event.getData()
    if a = invalid or a.type = invalid then return
    t = a.type
    if t = "serverSet" then
        m.global.server = settingsRead("server")
        forgetSignIn()
        showPair()
    else if t = "signedIn" then
        settingsWrite("token", a.token)
        settingsWrite("deviceId", a.deviceId)
        m.global.token = a.token
        m.global.deviceId = a.deviceId
        signedIn(a.user)
    else if t = "video" then
        d = CreateObject("roSGNode", "DetailsScreen")
        d.video = a.video
        pushScreen(d)
    else if t = "play" then
        p = CreateObject("roSGNode", "PlayerScreen")
        p.startAt = a.startAt
        p.video = a.video
        pushScreen(p)
    else if t = "live" then
        p = CreateObject("roSGNode", "PlayerScreen")
        p.channel = a.channel
        pushScreen(p)
    else if t = "search" then
        pushScreen(CreateObject("roSGNode", "SearchScreen"))
    else if t = "channel" then
        s = CreateObject("roSGNode", "SearchScreen")
        s.owner = a.owner
        pushScreen(s)
    else if t = "back" then
        popScreen()
    else if t = "signOut" then
        ' Remove this TV on the server too, then forget it here.
        if m.global.deviceId <> "" then apiCall("DELETE", "/api/tv/devices/" + m.global.deviceId, invalid, "onSignedOut", m.global.token)
        forgetSignIn()
        showPair()
    else if t = "changeServer" then
        showSetup("")
    end if
end sub

sub onSignedOut(event as object)
    apiResult(event)
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "back" and m.stack.Count() > 1 then
        popScreen()
        return true
    end if
    return false
end function
