# ReplyFlow Assistant Architecture Audit - Part 1

**Date:** 2025-01-09
**Goal:** Audit current assistant architecture from UI to answer

---

## Executive Summary

The ReplyFlow Assistant is a **static, keyword-based, semantic retrieval system** with no AI model calls. It uses a lightweight intent-based search engine built on a structured knowledge base. The system is entirely client-side with no API routes, no external model calls, and no network requests for search.

---

## 1. Exact UI Component and Route

### Desktop Component
**File:** `src/components/FloatingHelpButton.tsx`
- Floating button in bottom-right corner (desktop: `bottom-6 right-6 lg:right-[calc(50%-700px)]`)
- Hidden on specific routes: `/setup`, `/onboarding`, `/auth`, `/checkout`, `/billing`, `/stripe`
- Opens centered modal at `z-[9999]` with max-width `480px`

### Mobile Component
**File:** `src/components/AssistantMobileShell.tsx`
- Bottom-sheet shell for mobile devices
- Locks background scroll, signals bottom nav to hide
- Intercepts Android Back button

### Main Assistant Component
**File:** `src/components/ReplyFlowAssistant.tsx`
- Size: 659 lines
- State management: React hooks (useState, useRef, useEffect, useMemo, useCallback)
- No external state management library

### Render Locations
- Desktop: Modal overlay in `FloatingHelpButton.tsx` (lines 57-64)
- Mobile: Bottom sheet in `AssistantMobileShell.tsx` (portal-rendered)
- Context can be passed to customize suggestions

---

## 2. Exact Source of Truth for Assistant Knowledge

**File:** `src/lib/assistant/knowledge-base.ts`
- Size: 1,088 lines
- Format: Static TypeScript array of `AssistantArticle[]`
- Article count: 57 articles
- Exported as `KNOWLEDGE_BASE` constant

### Article Structure
```typescript
{
  id: string                    // Stable article ID
  question: string              // The question the article answers
  answer: string                // The full answer
  summary: string               // Short summary for search
  category: string              // Category for grouping
  source: string                // Source document name
  keywords: string[]            // Search keywords
  readingTime?: number          // Estimated reading time in minutes
  lastUpdated?: string          // Last updated date (YYYY-MM-DD)
  relatedQuestions?: string[]   // Related article questions
}
```

### Categories Present
- Overview
- Call Forwarding
- Testing
- Features
- Setup
- Billing
- Compliance
- Dashboard
- Leads
- Lead Detail
- Calendar
- Settings
- Troubleshooting
- Support
- Onboarding
- Customers & Conversations
- Payments
- Tap to Pay
- Billing & Subscription
- Platform

---

## 3. Response Type: Static, Keyword-Based, Semantic Retrieval

**Type:** Static keyword-based with semantic intent aliases
**No AI model calls**
**No network requests for search**

### Retrieval Method
1. **Exact topic/phrase match** (score +100)
2. **Keyword match** (score +30)
3. **Semantic intent match** via alias clusters (score +20/+12)
4. **Fuzzy matching** (score +3 or wordSimilarity * 3)
5. **Keyword overlap** (score +2)
6. **Context-based boosting** (score +3 to +6)
7. **Category page boosting** (score +4)

### Scoring Thresholds
- **High confidence:** score >= 40
- **Medium confidence:** score >= 20
- **Low confidence:** score >= 5 (default minScore)
- **No result:** score == 0

### Deduplication
- Deduplicates by article ID, keeping highest score
- Implemented in `ReplyFlowAssistantEngine.search()` (lines 19-26)

---

## 4. Model/Provider Usage

**No AI model used**
**No external provider used for search**

The search is entirely algorithmic:
- Levenshtein distance for word similarity
- Intent alias mapping for semantic expansion
- Fuzzy matching for typo tolerance
- Context-aware boosting

**External Providers Used:**
- None for search/retrieval
- Stripe portal links (customer navigates to Stripe)
- Google Calendar (customer navigates to Google)
- Carrier websites (customer navigates to carrier)

---

## 5. Documentation/Context Supplied

### Static Context (from Knowledge Base)
- Article question, answer, summary, keywords
- Category
- Related questions
- Reading time
- Last updated date

### Dynamic Context (AssistantContext)
Passed from parent component:
```typescript
interface AssistantContext {
  currentPage?: 'dashboard' | 'leads' | 'lead-detail' | 'calendar' | 'settings' | 'onboarding'
  hasLeads?: boolean
  hasRecentActivity?: boolean
  forwardingVerified?: boolean
  calendarConnected?: boolean
  hasNotifications?: boolean
  isTrial?: boolean
  businessId?: string
  userId?: string
}
```

### Context Usage
- **Boosting:** Context boosts certain articles (lines 180-211 in search-engine.ts)
  - `forwardingVerified === false` → boosts forwarding troubleshooting
  - `calendarConnected === false` → boosts calendar troubleshooting
  - `hasLeads === false` → boosts lead/test troubleshooting
  - `isTrial` → boosts billing articles
  - `currentPage` → boosts articles matching current page category
- **Suggested Articles:** Context determines suggested articles (lines 65-89 in documentation-provider.ts)
- **Account-Specific Queries:** Context determines if query is account-specific (line 29 in documentation-provider.ts)

### No Business/Customer Data Included
- No customer conversations
- No payment information
- No call recordings
- No business-specific metrics
- No sensitive data from database

---

## 6. Source Citation/Identification

**Current Behavior:** Articles show source field in metadata
- Displayed in article view: `source` field shown with reading time and last updated
- Example: "Source: Product Guide", "Source: FAQ"
- Not a URL or clickable link (static text)

**No Inline Citations:** Answers do not cite specific sections or line numbers
**No External Links:** No links to external documentation (except Stripe portal mentioned in text)

---

## 7. Confidence/No-Match Behavior

### Confidence Classification
```typescript
let confidence: SearchResult['confidence'] = 'low'
if (score >= 40) confidence = 'high'
else if (score >= 20) confidence = 'medium'
```

### No-Match Behavior
**Current Implementation:**
- If no results: `isAccountSpecific` flag set based on `isAccountSpecificQuery()` (search-engine.ts lines 257-269)
- UI displays: "I couldn't find a reliable answer for that yet."
- Suggested articles shown as fallback
- No escalation to support in current implementation

### Account-Specific Query Detection
Queries containing phrases like:
- "why did my sms fail"
- "sms failed", "message not delivered"
- "why didn't my lead appear"
- "unexpected charge", "billing error"
- "ai not working", "ai voice not working"
- "customer didn't get text"
- "my specific", "my account"
- "why is it not working"

These are flagged as account-specific and documentation provider returns empty results.

---

## 8. Error and Timeout Handling

### Current Implementation
**No Network Errors:** Search is entirely client-side, no API calls
**No Timeouts:** Search is synchronous, no async operations
**No Error States:** No error boundary or error handling for search failures

### Loading State
- Artificial 300ms delay for UX (line 191 in ReplyFlowAssistant.tsx)
- `isSearching` state shows loading indicator
- No retry logic (not needed for local search)

### Fallback Behavior
- If search returns no results: Show suggested articles
- If article ID not found: Silent fail (line 157-159)
- No error logging for search failures

---

## 9. User/Business Data Inclusion

**No User/Business Data Included in Search**
- Customer conversations: NOT included
- Business metrics: NOT included
- Payment history: NOT included
- Call recordings: NOT included
- Business settings: NOT included
- User profile: NOT included

### Context Data (Safe)
Only non-sensitive context is passed:
- Page location
- Boolean flags (hasLeads, calendarConnected, etc.)
- Business ID (for future expansion, not currently used)
- User ID (for future expansion, not currently used)

### Data Access Pattern
- Knowledge base is static (compiled into app bundle)
- No database queries for search
- No API calls for search
- No cross-tenant data access possible

---

## 10. Tenant Isolation Enforcement

### Current Implementation
**Knowledge Base:** Single static array shared across all tenants
**No Tenant-Specific Knowledge:** All businesses see the same articles
**No Business Data Access:** Search doesn't access tenant-specific data

### Isolation Mechanisms
1. **Static Knowledge Base:** Compiled into app bundle, same for all users
2. **No Database Access:** Search doesn't query database
3. **No API Routes:** Search is entirely client-side
4. **Context Flags:** Only boolean flags passed, no sensitive data

### Potential Gaps
- Business ID and User ID are in context but not used
- No way to provide business-specific documentation
- No way to provide account-specific troubleshooting guidance
- Account-specific queries are rejected entirely rather than providing generic guidance

---

## 11. Prior Questions Impact

**No Conversation State**
- Each search is independent
- No history of previous questions
- No follow-up context
- No conversation memory

### Implementation
- `performSearch` is called with fresh query each time (line 181-211)
- No state is preserved between searches
- `reset` function clears all state (line 166-179)
- No chat history or session management

---

## 12. Product Areas with No Coverage

Based on knowledge base audit (57 articles):

### Missing Coverage Areas

#### Getting Started
- ❌ Account creation flow
- ❌ First 15 minutes detailed walkthrough
- ❌ Business profile setup details
- ❌ Business address setup
- ❌ Business type selection impact
- ❌ Navigation basics (menu structure)
- ❌ Supported devices (iOS vs Android requirements)
- ❌ Web vs native app differences (partially covered in "desktop-vs-mobile")

#### Business Number and Forwarding
- ✅ Forwarding basics (covered)
- ✅ Carrier codes (covered)
- ✅ Testing (covered)
- ❌ ReplyFlow number provisioning process
- ❌ Why a separate ReplyFlow number exists
- ❌ What happens when forwarding fails (partially covered in troubleshooting)
- ❌ What callers experience when forwarding works
- ❌ Changing the business phone (partially covered in "update-forwarding")
- ❌ Forwarding verification detailed steps

#### AI Receptionist
- ✅ How AI Voice works (covered)
- ✅ Business types (covered)
- ✅ Voicemail fallback (covered)
- ❌ Intake stages detailed (what questions are asked when)
- ❌ Service-location modes (onsite vs customer comes to business)
- ❌ Completed vs partial intake distinction
- ✅ Repeat callers (covered in "ignored-contacts-ai")
- ✅ Personal contacts (covered in "ignored-contacts-ai")
- ✅ Voicemail fallback (covered)
- ❌ When the AI answers (exact conditions)
- ❌ What happens after a call (detailed workflow)
- ✅ SMS confirmation behavior (covered in "sms-timing")
- ✅ Correcting intake information (covered in "customer-corrections")
- ❌ AI limitations detailed (covered in "replyflow-limitations")

#### Customers and Conversations
- ✅ Customers vs Leads (covered)
- ✅ Lead statuses (covered)
- ❌ Needs Reply (status)
- ❌ Active (status)
- ❌ Completed (status)
- ❌ Ignored (status)
- ✅ Viewing AI Intake (covered in "ai-intake-meaning")
- ❌ Reading transcripts (not covered - no transcript access in UI)
- ❌ Editing customer details
- ✅ Replying by SMS (covered)
- ✅ Sending MMS (covered)
- ✅ Correcting addresses (covered in "customer-corrections")
- ❌ Customer timelines (not covered)
- ❌ Request History (not covered)
- ❌ Internal notes (not covered)
- ✅ Duplicate customers (covered in "duplicate-lead")
- ✅ Opt-outs (covered in "opt-out")
- ❌ Deleting customer records

#### Schedule, Appointments, Jobs, and Tasks
- ✅ Connecting Google Calendar (covered)
- ❌ Calendar permissions detailed
- ❌ Creating appointments (not covered)
- ❌ Editing/deleting appointments (not covered)
- ❌ Google Meet integration
- ❌ Schedule Map (not covered)
- ❌ Business vs customer locations
- ❌ Creating and managing jobs
- ❌ Creating and managing tasks
- ❌ Agenda behavior
- ❌ Missing events troubleshooting
- ❌ Calendar disconnection/reconnection
- ❌ Time zones

#### Payments
- ✅ Payment Requests overview (covered)
- ✅ Create and send Payment Request (covered)
- ❌ Connecting Stripe detailed steps
- ❌ Stripe verification pending troubleshooting
- ❌ Customer payment link experience
- ❌ Marking payments paid
- ❌ Cancelling requests
- ❌ Payment history
- ❌ Venmo
- ❌ PayPal
- ✅ Tap to Pay requirements (covered)
- ❌ Tap to Pay on iPhone vs Android
- ❌ Device requirements detailed
- ❌ Merchant education
- ❌ Receipts
- ❌ Cancellations
- ❌ Failed payments
- ❌ Refund guidance
- ❌ Stripe-owned vs ReplyFlow-owned actions

#### Notifications
- ❌ In-app notifications
- ❌ Push notifications
- ❌ Permission prompts
- ❌ Enabling/disabling categories
- ❌ Denied permissions
- ❌ Device-specific settings
- ❌ Why notification may not arrive
- ❌ Notification Center
- ❌ Marking notifications read

#### Settings and Account
- ✅ Business hours (covered)
- ❌ Business settings detailed
- ❌ Sending-source settings
- ❌ Personal communication settings
- ❌ Password changes
- ✅ Subscription management (covered)
- ✅ Billing portal (covered)
- ❌ Data/privacy
- ❌ Account deletion
- ❌ Signing out
- ✅ Support/contact (covered)

#### Troubleshooting
- ✅ SMS not sent (covered)
- ✅ Call forwarding not working (covered)
- ✅ Test call failed (covered)
- ✅ No lead appeared (covered)
- ✅ AI intake incomplete (covered)
- ✅ Caller hung up (covered)
- ✅ Partial intake (covered)
- ✅ Duplicate lead (covered)
- ✅ Follow-ups not sending (covered)
- ✅ Customer replied automation active (covered)
- ✅ Calendar not connected (covered)
- ✅ Billing portal issues (covered)
- ❌ App appears offline
- ❌ Number not provisioned
- ❌ Customer not created (partially covered)
- ❌ Calendar event missing (partially covered)
- ❌ Stripe not connected
- ❌ Stripe verification pending
- ❌ Tap to Pay unavailable
- ❌ Tap to Pay canceled
- ❌ Push notification missing
- ❌ Permission denied
- ❌ Stale data
- ❌ When to refresh/reopen app
- ❌ When to contact support (partially covered)

---

## 13. Stale or Incorrect Documentation

### Potential Stale Content

#### Navigation Labels (Need Verification)
- "Dashboard → Calendar" (line 420 in knowledge-base.ts)
- "Dashboard → Settings → Subscription" (line 170)
- "Dashboard → Settings → Business Hours" (line 442)
- "Dashboard → Settings" (line 137)
- "Payments → Request Payment" (line 899)
- "Dashboard → Leads" (line 365)

**Action Required:** Verify these navigation paths match current UI

#### Carrier Codes (Need Verification)
- Verizon: *71 enable, *73 disable
- AT&T: *004*number# enable, #004# disable
- T-Mobile: **61*number# enable, #61# disable
- Comcast/Xfinity: *72 enable, *73 disable

**Action Required:** Verify with carrier documentation

#### Platform-Specific Features
- "Tap to Pay requirements" mentions mobile app but doesn't distinguish iOS vs Android
- "desktop-vs-mobile" article may need updates if platform differences change

#### Last Updated Dates
- Many articles have no `lastUpdated` date
- Some have future dates (2026) which appear to be placeholders
- Need audit of actual last updated dates

### Potential Incorrect Content

#### "How do I disable call forwarding?" (line 627)
- References canonical "Disable call forwarding" article but this is the same article
- Self-referential related question

#### Account-Specific Query Handling
- Account-specific queries are entirely rejected rather than providing generic guidance
- May frustrate users with legitimate account issues

---

## 14. Broken or Nonexistent Routes

### Routes Mentioned in Knowledge Base
Need verification against actual Next.js routes:

**Potentially Problematic:**
- "Dashboard → Calendar" - verify route is `/dashboard/calendar`
- "Dashboard → Settings → Subscription" - verify route is `/dashboard/settings`
- "Payments → Request Payment" - verify route is `/dashboard/payments` or similar
- "Dashboard → Leads" - verify route is `/dashboard/leads`

**No Route Validation:** Current system doesn't validate routes mentioned in articles
**No Link Clicking:** Routes are mentioned as text, not clickable links
**Risk:** If navigation changes, articles become outdated

---

## Runtime Call Path Summary

```
User types query
  ↓
ReplyFlowAssistant.handleSearchSubmit()
  ↓
performSearch(query)
  ↓
engine.search(query, context, { limit: 5 })
  ↓
ReplyFlowAssistantEngine.search()
  ├─ Loop through providers
  ├─ Check provider.canAnswer(query, context)
  └─ Call provider.search(query, context, options)
      ↓
DocumentationProvider.search()
  ↓
searchArticles(articles, query, context, options)
  ↓
For each article:
  ├─ scoreArticle(query, article, context)
  │   ├─ Normalize query and article text
  │   ├─ Exact phrase match (+100)
  │   ├─ Keyword match (+30)
  │   ├─ Intent alias match (+20/+12)
  │   ├─ Fuzzy word match (+3)
  │   ├─ Keyword overlap (+2)
  │   ├─ Context boost (+3 to +6)
  │   └─ Page boost (+4)
  │   ├─ Classify confidence (high/medium/low)
  │   └─ Return null if score == 0
  └─ Filter by minScore and minConfidence
      ↓
Sort by score (descending)
  ↓
Slice to limit (default 5)
  ↓
Deduplicate by article ID
  ↓
Return SearchResult[]
  ↓
ReplyFlowAssistant displays results
  ├─ If results: Show list with highlighting
  ├─ If no results: Show "couldn't find answer" + suggested articles
  └─ If account-specific: Show "account-specific" message
```

---

## Security and Privacy Findings

### Strengths
✅ No external API calls for search
✅ No database access for search
✅ No customer data in search
✅ No cross-tenant data access
✅ Static knowledge base (immutable)
✅ No prompt injection risk (no AI model)
✅ No secrets in search context

### Potential Gaps
⚠️ Business ID and User ID passed but unused (future risk if misused)
⚠️ No validation of context values
⚠️ No rate limiting on search (client-side only)
⚠️ No logging of search queries (can't identify unanswered questions)
⚠️ No observability for search failures

---

## Observability Findings

### Current Observability
❌ No query logging
❌ No result quality tracking
❌ No error tracking
❌ No usage analytics
❌ No feedback collection
❌ No performance monitoring

### Missing Metrics
- Query frequency
- Zero-result queries
- Low-confidence results
- Article click-through rates
- Time spent on articles
- User satisfaction (helpful/not helpful)

---

## Next Steps

Based on this audit, the following improvements are needed:

1. **Knowledge Coverage Audit:** Systematically audit all product areas for missing articles
2. **Navigation Verification:** Verify all navigation paths mentioned in articles
3. **Route Validation:** Add route validation or remove hardcoded paths
4. **Account-Specific Handling:** Improve handling of account-specific queries
5. **Observability:** Add logging and analytics
6. **Testing:** Create evaluation corpus and test suite
7. **Fallback Behavior:** Improve no-match behavior with escalation
8. **Context Safety:** Review and validate context usage