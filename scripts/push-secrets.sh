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
# Terminals opened before `winget install GitHub.cli` don't have it on PATH yet.
if ! command -v gh >/dev/null && [[ -x "/c/Program Files/GitHub CLI/gh.exe" ]]; then
  PATH="$PATH:/c/Program Files/GitHub CLI"
fi
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

# Local CLI, never npx: npx echoes the full command line.
VERCEL_BIN=node_modules/.bin/vercel
[[ -x $VERCEL_BIN ]] || { echo "Run npm install first"; exit 1; }
# The CLI prefers a VERCEL_TOKEN env var over your login, and .env.deploy just exported one.
VERCEL=(env -u VERCEL_TOKEN "$VERCEL_BIN")
"${VERCEL[@]}" whoami >/dev/null 2>&1 || { echo "Run: npx vercel login"; exit 1; }
# The token CI will use must reach this project (scope = the team the project lives in).
if ! out=$(env -u VERCEL_TOKEN "$VERCEL_BIN" project inspect "$VERCEL_PROJECT_ID" \
  --scope "$VERCEL_ORG_ID" --token "$VERCEL_TOKEN" 2>&1); then
  echo "VERCEL_TOKEN can't access this project:"
  printf '%s\n' "$out" | grep -E '"(code|message)"|^Error' | head -3
  echo "Recreate it at vercel.com/account/settings/tokens with Scope set to the team that"
  echo "owns loyalty-web, then update .env.deploy."
  exit 1
fi

echo "== GitHub ($(gh repo view --json nameWithOwner -q .nameWithOwner))"
for name in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_REF \
  VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID CRON_SECRET; do
  printf '%s' "${!name}" | gh secret set "$name"
done
gh variable set PRODUCTION_URL --body "$PRODUCTION_URL"

echo "== Vercel (production, via your vercel login)"
# Uses your own CLI login, not VERCEL_TOKEN (that one is only for CI). --no-sensitive keeps
# values readable by `vercel pull` in CI; they are still encrypted at rest.
vercel_set() {
  printf '%s' "$2" | "${VERCEL[@]}" env add "$1" --environment production --force --no-sensitive >/dev/null
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
