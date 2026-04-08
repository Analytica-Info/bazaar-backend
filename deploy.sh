#!/bin/bash
set -e

# Usage:
#   ./deploy.sh prod                    Deploy main to production (port 5051)
#   ./deploy.sh test                    Deploy main to test (port 5050)
#   ./deploy.sh test feat/shipping      Deploy feat/shipping to test
#   ./deploy.sh all                     Deploy both (main)
#   ./deploy.sh all feat/new-feature    Test: feature branch, Prod: main

ENV=${1:-prod}
TEST_BRANCH=${2:-main}
PROD_BRANCH="main"
PROJECT_DIR="/home/bazaar-backend"

echo "========================================="
echo "  Bazaar Backend Deploy — $ENV"
if [ "$ENV" = "test" ] || [ "$ENV" = "all" ]; then
  echo "  Test branch:  $TEST_BRANCH"
fi
if [ "$ENV" = "prod" ] || [ "$ENV" = "all" ]; then
  echo "  Prod branch:  $PROD_BRANCH (always main)"
fi
echo "========================================="

cd $PROJECT_DIR
git fetch origin

if [ "$ENV" = "test" ]; then
  echo "→ Checking out $TEST_BRANCH..."
  git checkout $TEST_BRANCH
  git pull origin $TEST_BRANCH
  echo "→ Building and starting TEST API (port 5050)..."
  docker compose build api-test
  docker compose up -d api-test
  echo "✓ Test API deployed"

elif [ "$ENV" = "prod" ]; then
  echo "→ Checking out $PROD_BRANCH..."
  git checkout $PROD_BRANCH
  git pull origin $PROD_BRANCH
  echo "→ Building and starting PRODUCTION API (port 5051)..."
  docker compose build api-prod cron
  docker compose up -d api-prod cron
  echo "✓ Production API + Cron deployed"

elif [ "$ENV" = "all" ]; then
  echo ""
  echo "── TEST ($TEST_BRANCH) ──"
  git checkout $TEST_BRANCH
  git pull origin $TEST_BRANCH
  docker compose build api-test
  docker compose up -d api-test
  echo "✓ Test API deployed"

  echo ""
  echo "── PRODUCTION ($PROD_BRANCH) ──"
  git checkout $PROD_BRANCH
  git pull origin $PROD_BRANCH
  docker compose build api-prod cron
  docker compose up -d api-prod cron
  echo "✓ Production API + Cron deployed"

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
sleep 5
if [ "$ENV" = "test" ] || [ "$ENV" = "all" ]; then
  echo "  Test (5050):  $(curl -s http://localhost:5050/health 2>/dev/null | head -c 80)"
fi
if [ "$ENV" = "prod" ] || [ "$ENV" = "all" ]; then
  echo "  Prod (5051):  $(curl -s http://localhost:5051/health 2>/dev/null | head -c 80)"
fi

echo ""
echo "→ Running containers:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep bazaar-backend || true
echo ""
echo "✓ Backend deploy complete — $(date)"
