#!/bin/bash
set -e

# Usage:
#   ./deploy.sh              # Deploy production
#   ./deploy.sh test         # Deploy test
#   ./deploy.sh all          # Deploy both

ENV=${1:-prod}
BRANCH="feat/unified-backend"

echo "========================================="
echo "  Bazaar Backend Deploy — $ENV"
echo "========================================="

cd /var/www/bazaar-backend

echo "→ Pulling latest code..."
git pull origin $BRANCH

echo "→ Installing dependencies..."
npm install --production

echo "→ Validating paths..."
npm run validate

if [ "$ENV" = "test" ] || [ "$ENV" = "all" ]; then
  echo "→ Restarting TEST API (port 5001)..."
  pm2 restart bazaar-api-test --update-env 2>/dev/null || pm2 start start-test.js --name bazaar-api-test
  echo "✓ Test API restarted"
fi

if [ "$ENV" = "prod" ] || [ "$ENV" = "all" ]; then
  echo "→ Restarting PRODUCTION API (port 5000)..."
  pm2 restart bazaar-api-prod --update-env 2>/dev/null || pm2 start src/server.js --name bazaar-api-prod
  echo "→ Restarting CRON worker..."
  pm2 restart bazaar-cron --update-env 2>/dev/null || pm2 start src/scripts/cronWorker.js --name bazaar-cron
  echo "✓ Production API + Cron restarted"
fi

pm2 save

echo ""
echo "→ Health check..."
sleep 3
if [ "$ENV" = "test" ] || [ "$ENV" = "all" ]; then
  echo "  Test:  $(curl -s http://localhost:5001/health 2>/dev/null | head -c 80)"
fi
if [ "$ENV" = "prod" ] || [ "$ENV" = "all" ]; then
  echo "  Prod:  $(curl -s http://localhost:5000/health 2>/dev/null | head -c 80)"
fi

echo ""
echo "✓ Backend deploy complete — $(date)"
