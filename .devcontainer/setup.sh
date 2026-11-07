#!/usr/bin/env bash
# Runs once when a Codespace is created: installs everything both halves of the project need.
set -e
cd "$(dirname "$0")/.."

echo "== Backend packages =="
(cd backend && pip install -r requirements.txt)
[ -f backend/.env ] || cp backend/.env.example backend/.env

echo "== Frontend packages =="
(cd frontend && npm install)

echo "Setup done. Run ./dev.sh to start the backend and the frontend."
