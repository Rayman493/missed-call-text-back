# Production Deployment Checklist

This checklist ensures safe deployments to production.

## Pre-Deployment Checks

### Build Verification
- [ ] `npm run build` passes without errors
- [ ] TypeScript compilation succeeds
- [ ] No critical console warnings
- [ ] Environment variables documented in `.env.example`

### Code Review
- [ ] All changes reviewed
- [ ] Migration files reviewed for safety
- [ ] No destructive database changes (DROP, DELETE without WHERE)
- [ ] No hardcoded secrets committed
- [ ] Feature flags documented if added

### Migration Safety
- [ ] New migrations use `IF NOT EXISTS` for column additions
- [ ] Migrations are idempotent (can be re-run safely)
- [ ] Schema changes are backward-compatible
- [ ] Default values provided for new columns
- [ ] Indexes added for new query patterns

### Critical Flow Testing
- [ ] Signup flow tested (auth → onboarding → dashboard)
- [ ] AI call path tested (Twilio webhook → AI assistant → response)
- [ ] SMS sending tested (manual send → Twilio → delivery)
- [ ] Payment creation tested (create request → Stripe → webhook)
- [ ] Webhook endpoints tested (Stripe, Twilio)

### Security Verification
- [ ] No service role key exposure to clients
- [ ] RLS policies remain intact
- [ ] Authentication flows unchanged
- [ ] Authorization checks in place
- [ ] Rate limits active

### Environment Validation
- [ ] All required environment variables listed in `src/lib/env-validation.ts`
- [ ] Health check returns valid status
- [ ] No missing production secrets
- [ ] Feature flags documented

## Post-Deployment Verification

### Smoke Tests (Run immediately after deploy)
- [ ] Signup test: Create new account, complete onboarding
- [ ] AI call test: Place test call, verify AI response
- [ ] Payment test: Create payment request, verify Stripe checkout
- [ ] SMS test: Send test message, verify delivery
- [ ] Dashboard test: Load dashboard, verify metrics display

### Health Check
- [ ] `/api/health` returns `ok: true`
- [ ] Environment validation passes
- [ ] No critical errors in logs

### Webhook Health
- [ ] Stripe webhook endpoint reachable
- [ ] Twilio webhook endpoints reachable
- [ ] Webhook signature verification working

### Monitoring
- [ ] Sentry error monitoring active
- [ ] No spike in error rate
- [ ] Build logs show no failures

### Rollback Readiness
- [ ] Previous deployment available in Vercel
- [ ] Rollback procedure documented
- [ ] Feature flags ready for emergency disable

## Emergency Rollback Procedure

If critical issues are detected:

1. **Immediate Rollback**
   - Go to Vercel dashboard
   - Navigate to Deployments
   - Click on previous successful deployment
   - Click "Promote to Production"

2. **Feature Flag Disable** (if rollback not possible)
   - Set environment variable: `FEATURE_FLAG_<FEATURE>=false`
   - Redeploy to apply
   - Monitor for stabilization

3. **Migration Rollback** (if schema issue)
   - Create rollback migration (if possible)
   - Test rollback in staging
   - Apply to production
   - Verify data integrity

## Dependency Update Guidelines

When updating dependencies:

1. **Critical Dependencies** (pinned to exact versions):
   - `stripe` - Payment processing
   - `twilio` - Communication
   - `@supabase/supabase-js` - Database
   - `openai` - AI
   - `@capacitor/*` - Mobile app

   **Procedure:**
   - Review changelog for breaking changes
   - Test in development environment
   - Run full test suite
   - Deploy to staging if available
   - Monitor for 24 hours in production

2. **Non-Critical Dependencies** (use caret ^):
   - UI libraries (lucide-react, radix-ui)
   - Build tools (next, tailwindcss)
   - Utilities (zod, date-fns)

   **Procedure:**
   - Update via `npm update`
   - Run build to verify compatibility
   - Test critical flows
   - Deploy with monitoring

## Migration Safety Notes

### Safe Migration Patterns
- ✅ `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- ✅ `CREATE INDEX IF NOT EXISTS`
- ✅ `UPDATE ... WHERE ...` with proper WHERE clause
- ✅ Adding UNIQUE constraints with proper conflict handling

### Unsafe Migration Patterns (AVOID)
- ❌ `DROP COLUMN` without data migration
- ❌ `DROP TABLE` without backup
- ❌ `DELETE` without proper WHERE clause
- ❌ Changing column types without data migration
- ❌ Removing constraints without validation

### Migration Testing
- Test migrations on production data backup
- Verify data integrity after migration
- Test application with new schema
- Have rollback migration ready

## Incident Response

If deployment causes production issues:

1. **Assess Impact**
   - Check error rate in Sentry
   - Review deployment logs
   - Identify affected customers

2. **Contain Damage**
   - Rollback deployment if critical
   - Disable feature flags if specific feature broken
   - Notify affected customers if needed

3. **Investigate**
   - Review git diff
   - Check migration changes
   - Analyze error patterns

4. **Recover**
   - Apply fix
   - Test thoroughly
   - Redeploy with monitoring
   - Document incident

## Contact Information

- **Founder/Operator**: Ryan
- **Monitoring**: Sentry (https://sentry.io)
- **Deployment Platform**: Vercel
- **Database**: Supabase
- **Payment Processor**: Stripe
- **Communication**: Twilio