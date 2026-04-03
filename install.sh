#!/usr/bin/env bash
# install.sh — entry point; delegates to install/setup.sh
exec bash "$(dirname "${BASH_SOURCE[0]}")/install/setup.sh" "$@"
