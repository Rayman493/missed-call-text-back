# Google Calendar V1 QA Map

## OAuth Routes

### Connect
- **Route**: `/api/google/calendar/connect`
- **File**: `src/app/api/google/calendar/connect/route.ts`
- **Purpose**: Initiate OAuth flow by generating auth URL
- **Key Logic**:
  - Validates environment variables (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
  - Authenticates user via Supabase
  - Looks up business by user_id
  - Generates CSRF-protected state parameter (business_id + timestamp)
  - Constructs Google OAuth URL with scope `https://www.googleapis.com/auth/calendar.events`
  - Returns authUrl for client-side redirect

### Callback
- **Route**: `/api/google/calendar/callback`
- **File**: `src/app/api/google/calendar/callback/route.ts`
- **Purpose**: Handle OAuth callback and save tokens
- **Key Logic**:
  - Validates OAuth error parameter
  - Validates code and state parameters
  - Decodes and validates state (business_id + timestamp)
  - Exchanges authorization code for access_token and refresh_token
  - Calculates token expiry time
  - Upserts calendar_integrations record
  - Creates timeline event and notification for connection
  - Redirects to `/dashboard/calendar?calendar=connected`

### Disconnect
- **Route**: `/api/google/calendar/disconnect`
- **File**: `src/app/api/google/calendar/disconnect/route.ts`
- **Purpose**: Remove calendar integration
- **Key Logic**:
  - Authenticates user via Supabase
  - Looks up business by user_id
  - Deletes calendar_integrations record
  - Creates timeline event and notification for disconnection

### Status
- **Route**: `/api/google/calendar/status`
- **File**: `src/app/api/google/calendar/status/route.ts`
- **Purpose**: Check if calendar is connected
- **Key Logic**:
  - Validates environment variables
  - Authenticates user via Supabase
  - Looks up business by user_id
  - Queries calendar_integrations table
  - Returns connected status, calendar_email, connectedAt, expiresAt
  - Gracefully handles missing business/integration

## Token Storage

### Database Schema
- **Table**: `calendar_integrations`
- **Migration**: `supabase/migrations/20260527020000_create_calendar_integrations.sql`
- **Fields**:
  - `id` (UUID, primary key)
  - `business_id` (UUID, foreign key to businesses, ON DELETE CASCADE)
  - `provider` (TEXT, default 'google')
  - `access_token` (TEXT, NOT NULL)
  - `refresh_token` (TEXT, NOT NULL)
  - `token_type` (TEXT, default 'Bearer')
  - `expires_at` (TIMESTAMP WITH TIME ZONE)
  - `scope` (TEXT, NOT NULL)
  - `created_at` (TIMESTAMP WITH TIME ZONE, default NOW())
  - `updated_at` (TIMESTAMP WITH TIME ZONE, default NOW())
- **Unique Constraint**: (business_id, provider)
- **RLS Policies**: Users can view/insert/update/delete their own integrations via business_id
- **Indexes**: idx_calendar_integrations_business_id for faster lookups
- **Triggers**: Auto-updates updated_at on row update

## Token Refresh Logic

### Implementation Locations
Token refresh is implemented in 3 places (duplicated code):
1. **Events Route** (`/api/google/calendar/events/route.ts`, lines 104-177)
2. **Create Event Route** (`/api/google/calendar/create-event/route.ts`, lines 87-138)
3. **Delete Event Route** (`/api/google/calendar/events/[eventId]/route.ts`, lines 58-94)

### Refresh Logic
- Checks if `expires_at` < current time
- If expired and refresh_token exists:
  - POST to `https://oauth2.googleapis.com/token` with:
    - client_id
    - client_secret
    - refresh_token
    - grant_type: 'refresh_token'
  - Updates calendar_integrations with new access_token and expires_at
- If no refresh_token available, returns 401 error
- If refresh fails, returns 401 error

## Sync Logic

### Events Fetch
- **Route**: `/api/google/calendar/events`
- **File**: `src/app/api/google/calendar/events/route.ts`
- **Key Logic**:
  - Authenticates user and looks up business
  - Gets calendar_integrations record
  - Refreshes token if expired
  - Fetches events from Google Calendar API with date range (timeMin, timeMax)
  - Fetches US Holidays calendar separately
  - Normalizes events with deduplication by summary and date
  - Returns merged events array with calendar_email

### Client-Side Sync
- **File**: `src/app/dashboard/calendar/page.tsx`
- **Key Logic**:
  - `fetchCalendarStatus()`: Checks connection status and fetches events if connected
  - `fetchEvents()`: Fetches events for visible month grid (42-day range)
  - `handleSync()`: Manual sync button triggers fetchEvents()
  - Auto-fetches on month change
  - Shows loading states and error toasts

## Calendar UI Components

### Main Page
- **File**: `src/app/dashboard/calendar/page.tsx`
- **Components Used**:
  - CalendarGrid (month view)
  - EventComposer (create event modal)
  - DayDetailModal (day details)
  - EventDetailsModal (event details)
  - UpcomingAgenda (agenda view)
  - TodaySchedule (jobs integration)

### Calendar Components
- **CalendarGrid** (`src/components/calendar/CalendarGrid.tsx`): 42-day grid with event pills
- **CalendarDayCell** (`src/components/calendar/CalendarDayCell.tsx`): Individual day cell
- **CalendarToolbar** (`src/components/calendar/CalendarToolbar.tsx`): Month navigation
- **EventComposer** (`src/components/calendar/EventComposer.tsx`): Event creation form
- **EventDetailsModal** (`src/components/calendar/EventDetailsModal.tsx`): Event details view
- **EventPill** (`src/components/calendar/EventPill.tsx`): Event display pill
- **DayDetailModal** (`src/components/calendar/DayDetailModal.tsx`): Day detail view
- **UpcomingAgenda** (`src/components/calendar/UpcomingAgenda.tsx`): Agenda list view
- **UpcomingEventsPanel** (`src/components/calendar/UpcomingEventsPanel.tsx`): Events panel

## Event Creation Logic

### Create Event
- **Route**: `/api/google/calendar/create-event`
- **File**: `src/app/api/google/calendar/create-event/route.ts`
- **Key Logic**:
  - Authenticates user and looks up business
  - Gets calendar_integrations record
  - Refreshes token if expired
  - Validates required fields (title, date)
  - Validates end date not before start date
  - Handles all-day events (exclusive end date calculation)
  - Handles timed events with timezone (business_hours_timezone)
  - POST to Google Calendar API `/calendars/primary/events`
  - Creates timeline event and notification for appointment creation
  - Returns created event data

### Timezone Handling
- Uses business's `business_hours_timezone` from businesses table
- Defaults to 'America/New_York' if not set
- For timed events: sends datetime in local format WITH timezone parameter
- For all-day events: uses date format (YYYY-MM-DD) with exclusive end date

## Event Deletion Logic

### Delete Event
- **Route**: `/api/google/calendar/events/[eventId]`
- **File**: `src/app/api/google/calendar/events/[eventId]/route.ts`
- **Method**: DELETE
- **Key Logic**:
  - Uses service role key (SUPABASE_SERVICE_ROLE_KEY) - **SECURITY CONCERN**
  - Gets user from authorization header
  - Looks up business by user_id
  - Gets calendar_integrations record
  - Refreshes token if expired
  - DELETE to Google Calendar API `/calendars/primary/events/{eventId}`
  - Creates timeline event and notification for appointment deletion
  - Returns success

## Disconnect Logic

### Disconnect
- **Route**: `/api/google/calendar/disconnect`
- **File**: `src/app/api/google/calendar/disconnect/route.ts`
- **Method**: POST
- **Key Logic**:
  - Authenticates user via Supabase
  - Looks up business by user_id
  - Deletes calendar_integrations record
  - Creates timeline event and notification for disconnection
  - Returns success

## Issues Identified

### 1. Security Issue: Service Role Key in Delete Route
**Location**: `src/app/api/google/calendar/events/[eventId]/route.ts` (lines 6-9)
**Issue**: Uses `SUPABASE_SERVICE_ROLE_KEY` directly instead of server client pattern
**Impact**: Bypasses RLS policies, potential security risk
**Recommendation**: Use `createServerSupabaseClient()` pattern like other routes

### 2. Code Duplication: Token Refresh Logic
**Location**: 3 separate routes with identical token refresh logic
**Issue**: Maintenance burden, potential for inconsistencies
**Recommendation**: Extract to shared utility function

### 3. Missing Diagnostic Logs
**Location**: Various routes
**Issue**: Insufficient logging for production debugging
**Recommendation**: Add logs for:
  - Token refresh success/failure with business_id
  - Event creation confirmation with event_id
  - Event deletion confirmation with event_id
  - Sync status updates with event count

### 4. OAuth State Validation
**Location**: `src/app/api/google/calendar/callback/route.ts` (lines 48-60)
**Issue**: State validation doesn't check timestamp for expiration (could be stale state attacks)
**Recommendation**: Add timestamp expiration check (e.g., reject if > 5 minutes old)

## Files Reviewed

### API Routes
- `src/app/api/google/calendar/connect/route.ts`
- `src/app/api/google/calendar/callback/route.ts`
- `src/app/api/google/calendar/disconnect/route.ts`
- `src/app/api/google/calendar/status/route.ts`
- `src/app/api/google/calendar/events/route.ts`
- `src/app/api/google/calendar/create-event/route.ts`
- `src/app/api/google/calendar/events/[eventId]/route.ts`

### Database
- `supabase/migrations/20260527020000_create_calendar_integrations.sql`

### UI Components
- `src/app/dashboard/calendar/page.tsx`
- `src/components/calendar/CalendarGrid.tsx`
- `src/components/calendar/EventComposer.tsx`
- `src/components/calendar/CalendarDayCell.tsx`
- `src/components/calendar/CalendarToolbar.tsx`
- `src/components/calendar/EventDetailsModal.tsx`
- `src/components/calendar/EventPill.tsx`
- `src/components/calendar/DayDetailModal.tsx`
- `src/components/calendar/UpcomingAgenda.tsx`
- `src/components/calendar/UpcomingEventsPanel.tsx`

### Utilities
- `src/lib/calendar-date-utils.ts`
