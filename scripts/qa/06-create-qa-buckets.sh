#!/usr/bin/env bash
# =====================================================================
# 06-create-qa-buckets.sh — QA-ONLY bucket creation via the Storage API
# =====================================================================
# Creates the two ReplyFlow buckets EMPTY via the Supabase Storage
# Management API (POST/PUT /storage/v1/bucket), never by inserting into
# storage.buckets directly. Idempotent: existing buckets are updated in
# place, missing ones are created.
#
#   ./scripts/qa/06-create-qa-buckets.sh            # prompts for creds
#   ./scripts/qa/06-create-qa-buckets.sh --check    # verify only, no writes
#
# Credentials are prompted WITHOUT echo, held only in memory, and cleared
# on exit. The QA project ref must match .temp/project-ref.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

QA_REF_FILE=".temp/project-ref"
EXPECTED_QA_REF="ixtifohdqhtvhhessgaj"
PROD_REF="bqummccorpfihatocffl"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

say()  { printf '%s\n' "$*"; }
fail() { printf 'ABORT: %s\n' "$*" >&2; exit 1; }

# ---- Guard 1: linked project must be QA ---------------------------------
[ -f "$QA_REF_FILE" ] || fail "no $QA_REF_FILE — worktree not linked. Run: supabase link --project-ref $EXPECTED_QA_REF"
LINKED_REF=$(tr -d '[:space:]' < "$QA_REF_FILE")
[ "$LINKED_REF" = "$PROD_REF" ] && fail "linked to PRODUCTION ($PROD_REF) — refusing."
[ "$LINKED_REF" = "$EXPECTED_QA_REF" ] || fail "linked ref '$LINKED_REF' != expected QA ref '$EXPECTED_QA_REF'. Relink first."
say "link verified: QA project $LINKED_REF"

# ---- Guard 2: QA URL host validation ------------------------------------
QA_URL="${RF_QA_URL:-}"
if [ -z "$QA_URL" ]; then
  QA_URL="https://${LINKED_REF}.supabase.co"
fi
case "$QA_URL" in
  "https://${EXPECTED_QA_REF}.supabase.co"|"https://${EXPECTED_QA_REF}.supabase.co/") ;;
  *"$PROD_REF"*) fail "URL references PRODUCTION ref — refusing." ;;
  *) fail "unexpected QA URL host (must be https://${EXPECTED_QA_REF}.supabase.co): host check failed" ;;
esac
say "endpoint verified: https://${EXPECTED_QA_REF}.supabase.co (host only — no credentials logged)"

# ---- Credentials: prompt without echo, memory-only ----------------------
read -s -p "QA service_role key (input hidden): " QA_SERVICE_KEY < /dev/tty
echo
: "${QA_SERVICE_KEY:?empty key}"
trap 'unset QA_SERVICE_KEY' EXIT

CURL=(curl -sS -o /tmp/rf_bucket_resp.json -w "%{http_code}"
  -H "Authorization: Bearer ${QA_SERVICE_KEY}"
  -H "apikey: ${QA_SERVICE_KEY}"
  -H "Content-Type: application/json")

bucket_exists() {
  local code
  code=$("${CURL[@]}" "${QA_URL%/}/storage/v1/bucket/$1" 2>/dev/null || echo 000)
  [ "$code" = "200" ]
}

upsert_bucket() {
  local id="$1" public="$2" limit="$3" mimes="$4" code body
  body=$(printf '{"id":"%s","name":"%s","public":%s,"file_size_limit":%s,"allowed_mime_types":[%s]}' \
    "$id" "$id" "$public" "$limit" "$mimes")
  if bucket_exists "$id"; then
    if [ "$CHECK_ONLY" = "1" ]; then say "check: bucket '$id' exists"; return 0; fi
    code=$("${CURL[@]}" -X PUT "${QA_URL%/}/storage/v1/bucket/$id" -d "$body")
    [ "$code" = "200" ] || fail "PUT bucket '$id' returned HTTP $code"
    say "updated bucket: $id"
  else
    if [ "$CHECK_ONLY" = "1" ]; then say "check: bucket '$id' MISSING (would create)"; return 0; fi
    code=$("${CURL[@]}" -X POST "${QA_URL%/}/storage/v1/bucket" -d "$body")
    [ "$code" = "200" ] || fail "POST bucket '$id' returned HTTP $code: $(grep -oE '"message":"[^"]*"' /tmp/rf_bucket_resp.json | head -1)"
    say "created bucket: $id"
  fi
}

# ---- Bucket definitions (reviewed configuration) ------------------------
# business-logos: public CDN read (customer-facing documents), 2 MB images
upsert_bucket "business-logos" "true" "2097152" '"image/png","image/jpeg","image/webp"'
# mms-media: private, service-role upload + signed/token-URL serve, 5 MB,
# MIME set = every value src/lib/mime-detection.ts can emit
upsert_bucket "mms-media" "false" "5242880" '"image/jpeg","image/jpg","image/png","image/gif","image/bmp","image/webp","video/mp4","video/mpeg","application/pdf","text/csv","text/plain","application/octet-stream"'

rm -f /tmp/rf_bucket_resp.json
if [ "$CHECK_ONLY" = "1" ]; then
  say "check complete — no writes performed."
else
  say "done — verifying read-back:"
  code=$("${CURL[@]}" "${QA_URL%/}/storage/v1/bucket")
  say "bucket list HTTP $code — $(grep -oE '"name":"[a-z-]+"' /tmp/rf_bucket_resp.json | tr '\n' ' ')"
  rm -f /tmp/rf_bucket_resp.json
fi
