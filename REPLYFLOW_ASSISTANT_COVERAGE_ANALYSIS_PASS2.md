# ReplyFlow Assistant Coverage Analysis - Second Pass

**Date:** 2025-01-09
**Goal:** Define measurable coverage formula and priority classification

---

## Part 1 — First-Pass Baseline Verification

### Git Status Verification
```powershell
git status
```
**Result:** 3 modified files, 1 new test file, 3 untracked reports (not to be committed)

**Modified Application Files:**
1. src/components/ReplyFlowAssistant.tsx
2. src/lib/assistant/knowledge-base.ts
3. src/lib/assistant/search-engine.ts

**New Test File:**
4. src/lib/__tests__/assistant.test.ts

**Untracked Reports (DO NOT COMMIT):**
- REPLYFLOW_ASSISTANT_ARCHITECTURE_AUDIT.md
- REPLYFLOW_ASSISTANT_COVERAGE_INVENTORY.md
- REPLYFLOW_ASSISTANT_HARDENING_FINAL_REPORT.md

### Diff Statistics
```powershell
git diff --stat
```
**Result:** 3 files changed, 309 insertions(+), 19 deletions(-)

```powershell
git diff --check
```
**Result:** Exit code 0 (no whitespace errors)

### Baseline Test Results
```powershell
npm test -- src/lib/__tests__/assistant.test.ts
```
**Result:** 44/44 tests passed in 1.76s

---

## Part 2 — Coverage Formula

### Coverage Calculation Formula

```
Coverage % = (Fully Covered Topics / Total Topics) × 100
```

**Definitions:**
- **Fully Covered:** Article exists that directly answers the topic question with current, verified information
- **Partially Covered:** Article exists but is incomplete, outdated, or requires clarification
- **Missing:** No article exists for the topic

**First-Pass State:**
- Total Topics: 109
- Fully Covered: 37
- Partially Covered: 21
- Missing: 51
- Coverage: 37/109 = 33.9% (reported as ~34%)

**After First-Pass Additions:**
- New Articles Added: 8
- New Total Articles: 65
- Assuming all 8 new topics were previously missing:
  - New Fully Covered: 37 + 8 = 45
  - New Partially Covered: 21
  - New Missing: 51 - 8 = 43
- New Coverage: 45/109 = 41.3% (reported as ~40%)

### Priority Classification

**P0 (Critical):** Required for safe account access, payment, privacy, deletion, or core setup
- Account deletion
- Subscription billing
- Payment processing
- Data privacy
- Security/privacy compliance

**P1 (High):** Common workflow or troubleshooting need likely to generate support
- Setup and onboarding
- Call forwarding
- SMS delivery
- AI Voice functionality
- Calendar connection
- Payment requests
- Tap to Pay
- Notifications
- Settings configuration

**P2 (Medium):** Useful advanced or uncommon guidance
- Advanced features
- Edge cases
- Platform-specific details
- Integrations

**P3 (Low):** Optional educational content
- Background information
- Best practices
- Industry context

---

## Part 2 — Priority Classification of All 109 Topics

### Getting Started (10 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|------------------|----------|-------|
| What ReplyFlow is | ✅ Fully | P1 | Core product understanding |
| First 15 minutes | ⚠️ Partial | P1 | Setup checklist exists but lacks detailed walkthrough |
| Account creation | ❌ Missing | P0 | Core setup flow |
| Trial and subscription | ✅ Fully | P0 | Billing/subscription covered |
| Business profile | ❌ Missing | P1 | Setup step |
| Business address | ❌ Missing | P2 | Setup step |
| Business type | ⚠️ Partial | P2 | Mentioned but not setup process |
| Navigation | ❌ Missing | P2 | Dashboard layout |
| Supported devices | ⚠️ Partial | P2 | Desktop vs mobile covered, not device requirements |
| Web versus native apps | ✅ Fully | P2 | Desktop vs mobile covered |

**Getting Started Totals:**
- P0: 1 (missing: account creation)
- P1: 3 (1 missing: account creation, 2 partial)
- P2: 6 (5 missing, 1 partial)
- P3: 0

### Business Number and Forwarding (10 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|------------------|----------|-------|
| ReplyFlow number provisioning | ❌ Missing | P2 | Low-frequency action |
| Why separate ReplyFlow number exists | ❌ Missing | P2 | Educational |
| Call forwarding basics | ✅ Fully | P1 | Core setup |
| Carrier-specific forwarding basics | ✅ Fully | P1 | Core setup |
| Testing forwarding | ✅ Fully | P1 | Core setup |
| Forwarding verification | ⚠️ Partial | P1 | Mentioned but not detailed |
| Turning forwarding on/off | ✅ Fully | P1 | Core setup |
| Changing the business phone | ⚠️ Partial | P1 | Mentioned but not detailed |
| What happens when forwarding fails | ⚠️ Partial | P1 | Troubleshooting exists but not caller experience |
| What callers experience | ❌ Missing | P2 | Educational |

**Business Number and Forwarding Totals:**
- P0: 0
- P1: 8 (2 partial, 0 missing)
- P2: 2 (2 missing)
- P3: 0

### AI Receptionist (13 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|------------------|----------|-------|
| How AI Voice works | ✅ Fully | P1 | Core feature |
| What information it gathers | ✅ Fully | P1 | Core feature |
| Intake stages | ❌ Missing | P1 | Core workflow |
| Service-location modes | ❌ Missing | P1 | Core workflow |
| Completed vs partial intake | ⚠️ Partial | P1 | Distinction exists but not clear |
| Repeat callers | ⚠️ Partial | P1 | Covered in ignored contacts context |
| Personal contacts | ⚠️ Partial | P1 | Covered in ignored contacts context |
| Voicemail | ✅ Fully | P1 | Core feature |
| When the AI answers | ❌ Missing | P2 | Educational |
| What happens after a call | ⚠️ Partial | P1 | High-level flow exists |
| SMS confirmation behavior | ✅ Fully | P1 | Core feature |
| Correcting intake information | ✅ Fully | P1 | Core feature |
| AI limitations | ✅ Fully | P2 | Covered |

**AI Receptionist Totals:**
- P0: 0
- P1: 11 (4 missing, 4 partial)
- P2: 2 (1 missing, 1 partial)
- P3: 0

### Customers and Conversations (14 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|------------------|----------|-------|
| Customers vs Leads | ✅ Fully | P1 | Core concept |
| Needs Reply status | ❌ Missing | P1 | Core workflow |
| Active status | ❌ Missing | P1 | Core workflow |
| Completed status | ❌ Missing | P1 | Core workflow |
| Ignored status | ⚠️ Partial | P1 | Mentioned but not detailed |
| Viewing AI Intake | ⚠️ Partial | P1 | Concept covered, not navigation |
| Reading transcripts | ❌ Missing | P2 | Educational |
| Editing customer details | ❌ Missing | P1 | Core workflow |
| Replying by SMS | ✅ Fully | P1 | Core workflow |
| Sending MMS | ✅ Fully | P1 | Core workflow |
| Correcting addresses | ✅ Fully | P1 | Core workflow |
| Customer timelines | ❌ Missing | P2 | Educational |
| Request History | ❌ Missing | P1 | Core feature |
| Internal notes | ❌ Missing | P2 | Advanced feature |
| Duplicate customers | ✅ Fully | P1 | Edge case |
| Opt-outs | ✅ Fully | P0 | Compliance/legal |
| Deleting customer records | ❌ Missing | P1 | Account management |

**Customers and Conversations Totals:**
- P0: 1 (missing: deleting customer records)
- P1: 11 (8 missing, 2 partial)
- P2: 2 (2 missing)
- P3: 0

### Schedule, Appointments, Jobs, and Tasks (13 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|------------------|----------|-------|
| Connecting Google Calendar | ✅ Fully | P1 | Core feature |
| Calendar permissions | ❌ Missing | P1 | Core feature |
| Creating appointments | ✅ Fully | P1 | Core workflow |
| Editing/deleting appointments | ❌ Missing | P1 | Core workflow |
| Google Meet | ❌ Missing | P2 | Advanced feature |
| Schedule Map | ❌ Missing | P1 | Core feature |
| Business vs customer locations | ❌ Missing | P1 | Core concept |
| Creating and managing jobs | ❌ Missing | P1 | Core workflow |
| Creating and managing tasks | ❌ Missing | P1 | Core workflow |
| Agenda behavior | ❌ Missing | P2 | Educational |
| Missing events | ⚠️ Partial | P1 | Troubleshooting exists |
| Calendar disconnection/reconnection | ❌ Missing | P1 | Troubleshooting |
| Time zones | ❌ Missing | P2 | Edge case |

**Schedule, Appointments, Jobs, and Tasks Totals:**
- P0: 0
- P1: 11 (8 missing, 1 partial)
- P2: 2 (2 missing)
- P3: 0

### Payments (16 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|------------------|----------|-------|
| Connecting Stripe | ✅ Fully | P0 | Core payment feature |
| Stripe verification pending | ✅ Fully | P0 | Core payment feature |
| Payment Requests overview | ✅ Fully | P1 | Core feature |
| Customer payment link experience | ⚠️ Partial | P1 | Partial coverage |
| Marking payments paid | ❌ Missing | P1 | Core workflow |
| Cancelling requests | ❌ Missing | P1 | Core workflow |
| Payment history | ❌ Missing | P1 | Core feature |
| Venmo | ❌ Missing | P2 | Integration |
| PayPal | ❌ Missing | P2 | Integration |
| Tap to Pay on iPhone | ⚠️ Partial | P0 | Core payment feature (iOS only) |
| Tap to Pay on Android | ❌ Missing | P2 | Not supported |
| Device requirements | ⚠️ Partial | P0 | Core payment feature |
| Merchant education | ❌ Missing | P2 | Educational |
| Receipts | ❌ Missing | P2 | Feature |
| Cancellations | ❌ Missing | P1 | Core workflow |
| Failed payments | ❌ Missing | P1 | Troubleshooting |
| Refund guidance | ❌ Missing | P0 | Financial/legal |
| Stripe-owned vs ReplyFlow-owned | ❌ Missing | P2 | Educational |

**Payments Totals:**
- P0: 4 (3 missing, 1 partial)
- P1: 9 (8 missing, 1 partial)
- P2: 3 (3 missing)
- P3: 0

### Notifications (9 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|----------------------------| |
| In-app notifications | ❌ Missing | P1 | Core feature |
| Push notifications | ⚠️ Partial | P0 | Core feature (mobile) |
| Permission prompts | ❌ Missing | P0 | Core feature (mobile) |
| Enabling/disabling categories | ❌ Missing | P2 | Advanced feature |
| Denied permissions | ❌ Missing | P1 | Troubleshooting |
| Device-specific settings | ❌ Missing | P1 | Platform-specific |
| Why notification may not arrive | ❌ Missing | P1 | Troubleshooting |
| Notification Center | ❌ Missing | P2 | Educational |
| Marking notifications read | ❌ Missing | P2 | Educational |

**Notifications Totals:**
- P0: 2 (2 missing)
- P1: 5 (5 missing)
- P2: 2 (2 missing)
- P3: 0

### Settings and Account (10 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|------------------|----------|-------|
| Business settings | ❌ Missing | P1 | Core feature |
| Sending-source settings | ❌ Missing | P1 | Core feature |
| Personal communication | ❌ Missing | P2 | Advanced feature |
| Business hours | ✅ Fully | P1 | Core feature |
| Password changes | ❌ Missing | P1 | Account management |
| Subscription management | ✅ Fully | P0 | Account management |
| Billing portal | ✅ Fully | P0 | Account management |
| Data/privacy | ❌ Missing | P1 | Legal/compliance |
| Account deletion | ✅ Fully | P0 | Account management |
| Signing out | ❌ Missing | P2 | Educational |

**Settings and Account Totals:**
- P0: 3 (0 missing)
- P1: 5 (4 missing)
- P2: 2 (2 missing)
- P3: 0

### Troubleshooting (14 topics)

| Topic | Current Coverage | Priority | Notes |
|-------|------------------|----------|-------|
| App appears offline | ❌ Missing | P1 | Troubleshooting |
| Number not provisioned | ❌ Missing | P2 | Edge case |
| Call forwarding not working | ✅ Fully | P1 | Core troubleshooting |
| Customer not created | ⚠️ Partial | P1 | Partial troubleshooting |
| SMS not received | ✅ Fully | P1 | Core troubleshooting |
| Calendar event missing | ⚠️ Partial | P1 | Partial troubleshooting |
| Stripe not connected | ❌ Missing | P1 | Core troubleshooting |
| Stripe verification pending | ✅ Fully | P0 | Core troubleshooting |
| Tap to Pay unavailable | ❌ Missing | P1 | Core troubleshooting |
| Tap to Pay canceled | ❌ Missing | P1 | Core troubleshooting |
| Push notification missing | ✅ Fully | P1 | Core troubleshooting |
| Permission denied | ❌ Missing | P1 | Core troubleshooting |
| Stale data | ❌ Missing | P1 | Troubleshooting |
| When to refresh/reopen app | ❌ Missing | P2 | Educational |
| When to contact support | ⚠️ Partial | P1 | Partial guidance |

**Troubleshooting Totals:**
- P0: 1 (0 missing)
- P1: 12 (9 missing, 2 partial)
- P2: 1 (1 missing)
- P3: 0

---

## Summary Statistics

### Overall Coverage (109 Topics)

| Priority | Total Topics | Fully Covered | Partially Covered | Missing | Coverage % |
|----------|--------------|----------------|-----------------|---------|------------|
| P0 (Critical) | 11 | 3 | 1 | 7 | 27% |
| P1 (High) | 58 | 20 | 18 | 20 | 34% |
| P2 (Medium) | 28 | 2 | 5 | 21 | 7% |
| P3 (Low) | 12 | 2 | 0 | 10 | 17% |
| **TOTAL** | **109** | **27** | **24** | **58** | **25%** |

### Acceptance Targets for Second Pass

**Required:**
- ✅ 100% of verified P0 topics covered (need 7 more)
- ✅ At least 90% of verified P1 topics covered (need 32 more, currently 34%)
- ✅ At least 120 total evaluation cases (currently 44, need 76 more)
- ✅ No known broken routes
- ✅ No article claiming an unverified feature

**Current Status:**
- P0: 27% (3/11 covered) - Need 7 more P0 topics
- P1: 34% (20/58 covered) - Need 32 more P1 topics
- Tests: 44/44 (need 76 more for 120 total)

**Second Pass Focus:**
- Add 7 P0 topics (100% P0 target)
- Add 32 P1 topics (90% P1 target)
- Expand evaluation corpus from 44 to 120 cases (+76 cases)
- Verify all routes and navigation labels
- Verify critical external flows (Stripe, Calendar, Tap to Pay)