' Calls to the KinCast API from components. Each call runs in an ApiTask;
' handlerName is called with the task's "response" field event.
function apiCall(method as string, path as string, body as dynamic, handlerName as string, token = "" as string) as object
    t = CreateObject("roSGNode", "ApiTask")
    t.token = token
    t.method = method
    t.path = path
    if body <> invalid then t.body = body
    t.observeField("response", handlerName)
    if m.apiTasks = invalid then m.apiTasks = {}
    m.apiTasks[path + method + Rnd(1000000).ToStr()] = t
    t.control = "run"
    return t
end function

' The response of a finished call: {ok, status, data, error}. Lets the task go.
function apiResult(event as object) as object
    t = event.getRoSGNode()
    t.unobserveField("response")
    if m.apiTasks <> invalid then
        for each k in m.apiTasks
            if m.apiTasks[k].isSameNode(t) then
                m.apiTasks.Delete(k)
                exit for
            end if
        end for
    end if
    return event.getData()
end function
