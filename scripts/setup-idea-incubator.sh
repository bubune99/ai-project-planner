#!/bin/bash
# ============================================================
# Setup Idea Incubator with Consolidated Database
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
IDEA_INCUBATOR_DIR="$PROJECT_ROOT/apps/idea-incubator"

echo "Setting up Idea Incubator with consolidated database..."

# Check if main .env exists
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    echo "Error: Main project .env file not found at $PROJECT_ROOT/.env"
    echo "Please create the .env file with DATABASE_URL and Stack Auth credentials first."
    exit 1
fi

# Create symlink to main .env
echo "Creating symlink to main project .env..."
cd "$IDEA_INCUBATOR_DIR"

if [ -L ".env" ]; then
    echo "Symlink already exists, removing..."
    rm .env
fi

if [ -f ".env" ]; then
    echo "Backing up existing .env to .env.backup..."
    mv .env .env.backup
fi

ln -sf ../../.env .env
echo "Symlink created: .env -> ../../.env"

# Verify the symlink works
if [ -f ".env" ] && grep -q "DATABASE_URL" .env; then
    echo "Verified: DATABASE_URL is accessible"
else
    echo "Warning: Could not verify DATABASE_URL in linked .env"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

echo ""
echo "Setup complete!"
echo ""
echo "The idea-incubator now uses the consolidated database from the main project."
echo ""
echo "To run idea-incubator:"
echo "  cd apps/idea-incubator && pnpm dev"
echo ""
echo "Or from project root:"
echo "  pnpm --filter idea-incubator dev"
