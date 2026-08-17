# ReplyFlow Assistant Knowledge Coverage Inventory - Part 2

**Date:** 2025-01-09
**Goal:** Audit coverage for current ReplyFlow product
**Total Articles:** 57

---

## Coverage Matrix

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|

### Getting Started

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| What ReplyFlow is | ✅ replyflow-overview | knowledge-base.ts | High | High | N/A | All | None | Low |
| First 15 minutes | ⚠️ setup-checklist | knowledge-base.ts | High | Medium | N/A | All | Detailed walkthrough of each step | Medium |
| Account creation | ❌ | N/A | N/A | N/A | N/A | All | Signup flow, email verification | High |
| Trial and subscription | ✅ pricing, trial-billing, cancel-trial, billing-trial-details | knowledge-base.ts | High | High | Dashboard → Settings → Subscription | All | None | Low |
| Business profile | ❌ | N/A | N/A | N/A | N/A | All | Business name, address, type setup | Medium |
| Business address | ❌ | N/A | N/A | N/A | N/A | All | Address configuration | Low |
| Business type | ⚠️ ai-voice-business-types | knowledge-base.ts | High | Low | Settings | All | How to set business type, impact | Medium |
| Navigation | ❌ | N/A | N/A | N/A | N/A | All | Menu structure, dashboard layout | Medium |
| Supported devices | ⚠️ desktop-vs-mobile | knowledge-base.ts | High | Medium | N/A | All | iOS vs Android specific requirements | Medium |
| Web vs native apps | ✅ desktop-vs-mobile | knowledge-base.ts | High | High | N/A | All | None | Low |
| Setup time | ✅ setup-time | knowledge-base.ts | High | High | N/A | All | None | Low |

### Business Number and Forwarding

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| ReplyFlow number provisioning | ❌ | N/A | N/A | N/A | N/A | All | How number is provisioned, timeline | Medium |
| Why separate ReplyFlow number exists | ❌ | N/A | N/A | N/A | N/A | All | Explanation of dedicated number | Medium |
| Call forwarding basics | ✅ forwarding-basics | knowledge-base.ts | High | High | N/A | All | None | Low |
| Carrier-specific forwarding basics | ✅ carrier-forwarding-codes | knowledge-base.ts | High | High | N/A | All (carrier-specific) | None | Low |
| Testing forwarding | ✅ test-replyflow, test-call-second-phone | knowledge-base.ts | High | High | N/A | All | None | Low |
| Forwarding verification | ⚠️ forwarding-basics | knowledge-base.ts | High | Low | N/A | All | Detailed verification steps | Medium |
| Turning forwarding on/off | ✅ disable-forwarding | knowledge-base.ts | High | High | N/A | All (carrier-specific) | None | Low |
| Changing the business phone | ⚠️ update-forwarding | knowledge-base.ts | High | Medium | N/A | All | When to change business phone | Medium |
| What happens when forwarding fails | ⚠️ forwarding-not-working | knowledge-base.ts | High | Medium | N/A | All | Caller experience, error states | Medium |
| What callers experience | ❌ | N/A | N/A | N/A | N/A | All | What caller hears when forwarding works | Low |

### AI Receptionist

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| How AI Voice works | ✅ ai-voice | knowledge-base.ts | High | High | N/A | All | None | Low |
| What information it gathers | ✅ ai-intake-meaning | knowledge-base.ts | High | Medium | N/A | All | Detailed field list, validation | Medium |
| Intake stages | ❌ | N/A | N/A | N/A | N/A | All | What questions asked when, stages | High |
| Service-location modes | ❌ | N/A | N/A | N/A | N/A | All | Onsite vs customer comes to business | High |
| Completed vs partial intake | ⚠️ partial-intake, ai-intake-incomplete | knowledge-base.ts | High | Medium | N/A | All | Clear distinction, handling | Medium |
| Repeat callers | ⚠️ ignored-contacts-ai | knowledge-base.ts | High | Low | N/A | All | How repeat callers are handled | Medium |
| Personal contacts | ✅ ignored-contacts-ai | knowledge-base.ts | High | High | Settings | All | None | Low |
| Voicemail | ✅ ai-voicemail | knowledge-base.ts | High | High | N/A | All | None | Low |
| When the AI answers | ❌ | N/A | N/A | N/A | N/A | All | Exact conditions (forwarding, hours, etc.) | Medium |
| What happens after a call | ⚠️ how-replyflow-works | knowledge-base.ts | High | Medium | N/A | All | Detailed workflow from call to SMS | Medium |
| SMS confirmation behavior | ✅ sms-timing | knowledge-base.ts | High | High | N/A | All | None | Low |
| Correcting intake information | ✅ customer-corrections | knowledge-base.ts | High | High | N/A | All | None | Low |
| AI limitations | ✅ replyflow-limitations, guarantees-limits | knowledge-base.ts | High | High | N/A | All | None | Low |

### Customers and Conversations

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| Customers vs Leads | ✅ customers-vs-leads | knowledge-base.ts | High | High | N/A | All | None | Low |
| Needs Reply status | ❌ | N/A | N/A | N/A | N/A | All | What Needs Reply means | Medium |
| Active status | ❌ | N/A | N/A | N/A | N/A | All | What Active means | Medium |
| Completed status | ❌ | N/A | N/A | N/A | N/A | All | What Completed means | Medium |
| Ignored status | ⚠️ lead-statuses | knowledge-base.ts | High | Low | N/A | All | How to ignore, what happens | Medium |
| Viewing AI Intake | ✅ ai-intake-meaning | knowledge-base.ts | High | Medium | Dashboard → Leads → Lead | All | How to view, where to find | Medium |
| Reading transcripts | ❌ | N/A | N/A | N/A | N/A | All | How to read call transcripts | Low |
| Editing customer details | ❌ | N/A | N/A | N/A | N/A | All | How to edit name, phone, etc. | Medium |
| Replying by SMS | ✅ reply-customer, manual-reply | knowledge-base.ts | High | High | Dashboard → Leads → Lead | All | None | Low |
| Sending MMS | ✅ mms-photos | knowledge-base.ts | High | High | Dashboard → Leads → Lead | All | None | Low |
| Correcting addresses | ✅ customer-corrections | knowledge-base.ts | High | High | N/A | All | None | Low |
| Customer timelines | ❌ | N/A | N/A | N/A | N/A | All | How to view conversation timeline | Medium |
| Request History | ❌ | N/A | N/A | N/A | N/A | All | How to view request history | Medium |
| Internal notes | ❌ | N/A | N/A | N/A | N/A | All | How to add/edit internal notes | Low |
| Duplicate customers | ✅ duplicate-lead | knowledge-base.ts | High | Medium | N/A | All | How to merge or handle | Medium |
| Opt-outs | ✅ opt-out | knowledge-base.ts | High | High | N/A | All | None | Low |
| Deleting customer records | ❌ | N/A | N/A | N/A | N/A | All | How to delete, what happens | Medium |

### Schedule, Appointments, Jobs, and Tasks

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| Connecting Google Calendar | ✅ connect-google-calendar | knowledge-base.ts | High | High | Dashboard → Calendar | All | None | Low |
| Calendar permissions | ❌ | N/A | N/A | N/A | N/A | All | What permissions needed, why | Medium |
| Creating appointments | ❌ | N/A | N/A | N/A | N/A | All | How to create from conversation | High |
| Editing/deleting appointments | ❌ | N/A | N/A | N/A | N/A | All | How to modify appointments | High |
| Google Meet | ❌ | N/A | N/A | N/A | N/A | All | Google Meet integration | Low |
| Schedule Map | ❌ | N/A | N/A | N/A | N/A | All | How to use Schedule Map | High |
| Business vs customer locations | ❌ | N/A | N/A | N/A | N/A | All | Location types, when to use which | High |
| Creating and managing jobs | ❌ | N/A | N/A | N/A | N/A | All | Job creation, job completion | High |
| Creating and managing tasks | ❌ | N/A | N/A | N/A | N/A | All | Task creation, task management | Medium |
| Agenda behavior | ❌ | N/A | N/A | N/A | N/A | All | How agenda works | Medium |
| Missing events | ⚠️ events-not-showing, calendar-not-connected | knowledge-base.ts | High | Medium | Dashboard → Calendar | All | Detailed troubleshooting | Medium |
| Calendar disconnection/reconnection | ❌ | N/A | N/A | N/A | N/A | All | How to disconnect, reconnect | Medium |
| Time zones | ❌ | N/A | N/A | N/A | N/A | All | Time zone handling | Medium |

### Payments

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| Connecting Stripe | ❌ | N/A | N/A | N/A | N/A | All | Stripe connection steps | High |
| Stripe verification pending | ❌ | N/A | N/A | N/A | N/A | All | Verification troubleshooting | High |
| Payment requests | ✅ payment-requests-overview | knowledge-base.ts | High | High | Payments → Request Payment | All | None | Low |
| Customer payment links | ⚠️ create-payment-request | knowledge-base.ts | High | Medium | Payments → Request Payment | All | Customer experience, link expiration | Medium |
| Marking payments paid | ❌ | N/A | N/A | N/A | N/A | All | How to mark paid manually | Medium |
| Cancelling requests | ❌ | N/A | N/A | N/A | N/A | All | How to cancel payment requests | Medium |
| Payment history | ❌ | N/A | N/A | N/A | N/A | All | How to view payment history | Medium |
| Venmo | ❌ | N/A | N/A | N/A | N/A | All | Venmo integration | Low |
| PayPal | ❌ | N/A | N/A | N/A | N/A | All | PayPal integration | Low |
| Tap to Pay on iPhone | ⚠️ tap-to-pay-requirements | knowledge-base.ts | High | Low | N/A | iOS only | iOS-specific setup, requirements | High |
| Tap to Pay on Android | ❌ | N/A | N/A | N/A | N/A | Android | Android support status | Medium |
| Device requirements | ⚠️ tap-to-pay-requirements | knowledge-base.ts | High | Medium | N/A | iOS | Detailed device list, iOS version | High |
| Merchant education | ❌ | N/A | N/A | N/A | N/A | All | Customer-facing payment guidance | Medium |
| Receipts | ❌ | N/A | N/A | N/A | N/A | All | Receipt delivery, viewing | Medium |
| Cancellations | ❌ | N/A | N/A | N/A | N/A | All | Payment cancellation flow | Medium |
| Failed payments | ❌ | N/A | N/A | N/A | N/A | All | Failed payment troubleshooting | High |
| Refund guidance | ❌ | N/A | N/A | N/A | N/A | All | How to process refunds | Medium |
| Stripe-owned vs ReplyFlow-owned | ❌ | N/A | N/A | N/A | N/A | All | Which actions happen where | Medium |

### Notifications

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| In-app notifications | ❌ | N/A | N/A | N/A | N/A | All | How in-app notifications work | Medium |
| Push notifications | ❌ | N/A | N/A | N/A | N/A | Mobile | Push notification setup | High |
| Permission prompts | ❌ | N/A | N/A | N/A | N/A | Mobile | Permission handling | High |
| Enabling/disabling categories | ❌ | N/A | N/A | N/A | N/A | All | Notification categories | Medium |
| Denied permissions | ❌ | N/A | N/A | N/A | N/A | Mobile | Denied permission handling | High |
| Device-specific settings | ❌ | N/A | N/A | N/A | N/A | Mobile | iOS vs Android notification settings | High |
| Why notification may not arrive | ❌ | N/A | N/A | N/A | N/A | All | Notification troubleshooting | High |
| Notification Center | ❌ | N/A | N/A | N/A | N/A | All | How to use Notification Center | Medium |
| Marking notifications read | ❌ | N/A | N/A | N/A | N/A | All | How to mark read | Low |

### Settings and Account

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| Business settings | ❌ | N/A | N/A | N/A | N/A | All | Business settings overview | Medium |
| Sending-source settings | ❌ | N/A | N/A | N/A | N/A | All | Sending source configuration | Medium |
| Personal communication | ❌ | N/A | N/A | N/A | N/A | All | Personal communication settings | Low |
| Business hours | ✅ change-business-hours | knowledge-base.ts | High | High | Dashboard → Settings → Business Hours | All | None | Low |
| Password changes | ❌ | N/A | N/A | N/A | N/A | All | How to change password | Medium |
| Subscription management | ✅ manage-subscription | knowledge-base.ts | High | High | Dashboard → Settings → Subscription | All | None | Low |
| Billing portal | ✅ billing-portal, billing-portal-issues | knowledge-base.ts | High | High | Dashboard → Settings → Subscription | All | None | Low |
| Data/privacy | ❌ | N/A | N/A | N/A | N/A | All | Data privacy, GDPR | Medium |
| Account deletion | ❌ | N/A | N/A | N/A | N/A | All | How to delete account | High |
| Signing out | ❌ | N/A | N/A | N/A | N/A | All | How to sign out | Low |
| Support/contact | ✅ contact-support | knowledge-base.ts | High | High | N/A | All | None | Low |

### Troubleshooting

| Topic | Existing Coverage | Source File | Accuracy | Completeness | Current Route/Navigation Labels | Platform Applicability | Missing Content | Priority |
|-------|------------------|-------------|----------|--------------|--------------------------------|----------------------|-----------------|----------|
| App appears offline | ❌ | N/A | N/A | N/A | N/A | All | Offline troubleshooting | High |
| Number not provisioned | ❌ | N/A | N/A | N/A | N/A | All | Number provisioning issues | Medium |
| Call forwarding not working | ✅ forwarding-not-working | knowledge-base.ts | High | High | N/A | All | None | Low |
| Customer not created | ⚠️ no-lead-appeared | knowledge-base.ts | High | Medium | N/A | All | Detailed troubleshooting | Medium |
| SMS not received | ✅ sms-not-sent | knowledge-base.ts | High | High | N/A | All | None | Low |
| Calendar event missing | ⚠️ events-not-showing, calendar-not-connected | knowledge-base.ts | High | Medium | Dashboard → Calendar | All | Detailed troubleshooting | Medium |
| Stripe not connected | ❌ | N/A | N/A | N/A | N/A | All | Stripe connection troubleshooting | High |
| Stripe verification pending | ❌ | N/A | N/A | N/A | N/A | All | Verification troubleshooting | High |
| Tap to Pay unavailable | ❌ | N/A | N/A | N/A | N/A | iOS | Tap to Pay troubleshooting | High |
| Tap to Pay canceled | ❌ | N/A | N/A | N/A | N/A | iOS | Cancellation troubleshooting | High |
| Push notification missing | ❌ | N/A | N/A | N/A | N/A | Mobile | Notification troubleshooting | High |
| Permission denied | ❌ | N/A | N/A | N/A | N/A | Mobile | Permission troubleshooting | High |
| Stale data | ❌ | N/A | N/A | N/A | N/A | All | Data refresh troubleshooting | Medium |
| When to refresh/reopen app | ❌ | N/A | N/A | N/A | N/A | All | Refresh guidance | Medium |
| When to contact support | ⚠️ contact-support | knowledge-base.ts | High | Low | N/A | All | Specific scenarios for support | Medium |

---

## Summary Statistics

### Coverage by Domain

| Domain | Total Topics | Covered | Partial | Missing | Coverage % |
|--------|--------------|---------|---------|---------|------------|
| Getting Started | 10 | 5 | 3 | 2 | 50% |
| Business Number and Forwarding | 10 | 6 | 3 | 1 | 60% |
| AI Receptionist | 13 | 7 | 4 | 2 | 54% |
| Customers and Conversations | 14 | 6 | 3 | 5 | 43% |
| Schedule, Appointments, Jobs, and Tasks | 13 | 2 | 2 | 9 | 15% |
| Payments | 16 | 3 | 3 | 10 | 19% |
| Notifications | 9 | 0 | 0 | 9 | 0% |
| Settings and Account | 10 | 4 | 0 | 6 | 40% |
| Troubleshooting | 14 | 4 | 3 | 7 | 29% |
| **TOTAL** | **109** | **37** | **21** | **51** | **34%** |

### Priority Breakdown

| Priority | Count | Topics |
|----------|-------|--------|
| High | 24 | Account creation, Intake stages, Service-location modes, Creating appointments, Schedule Map, Creating jobs, Connecting Stripe, Stripe verification, Tap to Pay iPhone/Android, Device requirements, Failed payments, Account deletion, App offline, Push notifications, Permission denied, Tap to Pay unavailable/canceled, Stripe not connected/verification, Calendar permissions, Notifications (all 9 topics) |
| Medium | 47 | First 15 minutes, Business profile, Business type, Navigation, Supported devices, ReplyFlow number provisioning, Why separate number, Forwarding verification, Changing business phone, Caller experience, Intake field validation, Repeat callers, When AI answers, Detailed workflow, Needs Reply/Active/Completed statuses, Viewing AI Intake, Editing customer details, Customer timelines, Request History, Internal notes, Deleting customers, Calendar permissions, Creating/editing appointments, Schedule Map, Business vs customer locations, Creating/managing jobs/tasks, Agenda, Calendar disconnect/reconnect, Time zones, Customer payment links, Marking payments paid, Cancelling requests, Payment history, Merchant education, Receipts, Cancellations, Refund guidance, Stripe vs ReplyFlow actions, In-app notifications, Notification categories, Notification Center, Business settings, Sending source, Password changes, Data/privacy, Number provisioning, Customer not created, Calendar event missing, Stale data, When to refresh, When to contact support |
| Low | 38 | What ReplyFlow is, Trial/subscription, Business address, Supported devices, Web vs native, Setup time, Why separate number, Caller experience, AI limitations, Needs Reply/Active/Completed statuses, Reading transcripts, Internal notes, Opt-outs, Google Meet, Venmo, PayPal, Personal communication, Signing out, Marking notifications read |

### Platform-Specific Gaps

| Platform | Missing Topics |
|----------|----------------|
| iOS | Tap to Pay detailed setup, Push notifications, Permission handling |
| Android | Tap to Pay support status, Push notifications, Permission handling |
| Mobile (general) | Push notifications, Permission handling, Notification settings |
| Desktop | None specific (most topics cross-platform) |

---

## Key Findings

### Critical Gaps (High Priority)
1. **Payments (19% coverage)** - Most payment features undocumented
2. **Schedule/Appointments/Jobs (15% coverage)** - Core workflow features missing
3. **Notifications (0% coverage)** - Entirely undocumented
4. **Tap to Pay** - Requirements exist but setup/troubleshooting missing
5. **Stripe Connection** - Connection steps and verification missing

### Navigation Labels Need Verification
All navigation labels mentioned in articles need verification against current UI:
- Dashboard → Calendar
- Dashboard → Settings → Subscription
- Dashboard → Settings → Business Hours
- Payments → Request Payment
- Dashboard → Leads

### Platform Distinctions Missing
- iOS vs Android Tap to Pay
- iOS vs Android notifications
- Mobile vs desktop specific features

### Account-Specific Issues
- Account-specific queries are rejected entirely
- No guidance for account-specific troubleshooting
- No way to provide contextual help based on account state

---

## Recommendations

### Immediate Actions (High Priority)
1. Add Stripe connection and verification articles
2. Add Tap to Pay setup and troubleshooting (iOS)
3. Add appointment creation and management
4. Add Schedule Map usage
5. Add push notification setup and troubleshooting
6. Add account deletion process

### Short-Term Actions (Medium Priority)
1. Verify all navigation labels
2. Add job creation and management
3. Add customer detail editing
4. Add calendar permissions explanation
5. Add Stripe vs ReplyFlow action distinction
6. Improve account-specific query handling

### Long-Term Actions (Low Priority)
1. Add Venmo/PayPal integration docs
2. Add transcript reading guide
3. Add internal notes documentation
4. Add detailed walkthroughs for first-time users
5. Add platform-specific feature comparisons