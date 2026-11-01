sub init()
    m.backdrop = m.top.findNode("backdrop")
    m.rows = m.top.findNode("rows")
    m.rows.rowLabelFont = makeFont("c700", 34)
    m.rows.observeField("rowItemFocused", "onItemFocused")
    m.rows.observeField("rowItemSelected", "onItemSelected")
    m.family = m.top.findNode("family")
    m.family.font = makeFont("600", 30)
    m.family.text = m.global.familyName
    m.top.findNode("hint").font = makeFont("500", 26)
    m.ownerDot = m.top.findNode("ownerDot")
    m.ownerInitials = m.top.findNode("ownerInitials")
    m.ownerInitials.font = makeFont("700", 18)
    m.ownerName = m.top.findNode("ownerName")
    m.ownerName.font = makeFont("600", 28)
    m.heroTitle = m.top.findNode("heroTitle")
    m.heroTitle.font = makeFont("c700", 72)
    m.heroMeta = m.top.findNode("heroMeta")
    m.heroMeta.font = makeFont("500", 28)
    m.heroDesc = m.top.findNode("heroDesc")
    m.heroDesc.font = makeFont("400", 28)
    m.empty = m.top.findNode("empty")
    m.empty.font = makeFont("500", 32)
    m.spinner = m.top.findNode("spinner")
    m.spinner.poster.uri = "pkg:/images/spinner.png"
    m.spinner.poster.width = 96
    m.spinner.poster.height = 96
    m.spinner.control = "start"
    m.refresh = m.top.findNode("refresh")
    m.refresh.observeField("fire", "load")
    m.refresh.control = "start"
    m.hero = m.top.findNode("hero")
    m.hero.visible = false
    load()
end sub

sub takeFocus(_unused as dynamic)
    m.rows.setFocus(true)
end sub

sub onClosing()
    m.refresh.control = "stop"
end sub

' Coming back from a video: refresh what's live and new.
sub onShown()
    load()
end sub

' ---- Loading ----
sub load()
    if m.loading = true then return
    m.loading = true
    m.results = {}
    m.waiting = 5
    apiCall("GET", "/api/live", invalid, "onLive")
    apiCall("GET", "/api/videos?limit=24", invalid, "onLatest")
    apiCall("GET", "/api/videos?subscribed=1&limit=24", invalid, "onSubscribed")
    apiCall("GET", "/api/videos/on-this-day", invalid, "onThisDay")
    apiCall("GET", "/api/family/members", invalid, "onMembers")
end sub

sub onLive(event as object)
    gotResult("live", apiResult(event))
end sub
sub onLatest(event as object)
    gotResult("latest", apiResult(event))
end sub
sub onSubscribed(event as object)
    gotResult("subscribed", apiResult(event))
end sub
sub onThisDay(event as object)
    gotResult("onThisDay", apiResult(event))
end sub
sub onMembers(event as object)
    gotResult("members", apiResult(event))
end sub

sub gotResult(key as string, r as object)
    m.results[key] = r
    m.waiting = m.waiting - 1
    if m.waiting > 0 then return
    m.loading = false
    build()
end sub

sub build()
    rowsData = []
    live = listOf(m.results.live, "channels")
    if live.Count() > 0 then rowsData.Push({ title: "Live now", kind: "live", items: live })
    latest = listOf(m.results.latest, "videos")
    if latest.Count() > 0 then rowsData.Push({ title: "Latest", kind: "video", items: latest })
    subs = listOf(m.results.subscribed, "videos")
    if subs.Count() > 0 then rowsData.Push({ title: "From your subscriptions", kind: "video", items: subs })
    otd = listOf(m.results.onThisDay, "videos")
    if otd.Count() > 0 then rowsData.Push({ title: "On this day", kind: "video", items: otd })
    people = []
    for each p in listOf(m.results.members, "members")
        if p.videoCount > 0 or p.isLive = true then people.Push(p)
    end for
    if people.Count() > 0 then rowsData.Push({ title: "Family", kind: "person", items: people })

    m.spinner.control = "stop"
    m.spinner.visible = false

    if rowsData.Count() = 0 then
        failed = m.results.latest <> invalid and not m.results.latest.ok
        if failed then
            m.empty.text = "Couldn't load your videos. " + m.results.latest.error
        else
            m.empty.text = "No videos yet. Upload home videos from KinCast on your phone or computer and they'll show up here."
        end if
        m.empty.visible = true
        m.rows.visible = false
        m.hero.visible = false
        return
    end if
    m.empty.visible = false
    m.rows.visible = true

    ' Keep the focus on the same row and item across refreshes.
    focusRow = 0
    focusCol = 0
    if m.rowKinds <> invalid and m.rows.rowItemFocused <> invalid and m.rows.rowItemFocused.Count() = 2 then
        old = m.rowTitles[m.rows.rowItemFocused[0]]
        for i = 0 to rowsData.Count() - 1
            if rowsData[i].title = old then
                focusRow = i
                focusCol = m.rows.rowItemFocused[1]
            end if
        end for
    end if

    content = CreateObject("roSGNode", "ContentNode")
    sizes = []
    m.rowKinds = []
    m.rowTitles = []
    for each row in rowsData
        rn = content.createChild("ContentNode")
        rn.title = row.title
        for each item in row.items
            n = rn.createChild("ContentNode")
            n.addFields({ kind: row.kind, data: item })
            n.title = item.title
        end for
        if row.kind = "person" then
            sizes.Push([240, 300])
        else
            sizes.Push([400, 300])
        end if
        m.rowKinds.Push(row.kind)
        m.rowTitles.Push(row.title)
    end for
    m.rows.rowItemSize = sizes
    m.rows.content = content
    if focusCol >= rowsData[focusRow].items.Count() then focusCol = rowsData[focusRow].items.Count() - 1
    if focusRow > 0 or focusCol > 0 then m.rows.jumpToRowItem = [focusRow, focusCol]
    showHero(focusRow, focusCol)
end sub

function listOf(r as dynamic, key as string) as object
    if r = invalid or not r.ok then return []
    v = r.data[key]
    if v = invalid then return []
    return v
end function

' ---- Focus and selection ----
function itemAt(pos as dynamic) as dynamic
    if pos = invalid or pos.Count() <> 2 or m.rows.content = invalid then return invalid
    row = m.rows.content.getChild(pos[0])
    if row = invalid then return invalid
    return row.getChild(pos[1])
end function

sub onItemFocused()
    p = m.rows.rowItemFocused
    if p <> invalid and p.Count() = 2 then showHero(p[0], p[1])
end sub

sub showHero(row as integer, col as integer)
    n = itemAt([row, col])
    if n = invalid then return
    d = n.data
    m.hero.visible = true
    if n.kind = "person" then
        setOwner(d)
        m.heroTitle.text = d.displayName
        meta = countText(d.videoCount, "video") + "  ·  " + countText(d.subscribers, "subscriber")
        if d.isLive = true then meta = "Live now  ·  " + meta
        m.heroMeta.text = meta
        m.heroDesc.text = "Press OK to see everything " + d.displayName + " has shared."
        m.backdrop.uri = ""
    else if n.kind = "live" then
        setOwner(d)
        m.heroTitle.text = d.title
        m.heroMeta.text = "LIVE  ·  started " + agoText(d.startedAt) + "  ·  " + countText(d.viewers, "watching")
        m.heroDesc.text = "Press OK to watch with family chat."
        m.backdrop.uri = ""
    else
        if d.owner <> invalid then setOwner(d.owner)
        m.heroTitle.text = d.title
        parts = []
        when = filmedText(d.filmedOn)
        if when <> "" then
            parts.Push("Filmed " + when)
        else
            parts.Push(agoText(d.createdAt))
        end if
        if d.duration <> invalid then parts.Push(formatDuration(d.duration))
        parts.Push(countText(d.views, "view"))
        m.heroMeta.text = parts.Join("  ·  ")
        m.heroDesc.text = d.description
        setImage(m.backdrop, d.thumbnail)
    end if
    layoutHero()
end sub

sub layoutHero()
    stackLabels([m.heroTitle, m.heroMeta, m.heroDesc], 64, 14)
end sub

sub setOwner(u as object)
    m.ownerDot.blendColor = sgColor(u.avatarColor)
    m.ownerInitials.text = initials(u.displayName)
    m.ownerName.text = u.displayName
end sub

sub onItemSelected()
    n = itemAt(m.rows.rowItemSelected)
    if n = invalid then return
    if n.kind = "live" then
        m.top.action = { type: "live", channel: n.data }
    else if n.kind = "person" then
        m.top.action = { type: "channel", owner: n.data }
    else
        m.top.action = { type: "video", video: n.data }
    end if
end sub

' ---- Options ----
function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "options" then
        showOptions()
        return true
    end if
    return false
end function

sub showOptions()
    d = CreateObject("roSGNode", "StandardMessageDialog")
    d.title = m.global.familyName
    who = ""
    if m.global.user <> invalid and m.global.user.displayName <> invalid then who = m.global.user.displayName
    d.message = ["Signed in as " + who + " on " + displayServer(m.global.server)]
    d.buttons = ["Search", "Refresh", "Sign out of this TV", "Change server", "Close"]
    d.observeField("buttonSelected", "onOption")
    m.dialog = d
    m.top.getScene().dialog = d
end sub

sub onOption()
    i = m.dialog.buttonSelected
    closeDialog(m.dialog, m.rows)
    if i = 0 then
        m.top.action = { type: "search" }
    else if i = 1 then
        load()
    else if i = 2 then
        m.top.action = { type: "signOut" }
    else if i = 3 then
        m.top.action = { type: "changeServer" }
    end if
end sub
