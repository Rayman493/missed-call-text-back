# Google OAuth App Verification Report
## ReplyFlow Calendar API Access

**Date:** 2026-07-02
**Application:** ReplyFlow
**API:** Google Calendar API
**Verification Status:** Needs Verification

---

## 1. Current OAuth Scopes

### Requested Scope
```
https://www.googleapis.com/auth/calendar.events
```

### Scope Classification
- **Category:** Restricted / Sensitive Scope
- **Access Level:** Read/Write access to calendar events
- **Verification Required:** YES
- **User Consent:** Required per user

### Scope Justification
ReplyFlow uses the `calendar.events` scope to enable businesses to:
- **Read** their Google Calendar events to display them alongside ReplyFlow jobs on the Schedule page
- **Create** new calendar events when appointments are scheduled through ReplyFlow
- **Delete** calendar events when appointments are cancelled through ReplyFlow

All operations are performed on the authenticated user's **primary calendar only**. ReplyFlow does not access secondary calendars, shared calendars, or calendar metadata beyond events.

---

## 2. Minimum Scopes Analysis

### Current Scope vs. Alternatives

| Scope | Access Level | Suitable for ReplyFlow? | Notes |
|-------|--------------|------------------------|-------|
| `calendar.events` | Read/Write events | ✅ YES | Current scope - minimum for full functionality |
| `calendar.events.readonly` | Read-only events | ❌ NO | Cannot create/delete events |
| `calendar` | Full calendar access | ❌ NO | Overly broad - includes calendar settings, ACLs, etc. |
| `calendar.readonly` | Read-only calendar metadata | ❌ NO | Cannot access events |

### Conclusion
**Current scope (`calendar.events`) is the minimum scope required** for ReplyFlow's functionality. Splitting into read-only and write scopes would require multiple OAuth flows and degrade user experience. The scope is appropriately scoped to events only, not calendar metadata or settings.

---

## 3. Scope Sensitivity & Restrictions

### Google's Classification
The `calendar.events` scope is classified as a **restricted scope** because it provides access to user's personal calendar data, which is considered sensitive personal information.

### Verification Requirements
Google requires verification for:
1. **OAuth consent screen** configuration
2. **Security assessment** for restricted scopes
3. **Domain verification** for authorized domains
4. **Public-facing documentation** (privacy policy, terms of service)
5. **Scope justification** explaining why the scope is necessary

### Current Status
- ⚠️ **Likely in "Testing" mode** - Only test users can authorize
- ⚠️ **Verification not completed** - Cannot be used by general public
- ⚠️ **Launch risk: HIGH** - Production users cannot connect Google Calendar

---

## 4. OAuth Consent Screen Requirements

### Required Fields

| Field | Status | Notes |
|-------|--------|-------|
| **App Name** | ⚠️ REQUIRED | Must match ReplyFlow branding |
| **Support Email** | ⚠️ REQUIRED | For users to contact support |
| **Developer Contact** | ⚠️ REQUIRED | For Google to contact developer |
| **App Logo** | ⚠️ REQUIRED | 128x128px minimum, square format |
| **Authorized Domains** | ⚠️ REQUIRED | replyflow.com or production domain |
| **Homepage URL** | ⚠️ REQUIRED | https://replyflow.com or production URL |
| **Privacy Policy URL** | ⚠️ REQUIRED | Must be publicly accessible |
| **Terms of Service URL** | ⚠️ REQUIRED | Must be publicly accessible |

### Status Assessment
**Most fields likely not configured** based on typical development setup. All fields above must be completed before verification submission.

---

## 5. Production Redirect URIs

### Current Configuration
**Environment Variable:** `GOOGLE_REDIRECT_URI`

### Required Production URIs
```
https://replyflow.com/api/google/calendar/callback
```

**OR if using subdomain:**
```
https://app.replyflow.com/api/google/calendar/callback
```

### Development/Staging URIs (for testing)
```
http://localhost:3000/api/google/calendar/callback
https://staging.replyflow.com/api/google/calendar/callback
```

### Configuration Location
- **File:** `src/app/api/google/calendar/connect/route.ts` (line 6)
- **Environment Variable:** `GOOGLE_REDIRECT_URI`

### Action Required
**Verify production redirect URI is configured in Google Cloud Console** under:
- API Services & Credentials → OAuth 2.0 Client IDs → [Your Client ID] → Authorized redirect URIs

---

## 6. Test Users Configuration

### Current Status
If the app is in "Testing" mode, only configured test users can authorize the app.

### Test Users Required For:
- **Development:** Developers and QA team
- **Staging:** Internal testers
- **Beta:** Early access customers

### Configuration Location
Google Cloud Console → API Services & Credentials → OAuth consent screen → Testing

### Action Required
**Add test users** for initial production rollout before verification is complete:
- Development team members
- QA team members
- Internal stakeholders
- Beta customers (if applicable)

---

## 7. Google Console Verification Steps

### Step 1: Configure OAuth Consent Screen
1. Go to Google Cloud Console → API Services & Credentials → OAuth consent screen
2. Select **External** user type (for public app)
3. Complete all required fields:
   - App name: "ReplyFlow"
   - Support email: support@replyflow.com
   - Developer contact: dev@replyflow.com
   - App logo: Upload 128x128px logo
   - Authorized domains: replyflow.com
   - Homepage URL: https://replyflow.com
   - Privacy Policy URL: https://replyflow.com/privacy
   - Terms of Service URL: https://replyflow.com/terms
4. Save and continue

### Step 2: Verify Domain
1. Go to Google Cloud Console → API Services & Credentials → Domain verification
2. Add authorized domain: replyflow.com
3. Complete domain verification via DNS TXT record
4. Wait for verification (typically 24-48 hours)

### Step 3: Submit for Verification
1. Go to API Services & Credentials → OAuth consent screen
2. Click "Submit for Verification"
3. Complete the verification form:
   - Select the scope: `https://www.googleapis.com/auth/calendar.events`
   - Provide scope justification (see Section 8)
   - Upload screenshots of the app in use
   - Provide demo video link (optional but recommended)
4. Submit and wait for Google's review

### Step 4: Monitor Review Status
- Review typically takes 3-7 business days
- Google may request additional information
- Monitor email for Google's feedback
- Address any follow-up requests promptly

---

## 8. Missing Items Checklist

### Public Pages (Critical)
- [ ] **Privacy Policy** - Must be publicly accessible at `/privacy`
- [ ] **Terms of Service** - Must be publicly accessible at `/terms`
- [ ] **Homepage/Landing Page** - Must be publicly accessible

### App Assets
- [ ] **App Logo** - 128x128px minimum, square format, PNG or JPG
- [ ] **App Screenshots** - 3-5 screenshots showing:
  - [ ] OAuth consent flow
  - [ ] Calendar connection UI
  - [ ] Calendar events display in ReplyFlow
  - [ ] Event creation flow
  - [ ] Event deletion flow

### Demo Video (Recommended)
- [ ] **Demo Video** - 1-2 minutes showing:
  - User connecting Google Calendar
  - Calendar events appearing in ReplyFlow
  - Creating an event in ReplyFlow
  - Event appearing in Google Calendar
  - Deleting an event in ReplyFlow
  - Event being removed from Google Calendar

### Documentation
- [ ] **Scope Justification Text** (draft provided in Section 9)
- [ ] **User Guide** - How to connect Google Calendar (optional but helpful)

---

## 9. Draft Scope Justification Text

### For Google Verification Form

**Application:** ReplyFlow
**Scope:** `https://www.googleapis.com/auth/calendar.events`

**Justification:**

ReplyFlow is a business communication platform that helps small businesses manage missed calls, customer follow-ups, and appointment scheduling. The Google Calendar integration allows businesses to:

1. **View their calendar events** alongside ReplyFlow job schedules in a unified view, helping them avoid scheduling conflicts and manage their time more effectively.

2. **Create new calendar events** when appointments are scheduled through ReplyFlow, ensuring their calendar stays synchronized without manual data entry.

3. **Delete calendar events** when appointments are cancelled or rescheduled, maintaining calendar accuracy.

**Scope Necessity:**
The `calendar.events` scope is the minimum scope required to support these three core operations. We only access the authenticated user's primary calendar. We do not access:
- Secondary calendars
- Shared calendars
- Calendar metadata (settings, ACLs, free/busy status)
- Other users' calendars

**User Control:**
- Users must explicitly authorize ReplyFlow to access their calendar
- Users can revoke access at any time from their Google Account settings
- ReplyFlow disconnects calendar access upon user request from the Settings page
- All operations are performed on behalf of the authenticated user only

**Data Privacy:**
- Calendar data is stored securely and used only for the stated purposes
- We do not share calendar data with third parties
- Calendar data is not used for any purpose other than the integration functionality
- Users can delete their calendar integration at any time, which removes all stored calendar tokens

---

## 10. Launch Risk Assessment

### If Verification is NOT Complete

**Risk Level:** 🔴 **HIGH**

**Impact:**
- ❌ **Production users cannot connect Google Calendar**
- ❌ **Calendar integration feature will not work** for general public
- ❌ **Only test users can authorize** (if in testing mode)
- ❌ **Marketing claims about calendar integration cannot be fulfilled**
- ❌ **Customer support burden** from users unable to connect calendar

**Timeline to Impact:**
- **Immediate:** As soon as the first production user tries to connect Google Calendar
- **Severity:** Feature-breaking for calendar integration

### If Verification IS Complete

**Risk Level:** 🟢 **LOW**

**Impact:**
- ✅ All users can connect Google Calendar
- ✅ Calendar integration works as designed
- ✅ Feature can be marketed and delivered
- ✅ No user friction for calendar setup

---

## 11. Recommended Action Plan

### Immediate Actions (Before Launch)
1. **Configure OAuth Consent Screen**
   - Complete all required fields in Google Cloud Console
   - Upload app logo
   - Set authorized domains

2. **Create Public Pages**
   - Publish Privacy Policy at `/privacy`
   - Publish Terms of Service at `/terms`
   - Ensure homepage is accessible

3. **Verify Domain**
   - Add replyflow.com to authorized domains
   - Complete DNS TXT record verification
   - Allow 24-48 hours for propagation

4. **Prepare Verification Materials**
   - Create app screenshots
   - Record demo video
   - Draft scope justification (use text from Section 9)

5. **Submit for Verification**
   - Submit OAuth consent screen for verification
   - Monitor email for Google's feedback
   - Address any follow-up requests promptly

### Timeline Estimate
- **Configuration:** 1-2 days
- **Domain Verification:** 24-48 hours (DNS propagation)
- **Material Preparation:** 2-3 days
- **Google Review:** 3-7 business days
- **Total:** 7-14 business days from start to approval

### Contingency Plan
If verification is not complete by launch date:
- **Option A:** Launch with Google Calendar in beta (test users only)
- **Option B:** Delay calendar integration feature until verification complete
- **Option C:** Use alternative calendar integration (e.g., Microsoft Calendar) as backup

---

## 12. Code Configuration Review

### Current Code Configuration
**File:** `src/app/api/google/calendar/connect/route.ts` (line 83)

```typescript
const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events')
```

### Assessment
✅ **Code is correctly configured**
- Using minimum required scope
- Scope is appropriate for functionality
- No overly broad scopes requested
- No code changes required

### Environment Variables Required
- `GOOGLE_CLIENT_ID` - OAuth 2.0 Client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - OAuth 2.0 Client Secret from Google Cloud Console
- `GOOGLE_REDIRECT_URI` - Production callback URL

**Status:** ⚠️ Verify these are set to production values in production environment

---

## 13. Summary

### Verification Status
**NOT VERIFIED** - Requires completion before public launch

### Critical Path Items
1. Configure OAuth consent screen in Google Cloud Console
2. Create public Privacy Policy and Terms of Service pages
3. Verify domain ownership
4. Submit for Google verification
5. Wait for approval (3-7 business days)

### Launch Risk
**HIGH** if verification not complete - Calendar integration will not work for production users.

### Recommendation
**Start verification process immediately** (7-14 business days lead time). Do not launch with Google Calendar feature until verification is approved, or clearly communicate that the feature is in beta/test mode.

---

**Report Generated:** 2026-07-02
**Next Review:** After Google verification submission
