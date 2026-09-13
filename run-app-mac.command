#!/bin/zsh
set -e

APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_ROOT"

echo "Starting MyCart..."

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 18+ and npm are required. Install Node.js and run this script again."
  read "?Press Enter to exit"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing Node dependencies..."
  npm install
fi

PYTHON_BOOTSTRAP=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BOOTSTRAP="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BOOTSTRAP="python"
else
  echo "Python 3.10+ was not found. Install Python and run this script again."
  read "?Press Enter to exit"
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  echo "Creating the project Python environment..."
  "$PYTHON_BOOTSTRAP" -m venv .venv
fi

echo "Checking Scrapling..."
if ! .venv/bin/python -c "from scrapling.fetchers import Fetcher, StealthyFetcher" >/dev/null 2>&1; then
  .venv/bin/python -m pip install -r requirements.txt
fi

if [ ! -f ".venv/.scrapling-browser-ready" ]; then
  echo "Installing Scrapling's browser runtime..."
  .venv/bin/scrapling install
  touch .venv/.scrapling-browser-ready
fi

if command -v redis-cli >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1 && brew services list 2>/dev/null | grep -q '^redis'; then
    echo "Starting Redis with Homebrew..."
    brew services start redis >/dev/null
  elif command -v redis-server >/dev/null 2>&1; then
    echo "Starting Redis..."
    redis-server --daemonize yes
  fi
fi

echo "Preparing database..."
node createdb.js

if [ ! -f ".next/BUILD_ID" ]; then
  echo "Building production app..."
  npm run build
fi

echo ""
echo "MyCart will open at http://localhost:3027"
echo "Keep this window open while using the app."
echo ""

npm run start
