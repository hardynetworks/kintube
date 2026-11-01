' Unit tests for components/lib/util.brs, run by brs-cli (npm test).
sub Main()
    m.failures = 0
    m.global = { server: "https://kincast.example.net", token: "" }

    ' Server addresses
    eq(normalizeServer("kincast.example.net"), "https://kincast.example.net", "domain gets https")
    eq(normalizeServer("  KinCast.Example.NET/ "), "https://kincast.example.net", "trimmed, lowercased, no slash")
    eq(normalizeServer("192.168.1.20:8095"), "http://192.168.1.20:8095", "IP and port get http")
    eq(normalizeServer("192.168.1.20"), "http://192.168.1.20", "bare IP gets http")
    eq(normalizeServer("nas:8095"), "http://nas:8095", "name and port get http")
    eq(normalizeServer("hardynas.local"), "http://hardynas.local", ".local gets http")
    eq(normalizeServer("http://kincast.example.net"), "http://kincast.example.net", "typed scheme kept")
    eq(normalizeServer("https://10.0.0.5:443/"), "https://10.0.0.5:443", "typed https kept")
    eq(normalizeServer(""), "", "empty")
    eq(normalizeServer("kin cast.net"), "", "spaces rejected")
    eq(displayServer("https://kincast.example.net"), "kincast.example.net", "display drops scheme")
    eq(absUrl("/media/a/thumb.jpg"), "https://kincast.example.net/media/a/thumb.jpg", "relative paths join the server")
    eq(absUrl("http://x/y"), "http://x/y", "absolute URLs pass through")
    eq(absUrl(invalid), "", "missing path")

    ' Formatting
    eq(formatDuration(75), "1:15", "minutes")
    eq(formatDuration(3725.4), "1:02:05", "hours")
    eq(formatDuration(5), "0:05", "seconds")
    eq(formatDuration(invalid), "", "no duration")
    eq(filmedText("2019-07-04"), "Jul 4, 2019", "filmed date")
    eq(filmedText(invalid), "", "no filmed date")
    eq(countText(1, "view"), "1 view", "singular")
    eq(countText(0, "view"), "0 views", "zero")
    eq(countText(1250, "view"), "1.2K views", "thousands")
    eq(countText(3400000, "view"), "3.4M views", "millions")
    eq(countText(5, "watching"), "5 watching", "watching")
    eq(initials("Cade Hardy"), "CH", "initials")
    eq(initials("cher"), "C", "one name")
    eq(initials("Mary Jo Smith"), "MJ", "two letters max")
    eq(sgColor("#22D3EE"), "0x22D3EEFF", "color")
    eq(sgColor("blue"), "0x6366F1FF", "bad color falls back")
    eq(agoText(invalid), "", "no date")
    now = CreateObject("roDateTime")
    now.FromSeconds(now.AsSeconds() - 3 * 86400 - 60)
    eq(agoText(now.ToISOString()), "3 days ago", "days ago")

    if m.failures = 0 then
        print "ALL TESTS PASSED"
    else
        print m.failures; " TEST(S) FAILED"
    end if
end sub

sub eq(actual as dynamic, expected as dynamic, name as string)
    if actual <> expected then
        m.failures = m.failures + 1
        print "FAIL "; name; ": got '"; actual; "' expected '"; expected; "'"
    end if
end sub
