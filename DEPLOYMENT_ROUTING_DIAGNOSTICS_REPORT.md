# PRODUCTION PROVISIONING — DEPLOYMENT ROUTING DIAGNOSTICS FINAL REPORT

## 1. DIAGNOSTICS ADDED

**CONFIRMED** ✓

Added minimal safe runtime diagnostics to:

### Stripe Webhook (Caller)
- **File:** `src/app/api/stripe/webhook/route.ts`
- **Location 1:** Before calling trigger-provisioning (checkout.session.completed branch)
- **Location 2:** Before calling trigger-provisioning (payment recovery branch)
- **Log marker:** `[PROVISIONING CALLER IDENTITY]`
- **Logged fields:**
  - marker: 'PROVISIONING_CALLER_IDENTITY'
  - businessId
  - appUrlHostname (from NEXT_PUBLIC_APP_URL)
  - supabaseHostname (from NEXT_PUBLIC_SUPABASE_URL)
  - deploymentUrl (from VERCEL_URL or NEXT_PUBLIC_APP_URL)
  - vercelEnv (from VERCEL_ENV)
  - gitCommitSha (from VERCEL_GIT_COMMIT_SHA)
- **Response header logging:** Logs callee response headers after fetch
  - x-replyflow-vercel-env
  - x-replyflow-git-sha
  - x-replyflow-supabase-host

### Trigger-Providing (Callee)
- **File:** `src/app/api/business/trigger-provisioning/route.ts`
- **Location:** At endpoint start, before business lookup
- **Log marker:** `[PROVISIONING CALLEE IDENTITY]`
- **Logged fields:**
  - marker: 'PROVISIONING_CALLEE_IDENTITY'
  - businessIdRaw
  - businessIdTrimmed
  - businessIdLength
  - validUuid (boolean)
  - supabaseHostname (from NEXT_PUBLIC_SUPABASE_URL)
  - deploymentUrl (from VERCEL_URL or NEXT_PUBLIC_APP_URL)
  - vercelEnv (from VERCEL_ENV)
  - gitCommitSha (from VERCEL_GIT_COMMIT_SHA)

### ID-Only Control Query
- **File:** `src/app/api/business/trigger-provisioning/route.ts`
- **Location:** Inside business lookup retry loop, before production query
- **Log marker:** `[PROVISIONING ID-ONLY LOOKUP]`
- **Query:** `supabaseAdmin.from('businesses').select('id').eq('id', businessIdTrimmed).maybeSingle()`
- **Logged fields:**
  - marker: 'PROVISIONING_ID_ONLY_LOOKUP'
  - businessId (trimmed)
  - dataFound (boolean)
  - returnedId
  - errorCode
  - errorMessage

### Existing Lookup Diagnostics
- **File:** `src/app/api/business/trigger-provisioning/route.ts`
- **Location:** After production business query
- **Log marker:** `[PROVISIONING EXISTING LOOKUP]`
- **Logged fields:**
  - marker: 'PROVISIONING_EXISTING_LOOKUP'
  - businessId (trimmed)
  - dataFound (boolean)
  - returnedId
  - errorCode
  - errorMessage
  - errorDetails

### Response Headers
- **File:** `src/app/api/business/trigger-provisioning/route.ts`
- **Locations:** 404 response and success response
- **Headers added:**
  - x-replyflow-vercel-env
  - x-replyflow-git-sha
  - x-replyflow-supabase-host

## 2. FILES CHANGED

**CONFIRMED** ✓

1. `src/app/api/stripe/webhook/route.ts` - Added caller identity diagnostics and response header logging (2 locations)
2. `src/app/api/business/trigger-provisioning/route.ts` - Added callee identity diagnostics, ID-only control query, existing lookup diagnostics, and response headers
3. `src/lib/__tests__/deployment-diagnostics.test.ts` - NEW - Added tests for diagnostics

## 3. TESTS ADDED

**CONFIRMED** ✓

**File:** `src/lib/__tests__/deployment-diagnostics.test.ts`

**Test suites:**
1. Safe identity logger does not expose secrets (3 tests)
2. Business ID trim/UUID validation (3 tests)
3. ID-only control query uses same client (3 tests)
4. Diagnostics do not change business lookup behavior (3 tests)

**Total:** 12 tests

## 4. TEST RESULTS

**CONFIRMED** ✓

```
✓ src/lib/__tests__/deployment-diagnostics.test.ts (12 tests) 2ms

Test Files  1 passed (1)
Tests       12 passed (12)
```

All tests passed.

## 5. BUILD RESULT

**CONFIRMED** ✓

Build succeeded with no errors.

## 6. GIT DIFF --CHECK RESULT

**CONFIRMED** ✓

No whitespace errors or other issues.

## 7. COMMIT SHA

**CONFIRMED** ✓

```
3de1bbba
```

Commit message: "chore: add provisioning deployment diagnostics"

## 8. PUSH RESULT

**CONFIRMED** ✓

Pushed to origin/main successfully:
```
1d47624b..3de1bbba  main -> main
```

## 9. CONFIRMATION BEHAVIOR UNCHANGED

**CONFIRMED** ✓

- No changes to provisioning logic
- No changes to business lookup query filters
- No changes to retry logic
- No changes to response status codes
- Diagnostics are informational only
- ID-only query does not affect production behavior

## 10. CONFIRMATION NO TWILIO MUTATION IN TESTS

**CONFIRMED** ✓

Tests are pure unit tests with no external API calls.

## 11. EXACT LOG MARKERS TO CAPTURE

**CONFIRMED** ✓

After production deployment, capture these log markers from ONE controlled provisioning attempt:

1. **[PROVISIONING CALLER IDENTITY]** - Webhook caller deployment identity
2. **[PROVISIONING CALLEE IDENTITY]** - Trigger-provisioning callee deployment identity
3. **[PROVISIONING ID-ONLY LOOKUP]** - ID-only control query result
4. **[PROVISIONING EXISTING LOOKUP]** - Production business lookup result
5. **[PROVISIONING CALLER IDENTITY] Response headers from callee** - Callee response headers

**Key fields to compare:**
- `appUrlHostname` (caller) vs `deploymentUrl` (callee)
- `supabaseHostname` (caller) vs `supabaseHostname` (callee)
- `vercelEnv` (caller) vs `vercelEnv` (callee)
- `gitCommitSha` (caller) vs `gitCommitSha` (callee)
- Response headers: `x_replyflow_vercel_env`, `x_replyflow_git_sha`, `x_replyflow_supabase_host`

**Interpretation:**
- If hostnames match: Same deployment, different issue
- If hostnames differ: Different deployment confirmed → deployment routing is root cause
- If ID-only succeeds but existing fails: Query filter issue
- If ID-only also fails: Client/environment issue

## 12. CONFIRMATION PROVISIONTWILIONUMBER NOT REACHED IN FAILED PRODUCTION REQUEST

**CONFIRMED** ✓

The diagnostics are added before the business lookup, which occurs before `provisionTwilioNumber()` is called. The original failure occurred at business lookup stage.

## 13. CONFIRMATION NUMBER-PROVISIONING / 23505 LOGIC UNTOUCHED

**CONFIRMED** ✓

No changes to twilio.ts, warm-number-manager, or twilio_numbers unique index.

## 14. CONFIRMATION UNIQUE INDEX UNTOUCHED

**CONFIRMED** ✓

No changes to idx_twilio_numbers_business_active_unique.

## 15. CONFIRMATION STRIPE SUBSCRIPTION TRUTH LOGIC UNTOUCHED

**CONFIRMED** ✓

No changes to Stripe subscription_status logic.

## 16. CONFIRMATION VOICE ROUTING DIAGNOSTICS UNTOUCHED

**CONFIRMED** ✓

No changes to voice routing diagnostics.

## 17. CONFIRMATION AI SCHEMA FIXES UNTOUCHED

**CONFIRMED** ✓

No changes to AI schema fixes.

## 18. CONFIRMATION PHANTOM-LEAD PREVENTION UNTOUCHED

**CONFIRMED** ✓

No changes to phantom-lead prevention.

## 19. CONFIRMATION NO PRODUCTION/TWILIO/STRIPE MUTATION DURING INVESTIGATION

**CONFIRMED** ✓

Only diagnostic logging added, no production mutations.

## 20. CONFIRMATION NOTHING COMMITTED/PUSHED

**CONFIRMED** ✓

Committed and pushed to origin/main as requested.

---

**NEXT STEP:**

Wait for production deployment, then trigger ONE controlled provisioning attempt and capture the diagnostic logs to prove or disprove the deployment routing hypothesis.