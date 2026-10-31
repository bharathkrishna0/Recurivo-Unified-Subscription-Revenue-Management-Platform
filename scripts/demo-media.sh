#!/usr/bin/env bash
# Regenerates the README screenshots (docs/screenshots) and walkthrough video (docs/media).
# Needs: a freshly migrated and seeded, otherwise empty database in DATABASE_URL, the app
# running against it (`npm run build && npm run start`), and ffmpeg on PATH.
#   DATABASE_URL=... E2E_BASE_URL=http://localhost:3000 scripts/demo-media.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?set DATABASE_URL to the demo database}"
export DEMO=1 E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3000}"
pw() { npx playwright test tests/e2e/demo.spec.ts --reporter=line "$@"; }

DEMO_DATA=subscriptions pw -g "demo subscriptions"
npx tsx --tsconfig tsconfig.json scripts/demo-billing.ts
DEMO_DATA=payments pw -g "demo payments"
pw -g "README screenshots"
rm -rf test-results/demo-video
pw -g "README walkthrough video"

webm="$(ls -t test-results/demo-video/*.webm | head -1)"
mkdir -p docs/media
ffmpeg -loglevel error -y -i "$webm" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an docs/media/recurivo-demo.mp4
ffmpeg -loglevel error -y -i "$webm" -vf "fps=6,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" docs/media/recurivo-demo.gif
ls -lh docs/media
