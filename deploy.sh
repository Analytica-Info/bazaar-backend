#!/bin/bash
set -e

# =========================================================================
# Bazaar Backend Deploy
#
# Hostinger manages the Node process automatically.
# Just pull code and install deps — Hostinger restarts the app.
#
# Usage (on VPS):
#   ./deploy.sh                          # Pull main branch
#   ./deploy.sh feat/shipping            # Pull specific branch
# =========================================================================

BRANCH=${1:-main}

echo "========================================="
echo "  Bazaar Backend Deploy"
echo "  Branch: $BRANCH"
echo "========================================="

# Pull latest code
if [ -d ".git" ]; then
  echo "→ Pulling $BRANCH..."
  git fetch origin
  git checkout $BRANCH
  git pull origin $BRANCH
fi

# Install dependencies
echo "→ Installing dependencies..."
npm install --production

echo ""
echo "✓ Code updated. Hostinger will restart the app automatically."
echo "  If it doesn't restart, go to Hostinger panel → Website → Node.js → Restart"
echo ""
echo "  Check health: curl http://localhost:\$PORT/health"
echo "  Check logs:   tail -f logs/server.log (if configured)"
echo ""
echo "  Completed at: $(date)"
