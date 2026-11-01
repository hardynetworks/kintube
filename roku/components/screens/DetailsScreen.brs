sub init()
    m.backdrop = m.top.findNode("backdrop")
    m.thumb = m.top.findNode("thumb")
    m.ownerDot = m.top.findNode("ownerDot")
    m.ownerInitials = m.top.findNode("ownerInitials")
    m.ownerInitials.font = makeFont("700", 22)
    m.ownerName = m.top.findNode("ownerName")
    m.ownerName.font = makeFont("600", 32)
    m.title = m.top.findNode("title")
    m.title.font = makeFont("c700", 80)
    m.meta = m.top.findNode("meta")
    m.meta.font = makeFont("500", 30)
    m.desc = m.top.findNode("desc")
    m.desc.font = makeFont("400", 30)
    m.buttons = m.top.findNode("buttons")
    m.buttons.textFont = makeFont("600", 32)
    m.buttons.focusedTextFont = makeFont("600", 32)
    m.buttons.observeField("buttonSelected", "onButton")
end sub

sub takeFocus(_unused as dynamic)
    m.buttons.setFocus(true)
end sub

sub showVideo()
    v = m.top.video
    if v = invalid or v.id = invalid then return
    setImage(m.backdrop, v.thumbnail)
    setImage(m.thumb, v.thumbnail)
    if v.owner <> invalid then
        m.ownerDot.blendColor = sgColor(v.owner.avatarColor)
        m.ownerInitials.text = initials(v.owner.displayName)
        m.ownerName.text = v.owner.displayName
    end if
    m.title.text = v.title
    parts = []
    when = filmedText(v.filmedOn)
    if when <> "" then parts.Push("Filmed " + when)
    parts.Push("Added " + agoText(v.createdAt))
    if v.duration <> invalid then parts.Push(formatDuration(v.duration))
    parts.Push(countText(v.views, "view"))
    if v.likes <> invalid and v.likes > 0 then parts.Push(countText(v.likes, "like"))
    m.meta.text = parts.Join("  ·  ")
    if v.description <> invalid and v.description <> "" then
        m.desc.text = v.description
    else
        m.desc.text = ""
    end if
    stackLabels([m.title, m.meta, m.desc], 80, 22)
    showButtons()
end sub

' Back from the player: the resume point may have changed.
sub onShown()
    showButtons()
end sub

sub showButtons()
    v = m.top.video
    m.resumeAt = bookmarkGet(v.id)
    labels = []
    m.actions = []
    if m.resumeAt > 0 then
        labels.Push("Resume from " + formatDuration(m.resumeAt))
        m.actions.Push("resume")
        labels.Push("Start over")
        m.actions.Push("start")
    else
        labels.Push("Play")
        m.actions.Push("start")
    end if
    if v.owner <> invalid then
        labels.Push("More from " + v.owner.displayName)
        m.actions.Push("owner")
    end if
    m.buttons.buttons = labels
end sub

sub onButton()
    a = m.actions[m.buttons.buttonSelected]
    v = m.top.video
    if a = "resume" then
        m.top.action = { type: "play", video: v, startAt: m.resumeAt }
    else if a = "start" then
        m.top.action = { type: "play", video: v, startAt: 0 }
    else if a = "owner" then
        m.top.action = { type: "channel", owner: v.owner }
    end if
end sub
