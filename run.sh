#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "⚡ DuoDev Studio (Antigravity ✕ Codex Collaborative Team)"
echo "=========================================================="
echo "Starting Node.js Server on port 3300..."
echo "Web UI URL: http://localhost:3300"
echo "=========================================================="

exec node server.js
