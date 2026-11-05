#!/usr/bin/env bash
# Sets every GitHub Actions secret and variable the APK workflow needs, from a local env file that never leaves your PC.
# 1. gh auth login   (GitHub CLI, once)
# 2. cp scripts/github-secrets.env.example scripts/github-secrets.env  and fill the blanks
# 3. bash scripts/github-secrets.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=scripts/github-secrets.env
[ -f "$ENV_FILE" ] || { echo "Create $ENV_FILE from scripts/github-secrets.env.example first"; exit 1; }
set -a; . "$ENV_FILE"; set +a
REPO=${REPO:-KenhighRDS/J}
[ -f android/app/google-services.json ] || { echo "android/app/google-services.json is missing (download it from Firebase)"; exit 1; }
[ -f "${ANDROID_KEYSTORE_FILE:-}" ] || { echo "Keystore not found at ${ANDROID_KEYSTORE_FILE:-<unset>} (see SETUP.md section 5)"; exit 1; }
for v in ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD RELEASES_TOKEN \
         VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID \
         VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID VITE_FIREBASE_VAPID_KEY; do
  [ -n "${!v:-}" ] || { echo "$v is empty in $ENV_FILE"; exit 1; }
  gh secret set "$v" --repo "$REPO" --body "${!v}"
done
{ base64 -w0 "$ANDROID_KEYSTORE_FILE" 2>/dev/null || base64 "$ANDROID_KEYSTORE_FILE" | tr -d '\n'; } | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$REPO"
gh secret set GOOGLE_SERVICES_JSON --repo "$REPO" < android/app/google-services.json
gh variable set RELEASES_REPO --repo "$REPO" --body "${RELEASES_REPO:-KenhighRDS/j-releases}"
gh variable set SITE_URL --repo "$REPO" --body "${SITE_URL:-https://j-signals.netlify.app}"
echo "Done: 15 secrets and 2 variables set on $REPO. Next: push a commit whose message contains [apk]."
