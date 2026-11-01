sub init()
    m.title = m.top.findNode("title")
    m.title.font = makeFont("c700", 60)
    m.title.text = "Search"
    m.keyboard = m.top.findNode("keyboard")
    m.keyboard.observeField("text", "onText")
    m.grid = m.top.findNode("grid")
    m.grid.observeField("itemSelected", "onSelected")
    m.status = m.top.findNode("status")
    m.status.font = makeFont("500", 30)
    m.status.text = "Type a title, a person's name, or a word from a description."
    m.debounce = m.top.findNode("debounce")
    m.debounce.observeField("fire", "search")
    m.searchCount = 0
end sub

sub takeFocus(_unused as dynamic)
    if m.top.owner <> invalid and m.top.owner.username <> invalid then
        m.grid.setFocus(true)
    else if m.grid.content <> invalid and m.grid.content.getChildCount() > 0 and m.leftKeyboard = true then
        m.grid.setFocus(true)
    else
        m.keyboard.setFocus(true)
    end if
end sub

sub onClosing()
    m.debounce.control = "stop"
end sub

' "More from <name>": no keyboard, a wider grid of their videos.
sub showOwner()
    o = m.top.owner
    if o = invalid or o.username = invalid then return
    m.keyboard.visible = false
    m.title.text = "Videos from " + o.displayName
    m.grid.translation = [96, 236]
    m.grid.numColumns = 4
    m.grid.itemSize = [400, 300]
    m.grid.itemSpacing = [41, 44]
    m.status.translation = [96, 260]
    m.status.text = "Loading…"
    apiCall("GET", "/api/videos?limit=60&user=" + o.username, invalid, "onResults")
end sub

sub onText()
    m.debounce.control = "stop"
    m.debounce.control = "start"
end sub

sub search()
    q = m.keyboard.text.Trim()
    if Len(q) < 2 then
        m.grid.content = invalid
        m.status.text = "Type a title, a person's name, or a word from a description."
        m.status.visible = true
        return
    end if
    xfer = CreateObject("roUrlTransfer")
    m.searchCount = m.searchCount + 1
    m.lastQuery = q
    apiCall("GET", "/api/videos?limit=48&q=" + xfer.Escape(q), invalid, "onResults")
end sub

sub onResults(event as object)
    r = apiResult(event)
    if not r.ok then
        m.status.text = r.error
        m.status.visible = true
        return
    end if
    videos = r.data.videos
    if videos = invalid or videos.Count() = 0 then
        m.grid.content = invalid
        if m.top.owner <> invalid and m.top.owner.username <> invalid then
            m.status.text = m.top.owner.displayName + " hasn't shared any videos yet."
        else
            m.status.text = "Nothing matches " + Chr(34) + m.lastQuery + Chr(34) + "."
        end if
        m.status.visible = true
        return
    end if
    m.status.visible = false
    c = CreateObject("roSGNode", "ContentNode")
    for each v in videos
        n = c.createChild("ContentNode")
        n.addFields({ kind: "video", data: v })
        n.title = v.title
    end for
    m.grid.content = c
    if m.top.owner <> invalid and m.top.owner.username <> invalid then m.grid.setFocus(true)
end sub

sub onSelected()
    n = m.grid.content.getChild(m.grid.itemSelected)
    if n <> invalid then m.top.action = { type: "video", video: n.data }
end sub

' Right from the keyboard goes to the results; left from the first column goes back.
function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if m.top.owner <> invalid and m.top.owner.username <> invalid then return false
    if key = "right" and m.keyboard.isInFocusChain() and m.grid.content <> invalid then
        m.grid.setFocus(true)
        m.leftKeyboard = true
        return true
    end if
    if key = "left" and m.grid.hasFocus() then
        m.keyboard.setFocus(true)
        m.leftKeyboard = false
        return true
    end if
    return false
end function
