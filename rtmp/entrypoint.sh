#!/bin/sh
set -e
: "${APP_UPSTREAM:=http://app:3000}"
: "${RTMP_CALLBACK_SECRET:?RTMP_CALLBACK_SECRET must be set}"
export APP_UPSTREAM RTMP_CALLBACK_SECRET

envsubst '${APP_UPSTREAM} ${RTMP_CALLBACK_SECRET}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# nginx (www-data) writes HLS + recordings; the app container (uid 1000) reads and moves them.
mkdir -p /hls /recordings
chmod 0777 /hls /recordings

nginx -t
exec nginx -g 'daemon off;'
