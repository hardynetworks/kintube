# KinCast NetBird sidecar: the official NetBird client plus a small controller that
# takes its settings from KinCast's Server admin page.
FROM netbirdio/netbird:latest
RUN apk add --no-cache jq coreutils socat
COPY controller.sh /usr/local/bin/kintube-netbird.sh
RUN chmod +x /usr/local/bin/kintube-netbird.sh
ENV CTL_DIR=/kintube
ENTRYPOINT ["/usr/local/bin/kintube-netbird.sh"]
