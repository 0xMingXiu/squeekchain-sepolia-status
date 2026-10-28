#!/usr/bin/env bash
# Loads sepolia-env.sh (official values) then sepolia-env.local.sh (local overrides, if present), and runs the given command.
set -a; . "$(dirname "$0")/sepolia-env.sh"
[ -f "$(dirname "$0")/sepolia-env.local.sh" ] && [ -z "$SQUEEK_STRICT" ] && . "$(dirname "$0")/sepolia-env.local.sh"
set +a; exec "$@"
