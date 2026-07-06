# ReplyFlow Native Mobile App Audit

**Date**: July 5, 2026  
**Purpose**: Planning audit for future native mobile app development  
**Constraint**: Web app remains source of truth; this is future planning only

---

## Executive Summary

**Recommended Approach**: React Native with Expo (managed workflow)  
**Recommended Timeline**: Start after 100 paying customers or $50k MRR  
**MVP Timeline**: 12-16 weeks (one dev + AI assistance)  
**App Store-Ready Timeline**: 20-24 weeks total  
**Code Reuse**: ~40% of business logic can be reused via shared API layer

---

## Current ReplyFlow Architecture Analysis

### Tech Stack
- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Next.js API routes, Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email/password, OAuth)
- **SMS/Twilio**: Server-side Twilio integration via API routes
- **Payments**: Stripe Checkout (web redirect flow)
- **Calendar**: Google Calendar API integration
- **Real-time**: Supabase real-time subscriptions
- **Push Notifications**: Not currently implemented

### Key Screens & Features (Current)

**Dashboard**:
- Setup health status
- KPI metrics (missed calls, conversion rate, response time)
- Recent leads list
- Recent activity feed
- Business wins card
- Payments shortcut
- Beta feedback card
- Admin diagnostics (dev only)

**Leads**:
- Lead list with filters (status, source, date)
- Lead detail view with full conversation
- SMS composer (manual replies)
- AI intake summary display
- Lead status management
- Lead timeline/activity
- Ignore contacts management
- SMS verification banner

**Calendar**:
- Calendar grid view
- Today's schedule sidebar
- Job management (create, edit, delete)
- Google Calendar sync
- Event composer
- Day detail modal
- Job details modal

**Payments**:
- Payment request creation
- Payment status tracking
- Payment link management
- Overview stats (pending, paid, collection rate)

**Settings**:
- General (business name, phone)
- Automation (auto-reply, follow-ups)
- Calendar connection
- Payments (Venmo, PayPal, Stripe)
- Contacts (ignored list)
- Account (subscription, billing)
- Account deletion

**Notifications**:
- In-app notification center
- Notification preferences

---

## Tech Stack Evaluation

### Option 1: React Native / Expo (Managed Workflow)

**Timeline for MVP**: 12-16 weeks  
**Timeline for App Store-Ready**: 20-24 weeks

**Development Complexity**: Medium-Low

**Code Reuse from Current App**: 35-40%
- Authentication context logic: Reusable with Supabase JS SDK
- API route calls: Reusable via fetch/axios
- Business logic libraries: 70% reusable (typescript files in `/src/lib`)
- UI components: 5-10% reusable (need native equivalents)
- State management: Reusable (React hooks)

**Authentication Approach**:
- Supabase JS SDK has full React Native support
- Can reuse existing Supabase auth configuration
- Session management similar to web
- OAuth flows supported via Expo Auth Session

**API Reuse**:
- 100% of existing API routes can be reused
- No backend changes required
- Same authentication headers via Supabase session tokens
- Real-time subscriptions via Supabase Realtime (supported)

**Push Notifications**:
- Expo Notifications (Firebase-based)
- Requires Firebase project setup
- Can trigger push via Supabase Edge Functions or existing API routes
- Medium complexity integration

**Twilio/SMS Conversation Handling**:
- All SMS handling is server-side via Twilio webhooks
- Mobile app only needs to fetch/display messages via API
- SMS sending via API routes (send-sms endpoint)
- No direct Twilio client needed on mobile
- Low complexity

**Calendar Integration**:
- Google Calendar sync is server-side
- Mobile app displays calendar data via API
- Event creation via API routes
- OAuth flow for Google Calendar via Expo Auth Session
- Medium complexity

**Payments/Stripe Limitations**:
- Current Stripe integration uses web redirect (Checkout)
- Mobile apps require Stripe Mobile SDK for in-app payments
- Need new API routes for mobile payment flows
- Stripe React Native SDK available
- Medium complexity (requires payment flow redesign)

**Settings/Account Deletion**:
- Reuse existing settings API routes
- Account deletion API route exists
- Native UI required
- Low complexity

**App Review Risks**:
- **High Risk**: SMS-based missed call service may trigger review scrutiny
- **Medium Risk**: Payment processing (Stripe requires proper disclosure)
- **Low Risk**: Standard business app features
- **Mitigation**: Clear privacy policy, terms of service, transparent data handling

**Maintenance Burden**: Low-Medium
- Expo manages native dependencies
- Regular SDK updates required
- App store submission process every update
- Push notification certificate management

**Pros**:
- Fastest development time
- Large React Native ecosystem
- Easy to hire React Native developers
- Can share TypeScript types/interfaces
- Over-the-air updates (OTA) available
- Good developer experience

**Cons**:
- Expo managed workflow has some native module limitations
- Performance slightly lower than pure native
- App size larger than pure native
- Less control over native features

---

### Option 2: React Native Bare Workflow

**Timeline for MVP**: 14-18 weeks  
**Timeline for App Store-Ready**: 24-28 weeks

**Development Complexity**: Medium-High

**Code Reuse from Current App**: 35-40% (same as Expo)

**Authentication Approach**: Same as Expo (Supabase JS SDK)

**API Reuse**: 100% (same as Expo)

**Push Notifications**:
- Firebase Cloud Messaging (FCM) directly
- More control than Expo
- Higher complexity setup

**Twilio/SMS**: Same as Expo (low complexity)

**Calendar**: Same as Expo (medium complexity)

**Payments**: Same as Expo (medium complexity)

**Settings/Account Deletion**: Same as Expo (low complexity)

**App Review Risks**: Same as Expo

**Maintenance Burden**: Medium-High
- Must manage Xcode/Android Studio projects
- Native dependency management
- Platform-specific build issues
- Longer build times

**Pros**:
- Full native module access
- Better performance than managed Expo
- No Expo limitations
- More customization options

**Cons**:
- Slower development than Expo
- Higher technical complexity
- Need native iOS/Android knowledge
- No OTA updates without separate service
- Steeper learning curve

---

### Option 3: Swift iOS + Kotlin Android (Pure Native)

**Timeline for MVP**: 24-32 weeks  
**Timeline for App Store-Ready**: 32-40 weeks

**Development Complexity**: High

**Code Reuse from Current App**: 10-15%
- API route calls: Reusable via HTTP clients
- Business logic: Must be ported to Swift/Kotlin
- UI components: Zero reuse
- State management: Must be rebuilt (Combine/Flow)
- TypeScript types: Must be recreated

**Authentication Approach**:
- Supabase has Swift and Kotlin SDKs
- Auth flows require platform-specific implementation
- Session management differs from React
- Medium-High complexity

**API Reuse**: 100% of API routes can be reused

**Push Notifications**:
- iOS: Apple Push Notification Service (APNs)
- Android: Firebase Cloud Messaging (FCM)
- Platform-specific implementation required
- High complexity

**Twilio/SMS**: Same as React Native (low complexity, server-side)

**Calendar Integration**:
- iOS: EventKit framework
- Android: Calendar Provider API
- Platform-specific implementation
- Google Calendar sync requires OAuth
- High complexity

**Payments/Stripe Limitations**:
- iOS: Stripe iOS SDK
- Android: Stripe Android SDK
- Platform-specific payment flows
- High complexity

**Settings/Account Deletion**: Low-Medium complexity (native UI required)

**App Review Risks**: Same as other options

**Maintenance Burden**: High
- Separate codebases for iOS and Android
- Platform-specific bugs and features
- Double maintenance effort
- Need both Swift and Kotlin expertise

**Pros**:
- Best performance
- Full platform feature access
- Best user experience (native feel)
- No framework limitations

**Cons**:
- Very slow development
- High cost (2x development effort)
- Harder to hire specialized talent
- Code duplication between platforms
- Longer time to market

---

### Option 4: Capacitor Web Wrapper (Comparison Only)

**Timeline for MVP**: 4-6 weeks  
**Timeline for App Store-Ready**: 8-10 weeks

**Development Complexity**: Low

**Code Reuse from Current App**: 90-95%
- Wrap existing web app in native container
- Minimal code changes required
- Web functionality preserved

**Authentication**: Same as web (Supabase)

**API Reuse**: 100%

**Push Notifications**:
- Capacitor Push Notifications plugin
- Medium complexity
- Firebase required

**Twilio/SMS**: Same as web (no changes)

**Calendar**: Same as web (no changes)

**Payments**: Same as web (Stripe Checkout still works in webview)

**Settings/Account Deletion**: Same as web (no changes)

**App Review Risks**:
- **High Risk**: Apple may reject if app is just a website wrapper
- Apple requires native-like experience
- Must justify why native app needed
- Risk of rejection for "minimal functionality"

**Maintenance Burden**: Low
- Most changes in web app
- Native layer rarely touched
- Capacitor updates infrequent

**Pros**:
- Fastest time to market
- Maximum code reuse
- Easy to maintain
- Low cost

**Cons**:
- **Not recommended** for this use case
- Poor user experience (web in native container)
- App Store rejection risk
- Performance issues
- Limited native features
- Doesn't meet "true native app" requirement

**Verdict**: Not recommended for ReplyFlow. Use only as temporary bridge or for internal testing.

---

## Screen Classification

### Must-Have Native MVP

**Dashboard**:
- KPI metrics
- Recent leads (simplified)
- Setup health status
- Notifications badge

**Leads**:
- Lead list with basic filters
- Lead detail with conversation
- SMS composer
- Lead status management
- AI intake summary display

**Conversation/SMS Thread**:
- Full conversation view
- Message input/composer
- Message history
- Media attachment support
- Timestamps

**Lead Detail**:
- Contact information
- Call history
- AI intake data
- Notes/memo
- Timeline

**Notifications**:
- Notification list
- Notification detail
- Mark as read
- Notification settings (basic)

**Settings Basics**:
- Profile settings
- Business name/phone
- Notification preferences
- Sign out
- Account deletion

### Later/Native V2

**Calendar**:
- Full calendar grid
- Google Calendar sync
- Job management
- Event creation

**Payments**:
- Payment request creation
- Payment history
- Payment link management
- In-app payment processing

**Analytics**:
- Advanced metrics
- Charts/graphs
- Export functionality
- Date range filters

**Advanced Settings**:
- Automation rules
- Follow-up configuration
- Smart filtering
- Calendar connection
- Payment method configuration

**Admin Tools**:
- Business diagnostics
- Twilio status
- Webhook health
- Developer tools

---

## Recommended Architecture

### Tech Stack: React Native with Expo (Managed Workflow)

**Rationale**:
- Balances development speed with native performance
- Best fit for single developer + AI assistance
- Strong ecosystem and community support
- Supabase has first-class React Native support
- Can leverage existing React/TypeScript knowledge
- Easiest to maintain long-term

### Architecture Layers

**1. Shared Layer** (Monorepo recommended)
- `/shared`: TypeScript interfaces, types, constants
- `/shared/lib`: Business logic (ported from `/src/lib`)
- `/shared/api`: API client utilities
- `/shared/utils`: Helper functions

**2. Mobile App** (React Native + Expo)
- `/app`: React Native screens and navigation
- `/components`: Native UI components
- `/hooks`: Custom React hooks
- `/services`: API service layer
- `/navigation`: React Navigation setup

**3. Backend** (Existing - No Changes)
- Continue using existing Next.js API routes
- Supabase as database and auth
- Twilio for SMS
- Stripe for payments
- Google Calendar integration

### Key Libraries

**Core**:
- Expo SDK (latest)
- React Native 0.73+
- TypeScript
- Expo Router (file-based routing)

**State Management**:
- Zustand or React Context (keep simple)
- React Query (TanStack Query) for API caching

**UI Components**:
- React Native Paper or NativeBase
- React Native Reanimated (animations)
- React Native Gesture Handler

**Auth**:
- @supabase/supabase-js (React Native compatible)
- Expo SecureStore for session persistence

**API**:
- Axios or fetch
- React Query for data fetching

**Push Notifications**:
- Expo Notifications
- Firebase Cloud Messaging

**Navigation**:
- Expo Router (React Navigation under the hood)

**Payments**:
- @stripe/stripe-react-native

**Calendar**:
- react-native-calendars
- Custom Google Calendar OAuth via Expo Auth Session

---

## MVP Scope Definition

### Features Included

**Authentication**:
- Email/password sign in
- Email/password sign up
- Password reset
- Session persistence
- OAuth (Google) - optional for MVP

**Dashboard**:
- KPI cards (missed calls, response rate)
- Recent leads list (last 10)
- Setup status indicator
- Notification badge

**Leads**:
- Lead list with status filter
- Pull-to-refresh
- Lead search
- Lead detail navigation

**Lead Detail**:
- Contact info
- Conversation thread
- SMS composer
- AI intake summary
- Lead status change
- Notes field

**Conversation**:
- Message list (chronological)
- Message composer
- Send message
- Auto-refresh on new messages
- Media attachment support

**Notifications**:
- Notification list
- Notification detail
- Mark as read
- Clear all

**Settings - Basic**:
- Business name edit
- Business phone edit
- Notification preferences
- Sign out
- Account deletion

### Features Excluded from MVP

- Calendar integration (V2)
- Payment creation (V2)
- Advanced analytics (V2)
- Follow-up automation (V2)
- Smart filtering (V2)
- Google Calendar sync (V2)
- In-app payments (V2)
- Admin tools (V2)
- Deep linking (V2)
- Offline mode (V2)
- Biometric auth (V2)

---

## What Can Reuse Existing Backend/API Routes

### 100% Reusable (No Changes)

**Authentication**:
- `/api/auth/*` - All auth endpoints
- Supabase auth configuration

**Leads & Conversations**:
- `/api/leads/*` - Lead CRUD operations
- `/api/lead-details/*` - Lead detail queries
- `/api/message-media/*` - Media upload/download
- `/api/conversations/*` - Conversation queries

**Messages**:
- `/api/send-sms` - SMS sending
- `/api/sms-processing/*` - SMS processing logic
- Twilio webhook endpoints (server-side)

**Notifications**:
- `/api/notifications/*` - Notification CRUD

**Business**:
- `/api/business/*` - Business operations
- `/api/business/provision-number` - Number provisioning
- `/api/business/forwarding-verify` - Forwarding verification

**Settings**:
- `/api/settings/*` - Settings CRUD
- `/api/ignored-contacts/*` - Ignored contacts management

**Account**:
- `/api/account/delete` - Account deletion

**Admin**:
- `/api/admin/*` - All admin endpoints (if needed in V2)

### Requires New API Routes

**Mobile Push Notifications**:
- New endpoint: `/api/push/register-device`
- New endpoint: `/api/push/send-test`
- Requires Firebase project setup

**Mobile-Specific Payments**:
- New endpoint: `/api/payments/create-mobile`
- New endpoint: `/api/payments/confirm-mobile`
- Requires Stripe Mobile SDK integration

**Calendar OAuth**:
- New endpoint: `/api/google/calendar/oauth-callback`
- New endpoint: `/api/google/calendar/sync-status`
- Required for V2

---

## What Must Be Rebuilt Natively

### 100% Native Implementation Required

**UI Components**:
- All screens (Dashboard, Leads, Settings, etc.)
- Navigation structure (tab bar, stack navigation)
- Input components (text fields, forms)
- Lists and cards
- Modals and sheets
- Pull-to-refresh
- Loading states

**State Management**:
- Local state (React hooks)
- Global state (Zustand/Context)
- Query state (React Query)
- Navigation state

**Navigation**:
- Tab navigation
- Stack navigation
- Modal navigation
- Deep linking (V2)

**Push Notifications**:
- Push token registration
- Push notification handling
- Notification display
- Notification action handling

**In-App Payments**:
- Stripe Mobile SDK integration
- Payment flow UI
- Payment confirmation UI

**Calendar (V2)**:
- Calendar UI component
- Event creation UI
- Google Calendar OAuth flow
- Calendar sync logic

**Device Features**:
- Camera/media picker for attachments
- Biometric auth (V2)
- Background tasks (V2)
- Offline storage (V2)

---

## Biggest Technical Risks

### 1. App Store/Play Store Approval (High Risk)
- **Risk**: SMS-based missed call service may be flagged as spam or deceptive
- **Mitigation**: Clear privacy policy, terms of service, transparent data handling
- **Contingency**: Be prepared for additional review questions

### 2. Push Notification Complexity (Medium Risk)
- **Risk**: Firebase setup, certificate management, platform differences
- **Mitigation**: Use Expo Notifications to simplify, thorough testing on both platforms
- **Contingency**: Delay push notifications to V2 if too complex

### 3. Calendar Integration Complexity (High Risk for V2)
- **Risk**: Google Calendar OAuth flow, sync logic, event conflicts
- **Mitigation**: Use existing calendar APIs, thorough testing, consider third-party SDK
- **Contingency**: Simplify calendar feature (read-only initially)

### 4. Payment Flow Redesign (Medium Risk)
- **Risk**: In-app payments require different Stripe integration
- **Mitigation**: Use Stripe React Native SDK, test thoroughly, fallback to web checkout
- **Contingency**: Delay payments to V2, use web checkout initially

### 5. Real-Time Message Updates (Medium Risk)
- **Risk**: Supabase real-time on mobile may have edge cases
- **Mitigation**: Test thoroughly, implement polling fallback
- **Contingency**: Use polling if real-time has issues

### 6. Performance with Large Conversation History (Medium Risk)
- **Risk**: Long conversations may cause performance issues
- **Mitigation**: Implement pagination, virtualized lists, message caching
- **Contingency**: Limit message history display

### 7. Offline Mode (V2 Risk)
- **Risk**: Complex to implement correctly
- **Mitigation**: Start without offline, add in V2 with careful design
- **Contingency**: Skip offline mode if too complex

---

## App Store / Play Store Risks

### Apple App Store

**Rejection Risks**:
1. **Guideline 2.1 - Performance**: App must be fast and responsive
   - **Mitigation**: Performance testing, optimize lists/images
2. **Guideline 4.0 - Design**: Must follow Apple HIG
   - **Mitigation**: Use native components, follow design patterns
3. **Guideline 5.1.1 - Data Collection**: Must disclose data collection
   - **Mitigation**: Privacy policy, App Privacy labels, transparent consent
4. **Guideline 5.1.2 - SMS/Phone**: Must justify SMS access
   - **Mitigation**: SMS is server-side, app only displays messages
5. **Guideline 3.1.1 - In-App Purchase**: If selling digital goods
   - **Mitigation**: Use Stripe for payments (not IAP), clear disclosure

**Specific Concerns**:
- SMS-based service may raise spam/deceptive content concerns
- Must clearly explain the service value proposition
- Provide clear privacy policy and terms of service

### Google Play Store

**Rejection Risks**:
1. **Sensitive Permissions**: SMS, Phone, Contacts
   - **Mitigation**: SMS is server-side, minimal permissions needed
2. **Background Services**: If using background tasks
   - **Mitigation**: Follow foreground service guidelines, user consent
3. **Privacy Policy**: Required for data collection
   - **Mitigation**: Clear privacy policy, minimal data collection
4. **Payment Policy**: Must follow Play billing guidelines
   - **Mitigation**: Use Stripe (not Play Billing), clear disclosure

**Specific Concerns**:
- SMS/Phone permissions may trigger review
- Must justify why app needs these permissions
- Consider if any permissions can be avoided

### Mitigation Strategies

1. **Clear App Description**: Explain service value clearly
2. **Privacy Policy**: Comprehensive, accessible within app
3. **Terms of Service**: Comprehensive, accessible within app
4. **App Screenshots**: Show legitimate use cases
5. **Review Notes**: Provide detailed explanation of features
6. **TestFlight/Beta**: Test with beta users first
7. **Appeal Process**: Be prepared to respond to rejections

---

## Suggested Milestone Plan

### Milestone 1: Foundation (Weeks 1-4)
- Set up Expo project
- Configure TypeScript
- Set up navigation structure
- Implement authentication flow
- Connect to Supabase
- Create shared API layer
- Set up state management

### Milestone 2: Core Screens (Weeks 5-8)
- Dashboard screen (basic)
- Leads list screen
- Lead detail screen
- Conversation screen
- Settings screen (basic)
- Notifications screen

### Milestone 3: Core Features (Weeks 9-12)
- SMS composer
- Message sending/receiving
- Real-time updates
- Lead status management
- KPI metrics
- Notification handling

### Milestone 4: Polish & Testing (Weeks 13-16)
- UI polish and animations
- Error handling
- Loading states
- Form validation
- Testing on both platforms
- Performance optimization

### Milestone 5: App Store Submission (Weeks 17-20)
- App store assets (icons, screenshots)
- Privacy policy and terms
- App store descriptions
- TestFlight beta testing
- Address feedback
- Submit to App Store

### Milestone 6: Play Store Submission (Weeks 21-24)
- Play store assets
- Play store listing
- Internal testing
- Closed testing
- Open testing
- Submit to Play Store

### V2 Milestones (Future)
- Calendar integration
- In-app payments
- Advanced analytics
- Offline mode
- Deep linking
- Biometric auth
- Advanced settings

---

## Clear Recommendation on When to Start

### Recommended Start Point

**Start after achieving one of these milestones**:
1. **100 paying customers** OR
2. **$50k MRR** OR
3. **6 months of stable web app operation**

### Rationale

**Why wait**:
- Web app is source of truth for launch
- Need customer feedback to validate features
- Need stable revenue to justify development cost
- Need to understand user needs before building native
- Avoid building wrong features

**Why not earlier**:
- Development cost ($30k-50k for MVP)
- Maintenance cost ongoing
- App store fees ($99/year Apple, $25 one-time Google)
- Development time could improve web app instead
- Risk of building before validating market

**Why not later**:
- Mobile users will demand native experience
- Competitive advantage
- Better engagement and retention
- App store discoverability
- Push notifications for engagement

### Recommended Phased Approach

**Phase 1**: Launch web app (current)  
**Phase 2**: Gather customer feedback, validate features  
**Phase 3**: Reach 100 customers or $50k MRR  
**Phase 4**: Build native MVP (12-16 weeks)  
**Phase 5**: Launch native app in beta  
**Phase 6**: Full native app launch  
**Phase 7**: Build V2 features

### Cost Estimate

**Development Cost**: $30,000 - $50,000
- One developer for 12-16 weeks
- AI assistance reduces time but not cost
- Includes testing, polish, app store submission

**Ongoing Cost**: $5,000 - $10,000/year
- App store fees
- Push notification infrastructure
- Maintenance and updates
- Bug fixes

**ROI Consideration**:
- Should increase customer retention
- Should improve engagement
- Should enable push notifications
- Should reduce churn
- ROI positive if increases LTV by $50-100/customer

---

## Final Recommendation

**Recommended Stack**: React Native with Expo (Managed Workflow)

**Recommended Timeline**: Start after 100 paying customers or $50k MRR

**Recommended MVP**: Dashboard, Leads, Conversations, Notifications, Basic Settings

**Estimated Cost**: $30,000 - $50,000 for MVP

**Estimated Timeline**: 12-16 weeks for MVP, 20-24 weeks for App Store-Ready

**Key Success Factors**:
1. Reuse existing API routes (no backend changes)
2. Keep MVP focused on core value
3. Start with web app to validate market
4. Use Expo to accelerate development
5. Plan for app store review process

**Biggest Risks**:
1. App store approval (mitigate with clear policies)
2. Push notification complexity (mitigate with Expo)
3. Calendar integration (defer to V2)
4. Payment flow redesign (defer to V2 or use web checkout)

**Conclusion**: A native mobile app is feasible and recommended after validating the web app with customers. React Native with Expo offers the best balance of development speed, performance, and maintainability for a single developer with AI assistance.
