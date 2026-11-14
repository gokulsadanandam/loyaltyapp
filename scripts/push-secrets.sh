#!/usr/bin/env bash
# Push production secrets from .env.deploy to GitHub Actions and Vercel.
#
#   cp .env.deploy.example .env.deploy   # fill it in
#   bash scripts/push-secrets.sh         # needs: gh auth login, npx vercel login + link
#
# Values are piped over stdin, never passed as arguments or printed.
set -euo pipefail

cd "$(dirname "$0")/.."
FILE=.env.deploy

[[ -f $FILE ]] || { echo "Missing $FILE (copy .env.deploy.example)"; exit 1; }
command -v gh >/dev/null || { echo "Install the GitHub CLI: winget install GitHub.cli, then gh auth login"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }
[[ -f .vercel/project.json ]] || { echo "Run: npx vercel link"; exit 1; }

rand() { node -e "process.stdout.write(require('crypto').randomBytes($1).toString('hex'))"; }

# Generate missing app secrets once and persist them, so reruns stay consistent.
for pair in CRON_SECRET:24 QR_HMAC_SECRET:32; do
  name=${pair%%:*}
  if ! grep -qE "^$name=.+" "$FILE"; then
    value=$(rand "${pair##*:}")
    if grep -qE "^$name=" "$FILE"; then
      sed -i "s|^$name=.*|$name=$value|" "$FILE"
    else
      printf '%s=%s\n' "$name" "$value" >>"$FILE"
    fi
    echo "Generated $name"
  fi
done

set -a
# shellcheck disable=SC1090
source "$FILE"
set +a

VERCEL_ORG_ID=$(node -p "require('./.vercel/project.json').orgId")
VERCEL_PROJECT_ID=$(node -p "require('./.vercel/project.json').projectId")
PRODUCTION_URL=${PRODUCTION_URL%/}
SUPABASE_URL="https://${SUPABASE_PROJECT_REF}.supabase.co"

missing=()
for v in SUPABASE_PROJECT_REF SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD \
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY VERCEL_TOKEN \
  PRODUCTION_URL EMAIL_FROM CRON_SECRET QR_HMAC_SECRET; do
  [[ -n ${!v:-} ]] || missing+=("$v")
done
((${#missing[@]} == 0)) || { echo "Fill in: ${missing[*]}"; exit 1; }

# Guard against pasting the local Docker defaults.
[[ $SUPABASE_SECRET_KEY == sb_secret_N7UND0U* ]] && { echo "SUPABASE_SECRET_KEY is the local Docker key, not production"; exit 1; }
[[ $SUPABASE_ACCESS_TOKEN == sbp_* ]] || { echo "SUPABASE_ACCESS_TOKEN should start with sbp_"; exit 1; }
[[ $PRODUCTION_URL == https://* ]] || { echo "PRODUCTION_URL must start with https://"; exit 1; }

echo "== GitHub ($(gh repo view --json nameWithOwner -q .nameWithOwner))"
for name in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_REF \
  VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID CRON_SECRET; do
  printf '%s' "${!name}" | gh secret set "$name"
done
gh variable set PRODUCTION_URL --body "$PRODUCTION_URL"

echo "== Vercel (production)"
vercel_set() {
  npx --yes vercel env rm "$1" production --yes --token "$VERCEL_TOKEN" >/dev/null 2>&1 || true
  printf '%s' "$2" | npx --yes vercel env add "$1" production --token "$VERCEL_TOKEN" >/dev/null
  echo "✓ $1"
}
vercel_set NEXT_PUBLIC_SUPABASE_URL "$SUPABASE_URL"
vercel_set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
vercel_set NEXT_PUBLIC_SITE_URL "$PRODUCTION_URL"
vercel_set SUPABASE_SECRET_KEY "$SUPABASE_SECRET_KEY"
vercel_set CRON_SECRET "$CRON_SECRET"
vercel_set QR_HMAC_SECRET "$QR_HMAC_SECRET"
vercel_set EMAIL_FROM "$EMAIL_FROM"
if [[ -n ${RESEND_API_KEY:-} ]]; then
  vercel_set RESEND_API_KEY "$RESEND_API_KEY"
else
  echo "- RESEND_API_KEY not set: notification emails stay off (in-app only) until you add it"
fi

echo
echo "Done. Next: GitHub → Actions → CI / Deploy → Run workflow (master)."
echo "Then delete $FILE: rm $FILE"
