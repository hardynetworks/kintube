sub init()
    m.ring = m.top.findNode("ring")
    m.frame = m.top.findNode("frame")
    m.thumb = m.top.findNode("thumb")
    m.avatar = m.top.findNode("avatar")
    m.avatarCircle = m.top.findNode("avatarCircle")
    m.avatarText = m.top.findNode("avatarText")
    m.badge = m.top.findNode("badge")
    m.badgeText = m.top.findNode("badgeText")
    m.badgeText.font = makeFont("700", 20)
    m.title = m.top.findNode("title")
    m.title.font = makeFont("600", 26)
    m.sub = m.top.findNode("sub")
    m.sub.font = makeFont("400", 22)
    m.kind = "video"
end sub

sub onContent()
    c = m.top.itemContent
    if c = invalid then return
    d = c.data
    m.kind = c.kind
    m.badge.visible = false
    m.badgeText.visible = false
    m.avatar.visible = false
    m.thumb.visible = true
    if m.kind = "person" then
        m.thumb.visible = false
        m.thumb.uri = ""
        m.avatar.visible = true
        m.avatarCircle.blendColor = sgColor(d.avatarColor)
        m.avatarText.text = initials(d.displayName)
        m.title.text = d.displayName
        if d.isLive = true then
            m.sub.text = "Live now"
        else
            m.sub.text = countText(d.videoCount, "video")
        end if
    else if m.kind = "live" then
        ' Live streams have no thumbnail: the person's color and initials.
        m.thumb.visible = false
        m.thumb.uri = ""
        m.avatar.visible = true
        m.avatarCircle.blendColor = sgColor(d.avatarColor)
        m.avatarText.text = initials(d.displayName)
        m.title.text = d.title
        m.sub.text = d.displayName + "  ·  " + countText(d.viewers, "watching")
        showBadge("LIVE", "0xFF0000FF")
    else
        setImage(m.thumb, d.thumbnail)
        m.title.text = d.title
        subText = ""
        if d.owner <> invalid then subText = d.owner.displayName
        when = filmedText(d.filmedOn)
        if when = "" then when = agoText(d.createdAt)
        if when <> "" then subText = subText + "  ·  " + when
        m.sub.text = subText
        if d.source = "live" then
            showBadge("REPLAY", "0x000000CC")
        else
            showBadge(formatDuration(d.duration), "0x000000CC")
        end if
    end if
    layout()
end sub

sub showBadge(text as string, color as string)
    if text = "" then return
    m.badgeText.text = text
    m.badge.blendColor = color
    m.badge.visible = true
    m.badgeText.visible = true
    layout()
end sub

sub layout()
    w = m.top.width
    if w <= 0 then return
    if m.kind = "person" then
        size = w - 40
        if size > 180 then size = 180
        x = (w - size) / 2
        m.frame.visible = false
        m.avatarCircle.width = size
        m.avatarCircle.height = size
        m.avatar.translation = [x, 10]
        m.avatarText.width = size
        m.avatarText.height = size
        m.avatarText.font = makeFont("700", Int(size * 0.36))
        m.ring.uri = "pkg:/images/ring_circle.png"
        m.ring.width = size + 16
        m.ring.height = size + 16
        m.ring.translation = [x - 8, 2]
        m.title.width = w
        m.title.horizAlign = "center"
        m.title.translation = [0, size + 28]
        m.sub.width = w
        m.sub.horizAlign = "center"
        m.sub.translation = [0, size + 62]
        return
    end if
    h = Int(w * 9 / 16)
    m.frame.visible = true
    m.frame.width = w
    m.frame.height = h
    m.thumb.width = w
    m.thumb.height = h
    m.ring.uri = "pkg:/images/ring.9.png"
    m.ring.width = w + 16
    m.ring.height = h + 16
    m.ring.translation = [-8, -8]
    if m.kind = "live" then
        size = Int(h * 0.55)
        m.avatarCircle.width = size
        m.avatarCircle.height = size
        m.avatar.translation = [(w - size) / 2, (h - size) / 2]
        m.avatarText.width = size
        m.avatarText.height = size
        m.avatarText.font = makeFont("700", Int(size * 0.36))
    end if
    bw = 30 + Len(m.badgeText.text) * 12
    m.badge.width = bw
    m.badge.height = 34
    if m.kind = "live" then
        m.badge.translation = [12, 12]
    else
        m.badge.translation = [w - bw - 10, h - 44]
    end if
    m.badgeText.width = bw
    m.badgeText.height = 34
    m.badgeText.translation = m.badge.translation
    m.title.horizAlign = "left"
    m.title.width = w
    m.title.translation = [0, h + 14]
    m.sub.horizAlign = "left"
    m.sub.width = w
    m.sub.translation = [0, h + 48]
end sub

sub onFocus()
    listFocused = m.top.rowListHasFocus or m.top.gridHasFocus
    p = 0
    if listFocused then p = m.top.focusPercent
    m.ring.opacity = p
    if p > 0.5 then
        m.title.color = "0xFFFFFFFF"
    else
        m.title.color = "0xD8D8D8FF"
    end if
end sub
