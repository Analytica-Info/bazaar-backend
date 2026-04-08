#!/bin/bash
set -e

# =========================================================================
# Bazaar Backend Deploy Script
# =========================================================================
#
# METHOD 1 — Run ON the VPS (git pull):
#   ./deploy.sh prod
#   ./deploy.sh test feat/shipping
#   ./deploy.sh all feat/new-feature
#
# METHOD 2 — Run FROM your LOCAL machine (rsync upload):
#   ./deploy.sh prod --push
#   ./deploy.sh test --push
#   ./deploy.sh test feat/shipping --push
#   ./deploy.sh all --push
#
# Production always deploys main branch.
# Test branch is configurable (defaults to main).
# =========================================================================

ENV=${1:-prod}
PUSH_MODE=false
TEST_BRANCH="main"
PROD_BRANCH="main"

# Parse arguments
for arg in "$@"; do
  case $arg in
    --push) PUSH_MODE=true ;;
    prod|test|all) ENV=$arg ;;
    *) TEST_BRANCH=$arg ;;
  esac
done

# VPS config — update these
VPS_USER="root"
VPS_HOST="89.116.33.22"
VPS_PATH="/home/bazaar-backend"

echo "========================================="
echo "  Bazaar Backend Deploy — $ENV"
echo "  Mode: $([ "$PUSH_MODE" = true ] && echo 'PUSH (local → VPS)' || echo 'PULL (git on VPS)')"
if [ "$ENV" = "test" ] || [ "$ENV" = "all" ]; then
  echo "  Test branch:  $TEST_BRANCH"
fi
if [ "$ENV" = "prod" ] || [ "$ENV" = "all" ]; then
  echo "  Prod branch:  $PROD_BRANCH (always main)"
fi
echo "========================================="

# ─────────────────────────────────────────────
# METHOD 2: Push from local machine via rsync
# ─────────────────────────────────────────────
if [ "$PUSH_MODE" = true ]; then
  LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

  push_and_deploy() {
    local branch=$1
    local env_file=$2
    local services=$3

    echo "→ Checking out $branch locally..."
    git -C "$LOCAL_DIR" fetch origin
    git -C "$LOCAL_DIR" checkout $branch
    git -C "$LOCAL_DIR" pull origin $branch

    echo "→ Uploading to VPS ($VPS_HOST:$VPS_PATH)..."
    rsync -avz --delete \
      --exclude='node_modules' \
      --exclude='.git' \
      --exclude='uploads' \
      --exclude='temp' \
      --exclude='.env' \
      --exclude='.env.test' \
      --exclude='.env.production' \
      "$LOCAL_DIR/" "$VPS_USER@$VPS_HOST:$VPS_PATH/"

    echo "→ Building and restarting on VPS..."
    ssh "$VPS_USER@$VPS_HOST" "cd $VPS_PATH && docker compose build $services && docker compose up -d $services"
  }

  if [ "$ENV" = "test" ]; then
    push_and_deploy "$TEST_BRANCH" ".env.test" "api-test"
  elif [ "$ENV" = "prod" ]; then
    push_and_deploy "$PROD_BRANCH" ".env" "api-prod cron"
  elif [ "$ENV" = "all" ]; then
    push_and_deploy "$TEST_BRANCH" ".env.test" "api-test"
    push_and_deploy "$PROD_BRANCH" ".env" "api-prod cron"
  fi

  echo ""
  echo "→ Health check..."
  sleep 5
  if [ "$ENV" = "test" ] || [ "$ENV" = "all" ]; then
    echo "  Test (5050):  $(ssh $VPS_USER@$VPS_HOST 'curl -s http://localhost:5050/health 2>/dev/null | head -c 80')"
  fi
  if [ "$ENV" = "prod" ] || [ "$ENV" = "all" ]; then
    echo "  Prod (5051):  $(ssh $VPS_USER@$VPS_HOST 'curl -s http://localhost:5051/health 2>/dev/null | head -c 80')"
  fi

  echo ""
  echo "✓ Backend deploy complete (push mode) — $(date)"
  exit 0
fi

# ─────────────────────────────────────────────
# METHOD 1: Pull on VPS via git
# ─────────────────────────────────────────────
cd "$VPS_PATH" 2>/dev/null || { echo "ERROR: $VPS_PATH not found. Are you running this on the VPS?"; exit 1; }
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
  echo "Usage:"
  echo ""
  echo "  ON VPS (git pull):"
  echo "    ./deploy.sh prod                    Deploy main to production"
  echo "    ./deploy.sh test                    Deploy main to test"
  echo "    ./deploy.sh test feat/shipping      Deploy feat/shipping to test"
  echo "    ./deploy.sh all                     Deploy main to both"
  echo ""
  echo "  FROM LOCAL (rsync push):"
  echo "    ./deploy.sh prod --push             Push main to production"
  echo "    ./deploy.sh test --push             Push main to test"
  echo "    ./deploy.sh test feat/shipping --push"
  echo "    ./deploy.sh all --push              Push both"
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
