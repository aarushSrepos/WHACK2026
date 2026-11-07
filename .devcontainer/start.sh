#!/usr/bin/env bash
# Runs every time the Codespace starts. Each Codespace has its own web address, so we write it
# into frontend/.env.local here instead of asking anyone to copy and paste it.
cd "$(dirname "$0")/.."

if [ -n "$CODESPACE_NAME" ]; then
  API="https://${CODESPACE_NAME}-8000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  # Replace only this line, so anything else in frontend/.env.local (like an API key) is kept.
  touch frontend/.env.local
  { grep -v '^NEXT_PUBLIC_API_URL=' frontend/.env.local; echo "NEXT_PUBLIC_API_URL=${API}"; } > frontend/.env.local.tmp
  mv frontend/.env.local.tmp frontend/.env.local
  echo "Frontend will call the API at ${API}"
  # The browser can only call the API if port 8000 is public. Needs the port to be forwarded first,
  # so ./dev.sh runs this again once the backend is up.
  gh codespace ports visibility 8000:public -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
fi
