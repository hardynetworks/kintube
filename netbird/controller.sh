#!/usr/bin/env bash
# KinCast NetBird sidecar controller.
#
# Runs the NetBird daemon and keeps it in line with the settings saved on KinCast's
# Server admin page. The app writes $CTL_DIR/netbird.json; this script applies it and
# writes $CTL_DIR/netbird-status.json every few seconds for the admin page to show.
#
# netbird.json: {"enabled":true,"managementUrl":"https://...","setupKey":"...","hostname":"kintube","nonce":"..."}
set -uo pipefail

CTL_DIR="${CTL_DIR:-/kintube}"
CONF="$CTL_DIR/netbird.json"
STATUS="$CTL_DIR/netbird-status.json"
STATE_DIR="${STATE_DIR:-/etc/netbird}"
APPLIED="$STATE_DIR/.kintube-applied"   # hash of the settings last applied successfully
NETBIRD_BIN="${NETBIRD_BIN:-netbird}"
INTERVAL="${STATUS_INTERVAL:-5}"
# The NetBird reverse proxy connects to this peer on FORWARD_PORT; we relay it to the app.
FORWARD_PORT="${FORWARD_PORT:-3000}"
APP_TARGET="${APP_TARGET:-172.30.77.10:3000}"

mkdir -p "$CTL_DIR" "$STATE_DIR" /var/log/netbird
chmod 0777 "$CTL_DIR" 2>/dev/null || true

log() { printf '%s [kintube-netbird] %s\n' "$(date -Isec)" "$*" >&2; }

forward_pid=""
start_forward() {
  socat "TCP-LISTEN:${FORWARD_PORT},fork,reuseaddr,keepalive" "TCP:${APP_TARGET},keepalive" &
  forward_pid=$!
  log "forwarding :${FORWARD_PORT} -> ${APP_TARGET}"
}

daemon_pid=""
start_daemon() {
  "$NETBIRD_BIN" service run &
  daemon_pid=$!
  for _ in $(seq 30); do
    "$NETBIRD_BIN" status --check live >/dev/null 2>&1 && return 0
    sleep 1
  done
  log "daemon did not become responsive"
  return 1
}

on_exit() {
  log "stopping"
  [ -n "$forward_pid" ] && kill -TERM "$forward_pid" 2>/dev/null
  [ -n "$daemon_pid" ] && kill -TERM "$daemon_pid" 2>/dev/null && wait "$daemon_pid" 2>/dev/null
  exit 0
}
trap on_exit TERM INT

# Hash of the real settings (the "nonce" only asks for a reconnect, not a re-registration).
conf_hash() { [ -f "$CONF" ] && jq -S 'del(.nonce)' "$CONF" 2>/dev/null | sha256sum | cut -d' ' -f1 || echo none; }
conf_nonce() { [ -f "$CONF" ] && jq -r '.nonce // empty' "$CONF" 2>/dev/null || true; }
field() { jq -r --arg k "$1" '.[$k] // empty' "$CONF" 2>/dev/null; }

last_error=""
last_action=""
state="idle"

apply() {
  local hash="$1"
  if [ "$hash" = none ] || [ "$(field enabled)" != true ]; then
    log "NetBird disabled in KinCast settings; disconnecting"
    "$NETBIRD_BIN" down >/dev/null 2>&1 || true
    state="disabled"; last_error=""; last_action="Disconnected"
    rm -f "$APPLIED"
    return
  fi

  local url key host out
  url="$(field managementUrl)"; key="$(field setupKey)"; host="$(field hostname)"
  [ -z "$host" ] && host="kintube"
  if [ -z "$url" ]; then
    state="error"; last_error="Management URL is missing"; return
  fi

  local args=(up --management-url "$url" --hostname "$host")
  if [ -f "$APPLIED" ] && [ "$(cat "$APPLIED")" = "$hash" ]; then
    log "reconnecting with saved settings"           # already registered: no setup key needed
  else
    if [ -z "$key" ]; then state="error"; last_error="Setup key is missing"; return; fi
    log "applying new settings (management: $url, hostname: $host)"
    "$NETBIRD_BIN" down >/dev/null 2>&1 || true
    args+=(--setup-key "$key")
  fi

  state="connecting"; write_status
  if out="$("$NETBIRD_BIN" "${args[@]}" 2>&1)"; then
    echo "$hash" > "$APPLIED"
    state="up"; last_error=""; last_action="Connected"
    log "connected"
  else
    state="error"
    last_error="$(printf '%s' "$out" | tail -n 3 | tr '\n' ' ' | cut -c1-400)"
    log "netbird up failed: $last_error"
  fi
}

write_status() {
  local raw
  raw="$("$NETBIRD_BIN" status --json 2>/dev/null)" || raw=""
  [ -z "$raw" ] && raw='{}'
  printf '%s' "$raw" | jq -c \
    --arg state "$state" --arg err "$last_error" --arg action "$last_action" \
    --arg at "$(date -Isec)" --arg applied "$(cat "$APPLIED" 2>/dev/null || true)" \
    --arg fwd "$FORWARD_PORT" \
    '{netbird: ., controller: {state: $state, lastError: $err, lastAction: $action, updatedAt: $at, applied: ($applied != ""), forwardPort: ($fwd | tonumber)}}' \
    > "$STATUS.tmp" 2>/dev/null \
    || printf '{"netbird":{},"controller":{"state":"%s","lastError":"status unavailable","updatedAt":"%s"}}' "$state" "$(date -Isec)" > "$STATUS.tmp"
  chmod 0644 "$STATUS.tmp"
  mv -f "$STATUS.tmp" "$STATUS"
}

start_forward
start_daemon || exit 1
current=""
nonce="$(conf_nonce)"
while true; do
  h="$(conf_hash)"
  n="$(conf_nonce)"
  if [ "$h" != "$current" ]; then
    current="$h"; nonce="$n"
    apply "$h"
  elif [ "$n" != "$nonce" ]; then
    nonce="$n"
    if [ "$(field enabled)" = true ]; then
      log "reconnect requested from KinCast"
      "$NETBIRD_BIN" down >/dev/null 2>&1 || true
      apply "$h"
    fi
  elif [ "$state" = error ] && [ "$(field enabled)" = true ]; then
    # retry failed connections every ~60s (e.g. management server briefly unreachable)
    retry_in=$(( ${retry_in:-12} - 1 ))
    if [ "$retry_in" -le 0 ]; then retry_in=12; apply "$h"; fi
  fi
  write_status
  kill -0 "$forward_pid" 2>/dev/null || start_forward
  if ! kill -0 "$daemon_pid" 2>/dev/null; then
    log "daemon exited; restarting container"
    exit 1
  fi
  sleep "$INTERVAL" & wait $!
done
