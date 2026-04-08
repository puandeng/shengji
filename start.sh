#!/bin/bash
# ─────────────────────────────────────────────────────────────
# 200 Card Game — startup script (Mac / Linux)
# Usage: ./start.sh
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER="$ROOT/server"
CLIENT="$ROOT/client"

# ── Colours ──────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Colour

echo -e "${CYAN}"
echo "  🃏  200 Card Game"
echo "────────────────────────────────────────"
echo -e "${NC}"

# ── Check Node.js ─────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo "❌  Node.js not found. Install it from https://nodejs.org (v18+)"
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌  Node.js v18+ required (found v$NODE_VER). Please upgrade."
  exit 1
fi

echo -e "${GREEN}✅  Node.js $(node --version)${NC}"

# ── Install dependencies if needed ───────────────────────────
if [ ! -d "$SERVER/node_modules" ]; then
  echo -e "${YELLOW}📦  Installing server dependencies…${NC}"
  cd "$SERVER" && npm install
fi

if [ ! -d "$CLIENT/node_modules" ]; then
  echo -e "${YELLOW}📦  Installing client dependencies…${NC}"
  cd "$CLIENT" && npm install
fi

echo ""
echo -e "${GREEN}🚀  Starting servers…${NC}"
echo -e "   Server → ${CYAN}http://localhost:3001${NC}"
echo -e "   Client → ${CYAN}http://localhost:5173${NC}"
echo ""
echo "Press Ctrl+C to stop both servers."
echo "────────────────────────────────────────"

# ── Launch both in parallel ───────────────────────────────────
cd "$SERVER" && npm run dev &
SERVER_PID=$!

cd "$CLIENT" && npm run dev &
CLIENT_PID=$!

# ── Wait and clean up on Ctrl+C ──────────────────────────────
trap "echo ''; echo 'Shutting down…'; kill $SERVER_PID $CLIENT_PID 2>/dev/null; exit 0" SIGINT SIGTERM

wait $SERVER_PID $CLIENT_PID
