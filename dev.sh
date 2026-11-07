#!/usr/bin/env bash
# Starts the backend (port 8000) and the frontend (port 3000). Stop both with Ctrl+C.
cd "$(dirname "$0")"

bash .devcontainer/start.sh   # makes sure frontend/.env.local points at this Codespace

(cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000) &
BACKEND=$!
trap 'kill $BACKEND 2>/dev/null' EXIT

# Give the backend a moment to start so port 8000 exists, then make it public.
sleep 4
[ -n "$CODESPACE_NAME" ] && gh codespace ports visibility 8000:public -c "$CODESPACE_NAME" >/dev/null 2>&1

cd frontend && npm run dev
