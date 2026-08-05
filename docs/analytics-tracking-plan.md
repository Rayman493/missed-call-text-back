# ReplyFlow Analytics Tracking Plan

## Overview

This document describes the anonymous product event tracking implemented for ReplyFlow. All events include:
- `businessId`: Business identifier
- `timestamp`: Event timestamp
- `platform`: 'ios' | 'android' | 'web'
- `appVersion`: Application version

## Architecture

**Provider-Agnostic Design**
- Single canonical analytics abstraction in `src/lib/analytics/`
- Easy to swap providers (PostHog, Mixpanel, Amplitude, custom backend)
- No scattered analytics calls throughout codebase
- Fail-safe: Analytics failures never block business operations

**Files Created**
1. `src/lib/analytics/analytics-types.ts` - Canonical types and event definitions
2. `src/lib/analytics/analytics-service.ts` - Provider-agnostic service
3. `src/lib/analytics/analytics-init.ts` - Initialization configuration
4. `src/lib/analytics/providers/noop-provider.ts` - No-op provider for development

## Event Tracking

### Account Events

#### account_created
- **When**: User completes signup and business row is created
- **Location**: `src/app/api/auth/complete-signup/route.ts` (line 197)
- **Properties**: `{ signupMethod: 'email' }`
- **Why Matters**: Tracks new business acquisition, signup funnel completion

#### onboarding_started
- **When**: User lands on onboarding page
- **Location**: `src/app/onboarding/page.tsx` (line 100)
- **Properties**: `{ step: 'profile_setup' }`
- **Why Matters**: Tracks onboarding funnel entry point, identifies drop-off before setup completion

#### onboarding_completed
- **When**: User completes Stripe checkout and subscription becomes active
- **Location**: `src/app/complete-setup/page.tsx` (line 121)
- **Properties**: `{ durationMs: number }`
- **Why Matters**: Tracks onboarding completion rate, time-to-value

### Business Events

#### ai_call_answered
- **When**: AI call is answered by customer
- **Location**: TBD (not yet integrated)
- **Properties**: `{ callDuration?: number, aiConfidence?: number }`
- **Why Matters**: Tracks AI engagement effectiveness, call quality

#### customer_created
- **When**: New lead/customer is created
- **Location**: `src/app/api/leads/route.ts` (line 284)
- **Properties**: `{ source: 'manual' | 'ai_call' | 'import' }`
- **Why Matters**: Tracks customer acquisition sources, CRM growth

#### appointment_scheduled
- **When**: New appointment is scheduled
- **Location**: `src/app/dashboard/leads/[id]/page-client.tsx` (line 2977)
- **Properties**: `{ isRecurring?: boolean }`
- **Why Matters**: Tracks scheduling activity, recurring business value

#### job_created
- **When**: New job is created
- **Location**: `src/app/dashboard/leads/[id]/page-client.tsx` (line 2980)
- **Properties**: `{ jobType?: string }`
- **Why Matters**: Tracks job creation volume, service types

#### job_completed
- **When**: Job is marked as completed
- **Location**: `src/app/dashboard/leads/[id]/page-client.tsx` (line 1539)
- **Properties**: `{ duration?: number }`
- **Why Matters**: Tracks job completion rate, service delivery speed

#### payment_requested
- **When**: Payment request is created
- **Location**: `src/app/dashboard/payments/page.tsx` (line 359)
- **Properties**: `{ amount?: number, provider: 'stripe' | 'paypal' | 'tap_to_pay' }`
- **Why Matters**: Tracks payment request volume, provider usage

#### payment_received
- **When**: Payment is marked as received
- **Location**: TBD (not yet integrated)
- **Properties**: `{ amount?: number, provider: 'stripe' | 'paypal' | 'tap_to_pay' }`
- **Why Matters**: Tracks revenue collection, payment success rate

#### message_sent
- **When**: SMS/MMS message is sent
- **Location**: `src/app/dashboard/leads/[id]/page-client.tsx` (line 2404)
- **Properties**: `{ direction: 'inbound' | 'outbound', hasMedia?: boolean }`
- **Why Matters**: Tracks communication activity, engagement metrics

### Intelligence Events

#### daily_brief_opened
- **When**: Daily Brief is loaded and displayed
- **Location**: `src/components/DailyBrief.tsx` (line 33)
- **Properties**: `{ itemCount?: number }`
- **Why Matters**: Tracks intelligence feature adoption, content engagement

#### focus_item_viewed
- **When**: Focus item is viewed
- **Location**: TBD (not yet integrated)
- **Properties**: `{ itemType?: string, priority?: string }`
- **Why Matters**: Tracks Focus feature usage, item prioritization

#### focus_item_completed
- **When**: Focus item is marked as completed
- **Location**: TBD (not yet integrated)
- **Properties**: `{ itemType?: string, priority?: string }`
- **Why Matters**: Tracks Focus feature effectiveness, task completion

#### draft_approved
- **When**: AI draft is approved
- **Location**: TBD (not yet integrated)
- **Properties**: `{ draftType?: string }`
- **Why Matters**: Tracks AI draft adoption, content quality

#### draft_edited
- **When**: AI draft is edited before sending
- **Location**: TBD (not yet integrated)
- **Properties**: `{ draftType?: string }`
- **Why Matters**: Tracks draft editing patterns, AI accuracy

#### draft_discarded
- **When**: AI draft is discarded
- **Location**: TBD (not yet integrated)
- **Properties**: `{ draftType?: string }`
- **Why Matters**: Tracks draft rejection rate, AI relevance

## Integration Status

### Completed Integrations
- ✅ account_created
- ✅ onboarding_started
- ✅ onboarding_completed
- ✅ customer_created
- ✅ appointment_scheduled
- ✅ job_created
- ✅ job_completed
- ✅ payment_requested
- ✅ message_sent
- ✅ daily_brief_opened

### Pending Integrations
- ⏳ ai_call_answered
- ⏳ payment_received
- ⏳ focus_item_viewed
- ⏳ focus_item_completed
- ⏳ draft_approved
- ⏳ draft_edited
- ⏳ draft_discarded

## Privacy & Data Collection

**Anonymous Tracking**
- No user identification (no email, name, PII)
- Business ID only for aggregation and cohorting
- No customer-specific data in events
- Timestamps only for time-based analysis

**Fail-Safe Design**
- Analytics errors logged but never block business operations
- No user-facing error messages for analytics failures
- Graceful degradation if analytics service is unavailable

## Provider Configuration

**Development**
- Uses NoOpProvider with console logging
- Events logged to console for development verification
- No actual data sent to analytics providers

**Production**
- Configure actual providers in `src/lib/analytics/analytics-init.ts`
- Example providers: PostHog, Mixpanel, Amplitude, custom backend
- Environment variables for API keys

## Initialization

Call `initializeAnalytics()` during app initialization:
```typescript
import { initializeAnalytics } from '@/lib/analytics/analytics-init'

// In app initialization
await initializeAnalytics()
```

## Usage Example

```typescript
import { analyticsService } from '@/lib/analytics/analytics-service'

// Track an event
analyticsService.track('customer_created', { source: 'manual' }, businessId)
```

## Data Retention & Compliance

- Configure retention policies at the provider level
- Ensure compliance with privacy regulations (GDPR, CCPA)
- Business ID can be mapped to user for data deletion requests
- No PII in event payloads

## Future Enhancements

1. Add remaining pending integrations
2. Add funnel analysis events
3. Add A/B testing event support
4. Add cohort tracking
5. Add revenue attribution events
6. Add feature flag integration
