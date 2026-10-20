#!/bin/sh
set -e
: "${APP_UPSTREAM:=http://app:3000}"
: "${RTMP_CALLBACK_SECRET:?RTMP_CALLBACK_SECRET must be set}"
# nginx-rtmp creates each stream's HLS folder as 0744 (only the owner can open it), so nginx
# must run as the same user as the KinCast app (node, uid 1000) or the app can't read the playlist.
: "${KINTUBE_UID:=1000}"
: "${KINTUBE_GID:=1000}"
export APP_UPSTREAM RTMP_CALLBACK_SECRET

getent group kincast >/dev/null 2>&1 || groupadd -o -g "$KINTUBE_GID" kincast
getent passwd kincast >/dev/null 2>&1 || useradd -o -u "$KINTUBE_UID" -g kincast -M -d /nonexistent -s /usr/sbin/nologin kincast

envsubst '${APP_UPSTREAM} ${RTMP_CALLBACK_SECRET}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Shared with the app container. Fix ownership left by older versions (which ran as www-data).
mkdir -p /hls /recordings
chown -R "$KINTUBE_UID:$KINTUBE_GID" /hls /recordings
chmod 0777 /hls /recordings

nginx -t
exec nginx -g 'daemon off;'
