# ReplyFlow Release Notes

## Changelog Template

### [Version] - [Date]

**Added:**
- New feature 1
- New feature 2

**Changed:**
- Updated existing feature 1
- Updated existing feature 2

**Fixed:**
- Bug fix 1
- Bug fix 2

**Deprecated:**
- Deprecated feature 1

**Removed:**
- Removed feature 1

**Security:**
- Security fix 1

**Database:**
- Migration file name
- Description of schema changes

**Configuration:**
- New environment variables
- Updated environment variables

**Known Issues:**
- Known issue 1

---

## Release History

### June 2026

#### Manual Access Override System - June 6, 2026

**Added:**
- Manual access override system for admin-managed billing exceptions
- Database migration: `supabase/migrations/add_manual_access_fields.sql`
- New fields in businesses table:
  - `manual_access_enabled` (BOOLEAN)
  - `manual_access_expires_at` (TIMESTAMPTZ)
  - `manual_access_reason` (TEXT)
  - `manual_access_note` (TEXT)
  - `manual_access_granted_at` (TIMESTAMPTZ)
  - `manual_access_granted_by` (UUID)
- Centralized manual access helper: `src/lib/manual-access.ts`
- Admin API endpoint: `/api/admin/manual-access`
- Admin UI for manual access management: `/dashboard/admin/support`
- Manual access status display in billing UI

**Changed:**
- Updated Business interface to include manual access fields
- Updated BusinessGuard to respect manual access via `hasBillingAccess()`
- Updated subscription-utils.ts to check manual access before Stripe
- Updated onboarding-state.ts to respect manual access for provisioning
- Updated billing checkout status API to include manual access status
- Admin support page now uses user ID-based admin check instead of email-based

**Fixed:**
- Admin account detection - unified admin checks to use ADMIN_USER_IDS environment variable
- Created server-side admin check API endpoint for client-side admin verification

**Configuration:**
- Added `ADMIN_USER_IDS` environment variable (comma-separated user IDs)

**Database:**
- Migration: `add_manual_access_fields.sql`
- Adds manual access fields to businesses table
- Creates indexes on `manual_access_enabled` and `manual_access_expires_at`

**Documentation:**
- Added comprehensive admin documentation under `/docs/admin`
  - ADMIN-OVERVIEW.md
  - CUSTOMER-LIFECYCLE.md
  - MANUAL-ACCESS.md
  - PROVISIONING.md
  - BILLING.md
  - SUPPORT-PLAYBOOK.md
  - DISASTER-RECOVERY.md
  - RELEASE-NOTES.md

---

#### Pricing Update to $59 - June 2026

**Changed:**
- Updated pricing from $49/month to $59/month
- Updated pricing configuration in `src/lib/pricing.ts`
- Updated pricing page display
- Updated homepage pricing references
- Updated Stripe checkout to use new price

**Files Updated:**
- `src/lib/pricing.ts`
- `src/app/pricing/page.tsx`
- `src/app/home/page.tsx` (if applicable)

---

#### One-Tap Forwarding Activation - June 2026

**Added:**
- One-tap dialer activation feature for call forwarding setup
- URL-encoded `tel:` links with forwarding code
- "Open Dialer" button alongside "Copy code" button
- Support for special characters (* and #) in dial codes

**Changed:**
- Updated forwarding setup page to include dialer activation
- Improved user experience for call forwarding setup

**Files Updated:**
- `src/app/setup/forwarding/page.tsx`

---

#### Password Requirements - June 2026

**Added:**
- Password validation requirements for signup
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Client-side validation with error messages

**Changed:**
- Updated signup form to validate password requirements
- Improved security for user accounts

**Files Updated:**
- `src/app/auth/page.tsx`

---

#### Dashboard Onboarding Fixes - June 2026

**Fixed:**
- Stripe session restoration after checkout
- Grace mode handling for billing return
- Session recovery timeout handling
- Redirect loop prevention
- AuthContext session restoration logic

**Changed:**
- Improved AuthContext session restoration
- Better handling of checkout recovery scenarios
- Improved BusinessGuard redirect logic

**Files Updated:**
- `src/components/AuthGuard.tsx`
- `src/components/BusinessGuard.tsx`
- `src/contexts/AuthContext.tsx`

---

#### Admin Account Support - June 2026

**Added:**
- Admin account system for support and management
- Admin support page at `/dashboard/admin/support`
- Business search functionality
- Admin actions (provisioning, subscription management)
- Admin check API endpoint
- Environment variable-based admin authorization

**Changed:**
- Updated admin library to use ADMIN_USER_IDS environment variable
- Added user ID-based admin checking
- Added comprehensive admin logging

**Files Updated:**
- `src/lib/admin.ts`
- `src/app/dashboard/admin/support/page.tsx`
- `src/app/api/admin/check-status/route.ts`
- `src/app/api/admin/manual-access/route.ts`

**Configuration:**
- Added `ADMIN_USER_IDS` environment variable

---

## Version History

### Previous Versions

Documentation for versions prior to June 2026 should be added here as needed.

---

## Upcoming Releases

### Planned Features

**Q3 2026:**
- Enhanced analytics dashboard
- Team/agency pricing tier
- Annual billing discount
- Improved reporting

**Q4 2026:**
- Mobile app (iOS/Android)
- Advanced AI features
- Integration marketplace
- Custom branding options

---

## Migration Guide

### For Admins

**When upgrading to manual access system:**
1. Run database migration: `add_manual_access_fields.sql`
2. Set `ADMIN_USER_IDS` environment variable in Vercel
3. Deploy to production
4. Test admin access via `/dashboard/admin/support`
5. Grant manual access to test accounts

**When upgrading pricing:**
1. Update `NEXT_PUBLIC_STRIPE_PRICE_ID` in Vercel
2. Update pricing in Stripe dashboard
3. Deploy to production
4. Verify checkout uses new price
5. Test payment flow

### For Customers

**No customer action required** for most releases. Customers will automatically receive updates.

**Exceptions:**
- Major version changes may require action
- Database migrations are transparent to customers
- Pricing changes affect new signups only

---

## Breaking Changes

### Manual Access System

**No breaking changes.** Manual access is additive and does not affect existing functionality.

### Pricing Update

**No breaking changes.** Pricing change affects new signups only. Existing customers remain at their current pricing.

### Admin Account System

**No breaking changes.** Admin system is additive and does not affect existing functionality.

---

## Deprecations

None currently deprecated.

---

## Security Updates

### June 2026

- Added password requirements for improved account security
- Admin access restricted to authorized users only
- Environment variable-based admin authorization

---

## Known Issues

### Current Known Issues

None currently documented.

---

## Support

**For issues related to a specific release:**
1. Check this changelog for known issues
2. Check SUPPORT-PLAYBOOK.md for troubleshooting
3. Check DISASTER-RECOVERY.md for service outages
4. Contact support if issue persists

**For documentation issues:**
1. Check ADMIN-OVERVIEW.md for architecture
2. Check PROVISIONING.md for Twilio issues
3. Check BILLING.md for billing issues

---

## Contributing to Release Notes

When making changes to ReplyFlow:

1. Update this changelog with your changes
2. Use the changelog template
3. Include all relevant sections
4. Document any breaking changes
5. Note any configuration changes
6. List database migrations
7. Update documentation as needed

---

**Last Updated:** June 6, 2026
**Maintained By:** ReplyFlow Admin Team
