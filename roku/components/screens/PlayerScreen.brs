sub init()
    m.video = m.top.findNode("video")
    m.video.notificationInterval = 5
    m.video.observeField("state", "onState")
    m.video.observeField("position", "onPosition")
    m.liveInfo = m.top.findNode("liveInfo")
    m.top.findNode("liveBadge").font = makeFont("700", 22)
    m.viewers = m.top.findNode("viewers")
    m.viewers.font = makeFont("500", 24)
    m.liveTitle = m.top.findNode("liveTitle")
    m.liveTitle.font = makeFont("600", 34)
    m.chat = m.top.findNode("chat")
    m.top.findNode("chatTitle").font = makeFont("c700", 34)
    m.top.findNode("chatHint").font = makeFont("500", 22)
    m.chatText = m.top.findNode("chatText")
    m.chatText.font = makeFont("400", 26)
    m.notice = m.top.findNode("notice")
    m.noticeTitle = m.top.findNode("noticeTitle")
    m.noticeTitle.font = makeFont("c700", 64)
    m.noticeText = m.top.findNode("noticeText")
    m.noticeText.font = makeFont("400", 32)
    m.statusTimer = m.top.findNode("statusTimer")
    m.statusTimer.observeField("fire", "checkLive")
    m.chatTimer = m.top.findNode("chatTimer")
    m.chatTimer.observeField("fire", "loadChat")
    m.waitTimer = m.top.findNode("waitTimer")
    m.waitTimer.observeField("fire", "checkLive")
    m.exitTimer = m.top.findNode("exitTimer")
    m.exitTimer.observeField("fire", "leave")
    m.isLive = false
    m.counted = false
    m.lastSaved = 0
    m.retries = 0
end sub

sub takeFocus(_unused as dynamic)
    m.video.setFocus(true)
end sub

' ---- Videos ----
sub playVideo()
    v = m.top.video
    if v = invalid or v.id = invalid then return
    if v.hls = invalid or v.hls = "" then
        showNotice("Not ready yet", "This video is still being processed. Try again in a few minutes.")
        m.exitTimer.control = "start"
        return
    end if
    c = CreateObject("roSGNode", "ContentNode")
    c.url = absUrl(v.hls)
    c.streamFormat = "hls"
    c.title = v.title
    if v.owner <> invalid then c.secondaryTitle = v.owner.displayName
    if m.top.startAt > 0 then c.playStart = m.top.startAt
    start(c)
end sub

sub start(c as object)
    ' Every request (playlists and segments) carries this TV's sign-in.
    m.video.setHttpAgent(authAgent())
    m.video.content = c
    m.video.control = "play"
    m.video.setFocus(true)
end sub

sub onPosition()
    if m.isLive then return
    at = Int(m.video.position)
    if Abs(at - m.lastSaved) >= 10 then
        m.lastSaved = at
        bookmarkSet(m.top.video.id, at, m.top.video.duration)
    end if
end sub

sub onState()
    s = m.video.state
    if s = "playing" then
        m.retries = 0
        hideNotice()
        if not m.isLive and not m.counted then
            m.counted = true
            apiCall("POST", "/api/videos/" + m.top.video.id + "/view", invalid, "onIgnored")
        end if
    else if s = "finished" then
        if m.isLive then
            ' The live playlist ended: check whether the stream did too.
            checkLive()
        else
            bookmarkSet(m.top.video.id, 0, invalid)
            leave()
        end if
    else if s = "error" then
        if m.isLive and m.retries < 5 then
            ' Live playlists can lag the stream starting; try again shortly.
            m.retries = m.retries + 1
            showNotice("Connecting…", "Waiting for " + m.top.channel.displayName + "'s stream.")
            m.waitTimer.control = "start"
            return
        end if
        msg = m.video.errorMsg
        if msg = invalid or msg = "" then msg = "Something went wrong playing this video."
        showNotice("Couldn't play this", msg + "  (" + m.video.errorCode.ToStr() + ")")
        m.exitTimer.control = "start"
    end if
end sub

sub onIgnored(event as object)
    apiResult(event)
end sub

' ---- Live ----
sub playLive()
    ch = m.top.channel
    if ch = invalid or ch.username = invalid then return
    m.isLive = true
    m.liveTitle.text = ch.title
    m.viewers.text = ch.displayName
    m.liveInfo.visible = true
    m.chat.visible = true
    loadChat()
    m.chatTimer.control = "start"
    m.statusTimer.control = "start"
    if ch.ready = true and ch.hls <> invalid then
        startLive(ch.hls)
    else
        showNotice("Starting soon", "Waiting for " + ch.displayName + "'s stream to begin.")
        m.waitTimer.control = "start"
    end if
end sub

sub startLive(hls as string)
    m.waitTimer.control = "stop"
    m.started = true
    c = CreateObject("roSGNode", "ContentNode")
    c.url = absUrl(hls)
    c.streamFormat = "hls"
    c.live = true
    c.title = m.top.channel.title
    start(c)
end sub

sub checkLive()
    if m.checking = true then return
    m.checking = true
    apiCall("GET", "/api/live/channel/" + m.top.channel.username, invalid, "onLiveStatus")
end sub

sub onLiveStatus(event as object)
    m.checking = false
    r = apiResult(event)
    if m.top.closing or not r.ok then return
    ch = r.data.channel
    m.viewers.text = ch.displayName + "  ·  " + countText(ch.viewers, "watching")
    m.liveTitle.text = ch.title
    if ch.isLive <> true then
        m.statusTimer.control = "stop"
        m.waitTimer.control = "stop"
        m.chatTimer.control = "stop"
        m.video.control = "stop"
        showNotice("The stream has ended", "Thanks for watching. If " + ch.displayName + " saved it, the replay shows up in KinCast shortly.")
        m.exitTimer.control = "start"
    else if ch.ready = true and (m.started <> true or m.video.state = "error" or m.video.state = "finished") then
        startLive(ch.hls)
    end if
end sub

sub loadChat()
    if m.top.channel = invalid then return
    apiCall("GET", "/api/live/channel/" + m.top.channel.username + "/chat", invalid, "onChat")
end sub

sub onChat(event as object)
    r = apiResult(event)
    if not r.ok then return
    lines = []
    msgs = r.data.messages
    first = msgs.Count() - 14
    if first < 0 then first = 0
    for i = first to msgs.Count() - 1
        msg = msgs[i]
        lines.Push(msg.author.displayName + ":  " + msg.body)
    end for
    if lines.Count() = 0 then
        m.chatText.text = "No messages yet. Family can chat from KinCast on their phones."
    else
        m.chatText.text = lines.Join(Chr(10))
    end if
end sub

' ---- Messages and leaving ----
sub showNotice(title as string, text as string)
    m.noticeTitle.text = title
    m.noticeText.text = text
    m.notice.visible = true
end sub

sub hideNotice()
    m.notice.visible = false
end sub

sub leave()
    m.top.action = { type: "back" }
end sub

sub onClosing()
    if not m.isLive and m.top.video <> invalid and m.top.video.id <> invalid and m.video.state <> "finished" then
        bookmarkSet(m.top.video.id, Int(m.video.position), m.top.video.duration)
    end if
    m.statusTimer.control = "stop"
    m.chatTimer.control = "stop"
    m.waitTimer.control = "stop"
    m.exitTimer.control = "stop"
    m.video.control = "stop"
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "options" and m.isLive then
        m.chat.visible = not m.chat.visible
        if m.chat.visible then loadChat()
        return true
    end if
    return false
end function
