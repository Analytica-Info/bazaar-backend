#!/bin/bash
set -e

# =========================================================================
# Bazaar Backend Deploy
#
# Runs as plain Node process (same as previous Mobile API deployment)
# Upload code via git pull or WinSCP, then run this script.
#
# Usage (on VPS):
#   ./deploy.sh test                     # Start test server (port 5050)
#   ./deploy.sh prod                     # Start prod server (port 5051)
#   ./deploy.sh test feat/shipping       # Checkout branch, start test
# =========================================================================

ENV=${1:-prod}
BRANCH=${2:-main}

if [ "$ENV" = "prod" ]; then
  BRANCH="main"
fi

echo "========================================="
echo "  Bazaar Backend — $ENV"
echo "  Branch: $BRANCH"
echo "========================================="

cd /home/bazaar-backend

# Pull latest code if git is available
if [ -d ".git" ]; then
  echo "→ Pulling $BRANCH..."
  git fetch origin
  git checkout $BRANCH
  git pull origin $BRANCH
fi

# Install dependencies
echo "→ Installing dependencies..."
npm install --production

# Stop existing process
echo "→ Stopping existing process..."
if [ "$ENV" = "test" ]; then
  pkill -f "node.*server.js.*env.test" 2>/dev/null || true
elif [ "$ENV" = "prod" ]; then
  pkill -f "node.*server.js.*\.env$" 2>/dev/null || true
fi
sleep 2

# Start server
if [ "$ENV" = "test" ]; then
  echo "→ Starting TEST server (port 5050)..."
  ENV_FILE=.env.test nohup node -e "
    require('dotenv').config({ path: '.env.test' });
    process.env.PORT = process.env.PORT || '5050';
    require('./src/server.js');
  " > logs/test-server.log 2>&1 &
  echo $! > .pid.test
  echo "  PID: $(cat .pid.test)"

elif [ "$ENV" = "prod" ]; then
  echo "→ Starting PRODUCTION server (port 5051)..."
  nohup node -e "
    require('dotenv').config({ path: '.env' });
    process.env.PORT = process.env.PORT || '5051';
    require('./src/server.js');
  " > logs/prod-server.log 2>&1 &
  echo $! > .pid.prod
  echo "  PID: $(cat .pid.prod)"

  echo "→ Starting CRON worker..."
  nohup node -e "
    require('dotenv').config({ path: '.env' });
    require('./src/scripts/cronWorker.js');
  " > logs/cron.log 2>&1 &
  echo $! > .pid.cron
  echo "  PID: $(cat .pid.cron)"
fi

# Health check
echo ""
echo "→ Health check..."
sleep 4
if [ "$ENV" = "test" ]; then
  PORT=5050
else
  PORT=5051
fi
curl -s http://localhost:$PORT/health || echo "Still starting..."

echo ""
echo "✓ Backend deploy complete — $(date)"
echo ""
echo "Logs: tail -f logs/${ENV}-server.log"
