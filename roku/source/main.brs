' KinCast for Roku: a SceneGraph channel for a family's KinCast server.
sub Main(args as dynamic)
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.setMessagePort(port)

    ' Shared state: the server address and the TV's sign-in, read by every component.
    g = screen.getGlobalNode()
    g.addFields({ server: "", token: "", deviceId: "", user: {}, familyName: "KinCast", authLost: false })

    scene = screen.CreateScene("MainScene")
    screen.show()
    scene.launchArgs = args

    while true
        msg = wait(0, port)
        if type(msg) = "roSGScreenEvent" and msg.isScreenClosed() then return
    end while
end sub
