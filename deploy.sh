#!/bin/bash
set -e

# Usage:
#   ./deploy.sh                          # Deploy production (always main)
#   ./deploy.sh test                     # Deploy test (default: main)
#   ./deploy.sh test feat/shipping       # Deploy test from specific branch
#   ./deploy.sh all                      # Both (main for prod, main for test)
#   ./deploy.sh all feat/new-feature     # Both (main for prod, feature branch for test)

ENV=${1:-prod}
TEST_BRANCH=${2:-main}
PROD_BRANCH="main"

echo "========================================="
echo "  Bazaar Backend Deploy — $ENV"
if [ "$ENV" = "test" ] || [ "$ENV" = "all" ]; then
  echo "  Test branch:  $TEST_BRANCH"
fi
if [ "$ENV" = "prod" ] || [ "$ENV" = "all" ]; then
  echo "  Prod branch:  $PROD_BRANCH (always main)"
fi
echo "========================================="

cd /var/www/bazaar-backend
git fetch origin

if [ "$ENV" = "test" ]; then
  echo "→ Checking out $TEST_BRANCH..."
  git checkout $TEST_BRANCH
  git pull origin $TEST_BRANCH
  echo "→ Installing dependencies..."
  npm install --production
  echo "→ Validating..."
  npm run validate
  echo "→ Restarting TEST API (port 5001)..."
  pm2 restart bazaar-api-test --update-env 2>/dev/null || pm2 start start-test.js --name bazaar-api-test
  pm2 save
  echo "✓ Test API restarted"

elif [ "$ENV" = "prod" ]; then
  echo "→ Checking out $PROD_BRANCH..."
  git checkout $PROD_BRANCH
  git pull origin $PROD_BRANCH
  echo "→ Installing dependencies..."
  npm install --production
  echo "→ Validating..."
  npm run validate
  echo "→ Restarting PRODUCTION API (port 5000)..."
  pm2 restart bazaar-api-prod --update-env 2>/dev/null || pm2 start src/server.js --name bazaar-api-prod
  echo "→ Restarting CRON worker..."
  pm2 restart bazaar-cron --update-env 2>/dev/null || pm2 start src/scripts/cronWorker.js --name bazaar-cron
  pm2 save
  echo "✓ Production API + Cron restarted"

elif [ "$ENV" = "all" ]; then
  echo ""
  echo "── TEST ($TEST_BRANCH) ──"
  git checkout $TEST_BRANCH
  git pull origin $TEST_BRANCH
  npm install --production
  npm run validate
  pm2 restart bazaar-api-test --update-env 2>/dev/null || pm2 start start-test.js --name bazaar-api-test
  echo "✓ Test API restarted"

  echo ""
  echo "── PRODUCTION ($PROD_BRANCH) ──"
  git checkout $PROD_BRANCH
  git pull origin $PROD_BRANCH
  npm install --production
  npm run validate
  pm2 restart bazaar-api-prod --update-env 2>/dev/null || pm2 start src/server.js --name bazaar-api-prod
  pm2 restart bazaar-cron --update-env 2>/dev/null || pm2 start src/scripts/cronWorker.js --name bazaar-cron
  pm2 save
  echo "✓ Production API + Cron restarted"

else
  echo "Usage: ./deploy.sh [prod|test|all] [test-branch]"
  echo ""
  echo "  ./deploy.sh prod                    Deploy main to production"
  echo "  ./deploy.sh test                    Deploy main to test"
  echo "  ./deploy.sh test feat/shipping      Deploy feat/shipping to test"
  echo "  ./deploy.sh all                     Deploy main to both"
  echo "  ./deploy.sh all feat/new-feature    Deploy feat/new-feature to test, main to prod"
  exit 1
fi

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
