#!/bin/sh

# Fork-only: apply runtime config overrides from environment variables.
#
# The published image ships generic upstream defaults (matrix.org / call.element.io)
# so it stays usable by anyone, but a deployer can point it at their own
# homeserver and Element Call instance purely via `docker run -e ...`, with no
# rebuild and no mounted config file. Any unset variable leaves the baked default
# untouched.
#
# Recognised variables:
#   ELEMENT_DEFAULT_HOMESERVER_URL  -> default_server_config.m.homeserver.base_url
#   ELEMENT_DEFAULT_SERVER_NAME     -> default_server_config.m.homeserver.server_name
#   ELEMENT_CALL_URL                -> element_call.url (EC is embedded from here)
#   ELEMENT_SHOW_LABS               -> show_labs_settings (default: true for this fork)
#
# Runs after 18-load-element-modules.sh, which always creates the served config at
# /tmp/element-web-config/config.json. jq + sponge are installed by the Dockerfile.

set -e

CONFIG=/tmp/element-web-config/config.json
[ -f "$CONFIG" ] || exit 0

entrypoint_log() {
    if [ -z "${NGINX_ENTRYPOINT_QUIET_LOGS:-}" ]; then
        echo "$@"
    fi
}

set_string() {
    # $1 = jq path expression referencing $val, $2 = value
    jq --arg val "$2" "$1" "$CONFIG" | sponge "$CONFIG"
}

set_json() {
    # $1 = jq path expression referencing $val, $2 = raw JSON value
    jq --argjson val "$2" "$1" "$CONFIG" | sponge "$CONFIG"
}

if [ -n "${ELEMENT_DEFAULT_HOMESERVER_URL:-}" ]; then
    entrypoint_log "fork-config: homeserver base_url -> $ELEMENT_DEFAULT_HOMESERVER_URL"
    set_string '.default_server_config."m.homeserver".base_url = $val' "$ELEMENT_DEFAULT_HOMESERVER_URL"
fi

if [ -n "${ELEMENT_DEFAULT_SERVER_NAME:-}" ]; then
    entrypoint_log "fork-config: homeserver server_name -> $ELEMENT_DEFAULT_SERVER_NAME"
    set_string '.default_server_config."m.homeserver".server_name = $val' "$ELEMENT_DEFAULT_SERVER_NAME"
fi

if [ -n "${ELEMENT_CALL_URL:-}" ]; then
    entrypoint_log "fork-config: element_call.url -> $ELEMENT_CALL_URL"
    set_string '.element_call.url = $val' "$ELEMENT_CALL_URL"
fi

# Labs default ON for this fork; override with ELEMENT_SHOW_LABS=false
SHOW_LABS="${ELEMENT_SHOW_LABS:-true}"
case "$SHOW_LABS" in
    true | false)
        entrypoint_log "fork-config: show_labs_settings -> $SHOW_LABS"
        set_json '.show_labs_settings = $val' "$SHOW_LABS"
        ;;
    *)
        entrypoint_log "fork-config: ignoring invalid ELEMENT_SHOW_LABS='$SHOW_LABS' (expected true/false)"
        ;;
esac
