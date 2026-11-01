sub init()
    m.top.findNode("title").font = makeFont("c700", 64)
    m.top.findNode("help").font = makeFont("400", 30)
    m.label = m.top.findNode("addressLabel")
    m.label.font = makeFont("500", 36)
    m.errorLabel = m.top.findNode("errorLabel")
    m.errorLabel.font = makeFont("500", 28)
    m.buttons = m.top.findNode("buttons")
    m.buttons.textFont = makeFont("600", 32)
    m.buttons.focusedTextFont = makeFont("600", 32)
    m.buttons.buttons = ["Type the address", "Connect"]
    m.buttons.observeField("buttonSelected", "onButton")
    m.spinner = m.top.findNode("spinner")
    m.spinner.poster.uri = "pkg:/images/spinner.png"
    m.spinner.poster.width = 96
    m.spinner.poster.height = 96
    showAddress()
end sub

sub takeFocus(_unused as dynamic)
    m.buttons.setFocus(true)
    if m.top.address <> "" then m.buttons.focusButton = 1
end sub

sub showAddress()
    if m.label = invalid then return
    if m.top.address = "" then
        m.label.text = "kincast.example.net"
        m.label.color = "0x666666FF"
    else
        m.label.text = m.top.address
        m.label.color = "0xF1F1F1FF"
    end if
end sub

sub showError()
    if m.errorLabel <> invalid then m.errorLabel.text = m.top.error
end sub

sub onButton()
    if m.buttons.buttonSelected = 0 then
        openKeyboard()
    else
        connect()
    end if
end sub

sub openKeyboard()
    d = CreateObject("roSGNode", "StandardKeyboardDialog")
    d.title = "KinCast address"
    d.message = ["The address you open KinCast at in a web browser."]
    d.text = m.top.address
    d.buttons = ["OK", "Cancel"]
    d.observeField("buttonSelected", "onKeyboard")
    d.observeField("wasClosed", "onKeyboardClosed")
    m.dialog = d
    m.top.getScene().dialog = d
end sub

sub onKeyboard()
    d = m.dialog
    if d.buttonSelected = 0 then
        m.top.address = d.text.Trim()
        m.top.error = ""
    end if
    closeDialog(d, m.buttons)
    if m.top.address <> "" then m.buttons.focusButton = 1
end sub

sub onKeyboardClosed()
    m.buttons.setFocus(true)
end sub

' Check the address answers like a KinCast server before saving it.
sub connect()
    server = normalizeServer(m.top.address)
    if server = "" then
        m.top.error = "Type your KinCast's address first."
        return
    end if
    m.server = server
    m.top.error = ""
    m.buttons.visible = false
    m.spinner.visible = true
    m.spinner.control = "start"
    t = CreateObject("roSGNode", "ApiTask")
    t.server = server
    t.path = "/api/health"
    t.timeoutMs = 12000
    t.observeField("response", "onHealth")
    m.check = t
    t.control = "run"
end sub

sub onHealth()
    r = m.check.response
    m.spinner.control = "stop"
    m.spinner.visible = false
    m.buttons.visible = true
    m.buttons.setFocus(true)
    if r.ok and r.data.ok = true then
        settingsWrite("server", m.server)
        m.top.action = { type: "serverSet" }
    else if r.ok or r.status > 0 then
        m.top.error = m.server + " answered, but it doesn't look like KinCast. Check the address."
    else
        m.top.error = r.error
    end if
end sub
