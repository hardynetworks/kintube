sub init()
    m.top.functionName = "request"
end sub

sub request()
    server = m.top.server
    if server = "" then server = m.global.server
    url = server + m.top.path
    method = UCase(m.top.method)

    port = CreateObject("roMessagePort")
    xfer = CreateObject("roUrlTransfer")
    xfer.SetMessagePort(port)
    xfer.SetUrl(url)
    xfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    xfer.InitClientCertificates()
    xfer.RetainBodyOnError(true)
    xfer.EnableEncodings(true)
    xfer.AddHeader("Accept", "application/json")
    token = m.top.token
    if token = "" then token = m.global.token
    if token <> "" then xfer.AddHeader("Authorization", "Bearer " + token)

    payload = ""
    if m.top.body <> invalid and m.top.body.Count() > 0 then payload = FormatJson(m.top.body)

    started = false
    if method = "GET" then
        started = xfer.AsyncGetToString()
    else
        xfer.AddHeader("Content-Type", "application/json")
        xfer.SetRequest(method)
        started = xfer.AsyncPostFromString(payload)
    end if
    if not started then
        m.top.response = { ok: false, status: 0, data: {}, error: "Couldn't start the request" }
        return
    end if

    msg = wait(m.top.timeoutMs, port)
    if type(msg) <> "roUrlEvent" then
        xfer.AsyncCancel()
        m.top.response = { ok: false, status: 0, data: {}, error: "The server didn't answer. Check that it's on and reachable from this TV." }
        return
    end if

    status = msg.GetResponseCode()
    text = msg.GetString()
    data = invalid
    if text <> invalid and text <> "" then data = ParseJson(text)
    if data = invalid or type(data) <> "roAssociativeArray" then data = {}

    if status >= 200 and status < 300 then
        m.top.response = { ok: true, status: status, data: data, error: "" }
        return
    end if

    err = ""
    if data.error <> invalid then err = data.error
    if status < 0 then
        ' Negative codes are network errors (DNS, TLS, refused).
        err = "Can't reach " + server + " (" + msg.GetFailureReason() + ")"
    else if err = "" then
        err = "The server answered " + status.ToStr()
    end if
    ' A TV that was removed on the website is signed out.
    if status = 401 and token <> "" then m.global.authLost = true
    m.top.response = { ok: false, status: status, data: data, error: err }
end sub
