# ReplyFlowHQ - AI Call Assistant (Phase 2 Beta)
## Technical Design Document (Revised)

**Version**: 2.0  
**Date**: May 26, 2026  
**Status**: Architecture Review  
**Author**: AI Voice Engineer / Twilio Architect / OpenAI Realtime Specialist / SaaS Product Engineer

---

## Executive Summary

This document outlines the revised technical design for Phase 2 of ReplyFlowHQ: an AI Call Assistant that answers missed calls in real-time, collects customer information through natural conversation, and generates structured data for lead creation. This is an OPTIONAL beta feature that must not disrupt the existing missed-call text-back flow.

**Critical Design Decision**: 
- **Primary Architecture**: Twilio Media Streams + OpenAI Realtime API
- **Reasoning**: Enables natural, low-latency conversation (~400ms) instead of awkward request/response delays (~2500ms)
- **Fallback Strategy**: AI → Voicemail → SMS (graceful degradation)

**Key Principles**:
- Zero regression risk to existing functionality
- Opt-in beta feature (default: OFF)
- Feature-flagged deployment
- Natural conversational experience (not robotic turn-taking)
- Graceful fallbacks at every failure point

---

## 1. Architecture Comparison

### 1.1 Options Evaluated

| Architecture | Latency | Reliability | Maintenance | Complexity | Beta Speed | Overall Score |
|--------------|---------|-------------|-------------|------------|------------|---------------|
| **OpenAI Realtime API** (Direct) | ~300ms | High | Medium | Medium | Fast | ⭐⭐⭐⭐ |
| **Twilio Media Streams + OpenAI Realtime** | ~400ms | Very High | Low | Medium | Fast | ⭐⭐⭐⭐⭐ |
| **OpenAI Voice (STT + GPT + TTS)** | ~2500ms | Very High | Low | Low | Fast | ⭐⭐ |
| **Twilio Conversational Intelligence** | ~1500ms | High | High | Low | Medium | ⭐⭐⭐ |
| **Vapi.ai / Bland.ai** | ~500ms | Medium | High | Very Low | Very Fast | ⭐⭐⭐ |

### 1.2 Detailed Analysis

#### Option 1: OpenAI Realtime API (Direct WebSocket)
**Pros**:
- Lowest possible latency (~300ms)
- Native audio streaming
- Built-in function calling
- No intermediate infrastructure

**Cons**:
- Beta API (stability concerns)
- Limited documentation
- No built-in phone bridge (requires custom audio handling)
- Complex to integrate with Twilio directly
- Audio format conversion required

**Latency Breakdown**:
- Audio capture: 50ms
- Network to OpenAI: 100ms
- Processing: 100ms
- Network back: 50ms
- **Total: ~300ms**

#### Option 2: Twilio Media Streams + OpenAI Realtime API ⭐ RECOMMENDED
**Pros**:
- Natural Twilio integration
- Handles audio format conversion
- Built-in call lifecycle management
- Established pattern with examples
- Can use Twilio's infrastructure
- Easy fallback to voicemail
- OpenAI Realtime for natural conversation
- Very high reliability

**Cons**:
- Slightly higher latency (~400ms)
- Requires WebSocket server
- Need to manage media stream connection

**Latency Breakdown**:
- Twilio stream: 50ms
- Network: 100ms
- OpenAI Realtime: 200ms
- Network back: 50ms
- **Total: ~400ms**

#### Option 3: OpenAI Voice (STT + GPT + TTS) - REJECTED
**Pros**:
- Stable APIs
- Predictable pricing
- Simple implementation
- High reliability

**Cons**:
- **Awkward delays between turns** (2-3s)
- Not suitable for natural conversation
- Customer will notice pauses
- Feels robotic, not human-like
- Poor user experience for live agent

**Latency Breakdown**:
- STT upload: 500ms
- STT processing: 500ms
- GPT processing: 500ms
- TTS generation: 500ms
- TTS download: 500ms
- **Total: ~2500ms per turn**

#### Option 4: Twilio Conversational Intelligence
**Pros**:
- Native Twilio solution
- No external API dependencies
- Built-in compliance

**Cons**:
- Higher cost
- Limited customization
- Less control over conversation flow
- Vendor lock-in
- Latency still ~1500ms

#### Option 5: Vapi.ai / Bland.ai
**Pros**:
- Fastest to implement (managed service)
- Handles all complexity
- Good voice quality

**Cons**:
- Higher cost per minute
- Vendor lock-in
- Less control
- Additional dependency
- Data privacy concerns

### 1.3 Final Recommendation: Twilio Media Streams + OpenAI Realtime API

**Why This Architecture Wins**:

1. **Natural Conversation**: OpenAI Realtime enables real-time bidirectional audio, eliminating awkward pauses
2. **Low Latency**: ~400ms vs ~2500ms for request/response approach
3. **High Reliability**: Twilio infrastructure + OpenAI stability
4. **Easy Maintenance**: Well-documented patterns, community support
5. **Operational Simplicity**: One WebSocket connection, one API
6. **Fast Beta Path**: Can implement in 4-5 weeks
7. **Easy Fallback**: Can redirect to voicemail at any point
8. **Cost Effective**: ~$0.20-0.30/call vs $0.10+/call for managed services

**Trade-offs Accepted**:
- WebSocket server complexity (acceptable)
- OpenAI Realtime beta status (acceptable for beta feature)
- Slightly higher latency than direct OpenAI (still <500ms, very natural)

---

## 2. Recommended Architecture

### 2.1 High-Level Flow

```
Incoming Call → Twilio → /api/twilio/voice
                           ↓
                    Validate Twilio Auth
                           ↓
                    Lookup Business
                           ↓
              Check: AI Assistant Enabled? (Feature Flag)
                           ↓
              ┌────────────┴────────────┐
              │ YES                       │ NO
              ↓                           ↓
    Check: Opt-in Beta        Existing Flow (Voicemail)
              ↓                ┌──────────┐
    Create AI Session         │  Voicemail│
    (status: started)         │   Greeting │
              ↓                │ + Record   │
    Return TwiML:             └──────────┘
    Connect to Media Stream
              ↓
    WebSocket Connection Established
              ↓
    ┌──────────────────────────────────────────┐
    │                                          │
    ↓                                          ↓
Twilio Streams Audio → OpenAI Realtime API
              ↓
    Real-time Processing
              ↓
    OpenAI Streams Audio → Twilio → Customer
              ↓
    Natural Conversation (4 turns max)
              ↓
    OpenAI Calls Function: Extract Data
              ↓
    Structured Data Returned
              ↓
    AI: "Thank you. I've shared this information..."
              ↓
    End Call Gracefully
              ↓
    POST to /api/twilio/ai-assistant/complete
              ↓
    Save Transcript, Summary, Extracted Data
              ↓
    Create/Update Lead
              ↓
    Send Notification
              ↓
    End
```

### 2.2 WebSocket Flow

```
Twilio Media Stream → WebSocket Server
                          ↓
                   OpenAI Realtime WebSocket
                          ↓
                   ┌────────┴────────┐
                   │                 │
                   ↓                 ↓
            Audio In → STT    TTS → Audio Out
                   │                 │
                   └────────┬────────┘
                            ↓
                     GPT-4 Processing
                            ↓
                     Function Calling
                            ↓
              Extract: name, reason, urgency, number
```

### 2.3 Conversation Flow

```
Turn 1 (AI):
"Hi, thanks for calling {Business Name}. I'm the automated assistant. I can take a message for the team. May I get your name?"

Turn 2 (Customer):
[Speaks name]
↓ AI processes in real-time
↓ AI acknowledges while listening

Turn 3 (AI):
"Thank you, {Name}. What's the reason for your call today?"

Turn 4 (Customer):
[Describes reason]
↓ AI processes in real-time

Turn 5 (AI):
"Got it. How urgent is this matter? Is it high, medium, or low priority?"

Turn 6 (Customer):
[States urgency]
↓ AI processes in real-time

Turn 7 (AI):
"Understood. What's the best callback number for the team to reach you?"

Turn 8 (Customer):
[Provides number]
↓ AI processes in real-time
↓ AI validates format

Turn 9 (AI):
"Thank you. I've shared this information with the team and someone will contact you shortly. Goodbye."

[Call Ends]
```

**Key Difference from Request/Response**:
- AI can acknowledge ("Mmhmm", "I see") while customer is still speaking
- No awkward silence between turns
- Natural back-channeling
- Feels like talking to a human

---

## 3. Latency Analysis

### 3.1 OpenAI Realtime Latency Breakdown

| Component | Time | Notes |
|-----------|------|-------|
| Twilio audio capture | 50ms | μ-law encoding |
| Network to WebSocket server | 30ms | Twilio → Our server |
| Server processing | 20ms | Minimal overhead |
| Network to OpenAI | 100ms | US-East |
| OpenAI STT + GPT + TTS | 150ms | Realtime pipeline |
| Network back to server | 100ms | OpenAI → Our server |
| Server processing | 20ms | Audio forwarding |
| Network to Twilio | 30ms | Our server → Twilio |
| Twilio playback | 30ms | Audio buffering |
| **Total** | **~530ms** | End-to-end |

### 3.2 Request/Response Latency (Rejected Approach)

| Component | Time | Notes |
|-----------|------|-------|
| Customer speaks (3s) | 3000ms | Average utterance |
| Upload to STT | 500ms | Full audio file |
| STT processing | 500ms | OpenAI Whisper |
| GPT processing | 500ms | GPT-4 |
| TTS generation | 500ms | OpenAI TTS |
| Download TTS | 500ms | Full audio file |
| Playback to customer | 500ms | Twilio |
| **Total per turn** | **~5500ms** | 5.5 seconds! |

### 3.3 Comparison

- **OpenAI Realtime**: ~530ms - Natural conversation
- **Request/Response**: ~5500ms - Awkward, robotic

**Conclusion**: OpenAI Realtime is 10x faster and provides natural conversation experience.

---

## 4. Cost Analysis

### 4.1 OpenAI Realtime API Pricing

**Current Pricing (Beta)**:
- Audio input: $0.06 per minute
- Audio output: $0.24 per minute
- Cached audio input: $0.006 per minute
- **Total**: ~$0.30 per minute of conversation

**Typical Call Duration**: 45-60 seconds
**Cost per call**: ~$0.22-$0.30

### 4.2 Twilio Media Streams Pricing

- Media Streams: $0.0015 per minute
- Voice minutes: $0.013 per minute (incoming)
- **Total**: ~$0.015 per minute

**For 1-minute call**: ~$0.015

### 4.3 Total Cost Per Call

| Component | Cost |
|-----------|------|
| OpenAI Realtime (60s) | $0.30 |
| Twilio Media Streams (60s) | $0.015 |
| Twilio Voice Minutes (60s) | $0.013 |
| Infrastructure (WebSocket server) | $0.01 |
| **Total** | **~$0.34 per call** |

### 4.4 Comparison with Voicemail

- Voicemail only: ~$0.013 per minute
- AI Assistant: ~$0.34 per call
- **Premium**: ~$0.33 per call

**Business Case**: If AI converts 3% more leads, premium pays for itself (assuming $50/lead value).

### 4.5 Cost Optimization Strategies

1. **Cached Audio**: OpenAI caches repeated audio (greeting) - 90% discount
2. **Early Termination**: End call when data collected (30s average)
3. **Batch Processing**: Process multiple calls concurrently
4. **Monitoring**: Alert on high-cost calls

**Optimized Cost**: ~$0.15-$0.20 per call (with early termination)

---

## 5. Database Schema

### 5.1 New Table: `ai_call_sessions`

```sql
-- Migration: 20260526000000_create_ai_call_sessions.sql

CREATE TABLE IF NOT EXISTS ai_call_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
    call_sid TEXT NOT NULL UNIQUE,
    
    -- Session Status
    status TEXT NOT NULL CHECK (status IN (
        'started', 
        'connected', 
        'in_conversation', 
        'completed', 
        'failed', 
        'timed_out', 
        'fallback_voicemail',
        'caller_hungup'
    )),
    
    -- Timing
    started_at timestamptz DEFAULT now() NOT NULL,
    connected_at timestamptz,
    ended_at timestamptz,
    duration_seconds INTEGER,
    
    -- AI Output
    summary TEXT,
    transcript TEXT,
    
    -- Extracted Information (Structured)
    caller_name TEXT,
    reason_for_call TEXT,
    urgency TEXT CHECK (urgency IN ('high', 'medium', 'low', 'unknown')),
    callback_number TEXT,
    
    -- Conversation Metadata
    turn_count INTEGER DEFAULT 0,
    words_spoken INTEGER,
    
    -- Fallback Information
    fallback_reason TEXT,
    fallback_stage TEXT CHECK (fallback_stage IN (
        'websocket_connect',
        'openai_connect',
        'conversation',
        'extraction',
        'completion'
    )),
    
    -- Error Information
    error_message TEXT,
    error_code TEXT,
    
    -- Raw Metadata
    raw_metadata jsonb,
    
    -- OpenAI Session ID (for debugging)
    openai_session_id TEXT,
    
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_ai_call_sessions_business_id ON ai_call_sessions(business_id);
CREATE INDEX idx_ai_call_sessions_lead_id ON ai_call_sessions(lead_id);
CREATE INDEX idx_ai_call_sessions_call_sid ON ai_call_sessions(call_sid);
CREATE INDEX idx_ai_call_sessions_status ON ai_call_sessions(status);
CREATE INDEX idx_ai_call_sessions_created_at ON ai_call_sessions(created_at);
CREATE INDEX idx_ai_call_sessions_started_at ON ai_call_sessions(started_at);

-- RLS Policies
ALTER TABLE ai_call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view AI sessions for their businesses"
    ON ai_call_sessions
    FOR SELECT
    USING (
        business_id IN (
            SELECT id FROM businesses WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY "System can insert AI sessions"
    ON ai_call_sessions
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "System can update AI sessions"
    ON ai_call_sessions
    FOR UPDATE
    WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_ai_call_sessions_updated_at
    BEFORE UPDATE ON ai_call_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### 5.2 Modify `businesses` Table

```sql
-- Migration: 20260526010000_add_ai_assistant_settings.sql

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_assistant_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_assistant_beta BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_assistant_business_name_override TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_assistant_greeting_override TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_assistant_enabled_at timestamptz;
```

### 5.3 Modify `leads` Table

```sql
-- Migration: 20260526020000_add_ai_session_to_leads.sql

ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_session_id uuid REFERENCES ai_call_sessions(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_transcript TEXT;
```

---

## 6. Twilio Integration Design

### 6.1 Safe Integration Strategy

**Principle**: Zero regression, feature-flagged, easy rollback

**Integration Points**:

1. **Modified Route**: `/api/twilio/voice` (minimal change)
   - Add single feature flag check
   - If enabled: redirect to `/api/twilio/ai-assistant/start`
   - If disabled: continue existing flow (zero change)
   - One-line change, easy rollback

2. **New Route**: `/api/twilio/ai-assistant/start`
   - Validates AI assistant enabled
   - Creates AI session record
   - Returns TwiML with `<Connect><Stream>`
   - On any error: returns redirect to existing voice webhook

3. **New Route**: `/api/twilio/ai-assistant/stream` (WebSocket)
   - Handles bidirectional audio streaming
   - Connects to OpenAI Realtime
   - Manages session lifecycle
   - On error: marks session as failed, allows fallback

4. **New Route**: `/api/twilio/ai-assistant/complete`
   - Processes session completion
   - Saves transcript and extracted data
   - Creates/updates lead
   - Sends notification

### 6.2 TwiML Design

**AI Assistant Start**:
```xml
<Response>
  <Connect>
    <Stream url="wss://api.replyflowhq.com/api/twilio/ai-assistant/stream">
      <Parameter name="session_id" value="{session_id}" />
      <Parameter name="business_id" value="{business_id}" />
      <Parameter name="call_sid" value="{call_sid}" />
    </Stream>
  </Connect>
</Response>
```

**Fallback to Voicemail**:
```xml
<Response>
  <Redirect>/api/twilio/voice</Redirect>
</Response>
```

### 6.3 WebSocket Protocol

**Connection Flow**:
1. Twilio connects to WebSocket
2. Server validates session_id
3. Server connects to OpenAI Realtime
4. Server bridges audio between Twilio and OpenAI
5. Server captures transcript and events
6. On completion, server saves data

**Message Types**:
- `connected`: Twilio connected
- `start`: Media stream started
- `media`: Audio data (base64)
- `stop`: Media stream stopped
- `error`: Error occurred
- `mark`: Connection quality events

### 6.4 OpenAI Realtime Integration

**WebSocket Connection**:
```typescript
const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime')
openaiWs.send(JSON.stringify({
  type: 'session.update',
  session: {
    modalities: ['text', 'audio'],
    instructions: systemPrompt,
    voice: 'alloy',
    input_audio_format: 'g711_ulaw',
    output_audio_format: 'g711_ulaw',
    input_audio_transcription: {
      model: 'whisper-1'
    },
    tools: [{
      type: 'function',
      name: 'extract_customer_info',
      description: 'Extract customer information',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          reason: { type: 'string' },
          urgency: { type: 'string', enum: ['high', 'medium', 'low'] },
          callback_number: { type: 'string' }
        },
        required: ['name', 'reason', 'urgency', 'callback_number']
      }
    }]
  }
}))
```

---

## 7. API Routes Design

### 7.1 New API Routes

#### Route 1: `/api/twilio/ai-assistant/start`
- **Method**: POST
- **Purpose**: Initialize AI session, return TwiML
- **Input**: Twilio webhook params
- **Output**: TwiML with `<Connect><Stream>` or fallback
- **Error Handling**: On any error, redirect to `/api/twilio/voice`

```typescript
export async function POST(request: NextRequest) {
  // Validate Twilio signature
  // Lookup business
  // Check: ai_assistant_enabled && ai_assistant_beta
  // Check: Smart filtering (can be less strict for AI)
  // Create ai_call_sessions record (status: 'started')
  // Return AI TwiML or redirect to voicemail
}
```

#### Route 2: `/api/twilio/ai-assistant/stream`
- **Method**: WebSocket (GET upgrade)
- **Purpose**: Bidirectional audio streaming with OpenAI
- **Protocol**: WebSocket with media events
- **Fallback**: On error, allow graceful degradation

```typescript
export async function GET(request: NextRequest) {
  // Upgrade to WebSocket
  // Validate session_id
  // Connect to OpenAI Realtime
  // Bridge audio between Twilio and OpenAI
  // Capture transcript
  // Call function when complete
  // Handle errors
}
```

#### Route 3: `/api/twilio/ai-assistant/complete`
- **Method**: POST
- **Purpose**: Process session completion
- **Input**: session_id, transcript, extracted_data, status
- **Output**: Success/error response

```typescript
export async function POST(request: NextRequest) {
  // Validate session
  // Update session status
  // Save transcript and summary
  // Create/update lead with extracted data
  // Send notification
  // Return success
}
```

#### Route 4: `/api/business/ai-settings`
- **Method**: GET/PUT
- **Purpose**: Manage AI assistant settings
- **Input**: ai_assistant_enabled, business_name_override, greeting_override
- **Output**: Current settings

```typescript
export async function GET(request: NextRequest) {
  // Fetch AI settings for business
  // Return settings
}

export async function PUT(request: NextRequest) {
  // Update AI settings
  // Record enabled_at timestamp
  // Return updated settings
}
```

### 7.2 Modified Routes

#### Route: `/api/twilio/voice` (Minimal Change)

```typescript
// Add this check after business lookup
if (business.ai_assistant_enabled && business.ai_assistant_beta) {
  // Redirect to AI assistant
  const aiStartUrl = `/api/twilio/ai-assistant/start?${searchParams}`
  return NextResponse.redirect(new URL(aiStartUrl, request.url))
}

// Continue with existing flow if disabled
```

---

## 8. Feature Flag Strategy

### 8.1 Feature Flag Implementation

**Level 1: Database Flag** (`businesses.ai_assistant_enabled`)
- Per-business enable/disable
- Default: FALSE
- Stored in database
- Immediate effect

**Level 2: Beta Flag** (`businesses.ai_assistant_beta`)
- Beta participant flag
- Default: FALSE
- Only beta businesses can enable
- Controlled rollout

**Level 3: Environment Variable** (`AI_ASSISTANT_ENABLED`)
- Global kill switch
- Default: FALSE
- Emergency disable
- No code deployment needed

### 8.2 Feature Flag Checks

```typescript
// In /api/twilio/ai-assistant/start
const globalEnabled = process.env.AI_ASSISTANT_ENABLED === 'true'
const businessEnabled = business.ai_assistant_enabled === true
const betaParticipant = business.ai_assistant_beta === true

if (!globalEnabled || !businessEnabled || !betaParticipant) {
  // Fallback to voicemail
  return redirectTovoicemail()
}
```

### 8.3 Rollback Strategy

**Instant Rollback**:
1. Set environment variable `AI_ASSISTANT_ENABLED=false`
2. Restart server (or use config reload)
3. All calls go to voicemail immediately

**Per-Business Rollback**:
1. Update `businesses.ai_assistant_enabled = false`
2. Next call uses voicemail
3. No server restart needed

**Code Rollback**:
1. Revert single line change in `/api/twilio/voice`
2. Deploy
3. Zero impact to existing functionality

---

## 9. Failure Handling Strategy

### 9.1 Failure Hierarchy

```
Level 1: AI Assistant (Primary)
    ↓ Any Failure
Level 2: Voicemail Recording (Fallback 1)
    ↓ Failure or No Recording
Level 3: SMS Auto-Reply (Fallback 2 - Existing)
```

### 9.2 Failure Scenarios

| Scenario | Trigger | Action |
|----------|---------|--------|
| WebSocket connection fails | Connection timeout/error | Fallback to voicemail |
| OpenAI API down | API error/timeout | Fallback to voicemail |
| OpenAI rate limit | 429 error | Fallback to voicemail |
| Audio quality issues | Silence/distortion >10s | Fallback to voicemail |
| Customer hangs up early | Call ends | Save partial data |
| Extraction fails | Function call error | Use transcript fallback |
| Database error | Write failure | Log error, notify team |
| Feature flag disabled | Flag = false | Use voicemail flow |

### 9.3 Fallback Implementation

```typescript
// In WebSocket handler
ws.on('error', async (error) => {
  console.error('[AI Stream] Error:', error)
  
  // Mark session as failed
  await updateAISessionStatus(sessionId, 'failed', error.message)
  
  // Fallback to voicemail
  // Twilio will automatically redirect on stream failure
  // No action needed - Twilio handles it
})

// In start route
try {
  return generateAITwiML(sessionId)
} catch (error) {
  // Fallback to voicemail
  return redirectTovoicemail(callSid)
}
```

### 9.4 Dead End Prevention

**Rule**: No caller should ever reach a dead end.

**Implementation**:
- Every error path has a fallback
- Fallback always goes to existing voicemail
- Voicemail always goes to existing SMS
- Existing SMS always succeeds or logs error
- No new single points of failure

---

## 10. Settings UI Design

### 10.1 Location

**Path**: `/dashboard/settings` (new section)

### 10.2 UI Component

```tsx
// src/components/settings/AIAssistantSettings.tsx

export default function AIAssistantSettings({ business }: { business: Business }) {
  const [enabled, setEnabled] = useState(business.ai_assistant_enabled || false)
  const [businessName, setBusinessName] = useState(business.ai_assistant_business_name_override || business.name)
  const [greeting, setGreeting] = useState(business.ai_assistant_greeting_override || '')

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">AI Call Assistant</h3>
          <p className="text-sm text-muted-foreground">
            Answer calls with AI and automatically gather customer information
          </p>
        </div>
        <span className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 text-xs font-medium rounded-full">
          BETA
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div>
            <p className="font-medium">Enable AI Assistant</p>
            <p className="text-sm text-muted-foreground">
              AI will answer calls instead of voicemail
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Business Name for AI</label>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="ReplyFlowHQ"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Custom Greeting (Optional)</label>
          <Textarea
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
            placeholder="Leave empty to use default greeting"
            rows={3}
          />
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            ⚠️ This is a beta feature. AI will answer calls and collect customer information.
            You can disable it at any time to return to voicemail.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  )
}
```

---

## 11. Compliance Review

### 11.1 Call Recording

**Requirement**: Must disclose call recording to customer.

**Solution**: Include disclosure in AI greeting.

**Greeting Template**:
```
"Hi, thanks for calling {Business Name}. I'm the automated assistant and this call may be recorded for quality purposes. I can take a message for the team. May I get your name?"
```

**Legal Note**: Consult with legal counsel for specific jurisdiction requirements.

### 11.2 AI Disclosure

**Requirement**: Must disclose that customer is speaking to AI.

**Solution**: Explicitly state "automated assistant" in greeting.

**Rationale**: FTC guidelines require disclosure of AI/bot interaction.

### 11.3 Data Privacy

**Requirements**:
- PII protection
- Data retention policy
- Right to deletion
- GDPR compliance (EU)

**Implementation**:
- Encrypt transcripts at rest
- Redact PII in logs
- 90-day retention policy
- Delete on customer request
- Data processing agreement with OpenAI

### 11.4 Consent

**Requirement**: Implicit consent by staying on the line.

**Implementation**:
- Customer can hang up at any time
- No forced interaction
- Clear disclosure in greeting

### 11.5 HIPAA/Healthcare

**Requirement**: If healthcare customers, HIPAA compliance needed.

**Implementation**:
- Add HIPAA mode flag
- BAA with OpenAI
- Enhanced encryption
- Audit logging
- (Out of scope for beta)

---

## 12. Files to Create

### 12.1 New API Routes (4 files)

1. `src/app/api/twilio/ai-assistant/start/route.ts`
   - Initialize AI session
   - Return TwiML or fallback

2. `src/app/api/twilio/ai-assistant/stream/route.ts`
   - WebSocket handler
   - OpenAI Realtime integration
   - Audio bridging

3. `src/app/api/twilio/ai-assistant/complete/route.ts`
   - Process completion
   - Save data
   - Create lead

4. `src/app/api/business/ai-settings/route.ts`
   - GET/PUT AI settings
   - Feature flag management

### 12.2 New Libraries (3 files)

1. `src/lib/ai/openai-realtime-client.ts`
   - OpenAI Realtime WebSocket client
   - Session management
   - Function calling

2. `src/lib/ai/session-manager.ts`
   - AI session lifecycle
   - State tracking
   - Timeout handling

3. `src/lib/ai/prompt-templates.ts`
   - System prompts
   - Function schemas
   - Greeting templates

### 12.3 New Components (2 files)

1. `src/components/settings/AIAssistantSettings.tsx`
   - Settings UI
   - Toggle switch
   - Form inputs

2. `src/components/leads/AISessionCard.tsx`
   - Display AI data in lead view
   - Show summary
   - Transcript viewer

### 12.4 Database Migrations (3 files)

1. `supabase/migrations/20260526000000_create_ai_call_sessions.sql`
2. `supabase/migrations/20260526010000_add_ai_assistant_settings.sql`
3. `supabase/migrations/20260526020000_add_ai_session_to_leads.sql`

### 12.5 Type Definitions (1 file)

1. `src/lib/types/ai.ts`
   - AI session types
   - Extracted data types
   - Status enums

**Total New Files**: 13

---

## 13. Files to Modify

### 13.1 Existing Routes (1 file)

1. `src/app/api/twilio/voice/route.ts`
   - Add AI assistant enable check (1 line)
   - Redirect to AI start if enabled
   - No changes to existing flow

### 13.2 Database Layer (1 file)

1. `src/lib/supabase/admin.ts`
   - Add `createAISession()` method
   - Add `updateAISession()` method
   - Add `getAISessionByCallSid()` method
   - Add `updateBusinessAISettings()` method

### 13.3 Lead View (1 file)

1. `src/app/dashboard/leads/[id]/page.tsx`
   - Display AI session data if present
   - Show summary
   - Link to transcript

**Total Modified Files**: 3

---

## 14. Implementation Timeline

### 14.1 Phased Approach

**Phase 1: Foundation (Days 1-3)**
- Database migrations
- Type definitions
- OpenAI Realtime client library
- Session manager skeleton

**Phase 2: WebSocket Integration (Days 4-7)**
- WebSocket server implementation
- OpenAI Realtime connection
- Audio bridging
- Error handling

**Phase 3: API Routes (Days 8-10)**
- `/api/twilio/ai-assistant/start`
- `/api/twilio/ai-assistant/complete`
- Voice webhook modification
- Testing with Twilio

**Phase 4: Data Processing (Days 11-13)**
- Transcript saving
- Summary generation
- Lead creation/update
- Notification integration

**Phase 5: UI Integration (Days 14-15)**
- Settings component
- Lead view integration
- Beta badge

**Phase 6: Testing (Days 16-18)**
- Unit tests
- Integration tests
- End-to-end tests
- Load testing

**Phase 7: Beta Launch (Days 19-20)**
- Staging deployment
- Internal testing
- Production deployment (feature-flagged)
- Monitoring setup

**Total**: 20 days (4 weeks)

### 14.2 Realistic Timeline with Windsurf + ChatGPT

**Assumptions**:
- Windsurf for code generation and editing
- ChatGPT for architecture decisions and debugging
- Existing ReplyFlowHQ codebase as foundation
- 1 senior engineer working full-time

**Breakdown**:
- Database & Types: 2 days (Windsurf + review)
- OpenAI Integration: 4 days (ChatGPT for API docs, Windsurf for code)
- WebSocket Server: 5 days (complex, lots of ChatGPT debugging)
- API Routes: 2 days (straightforward)
- Data Processing: 2 days (Windsurf)
- UI: 2 days (Windsurf)
- Testing: 3 days (manual + ChatGPT for test cases)
- Deployment: 1 day

**Total**: 21 days

**Buffer for Unknowns**: +4 days

**Final Timeline**: 25 days (5 weeks)

---

## 15. Risks and Mitigation

### 15.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| OpenAI Realtime API downtime | High | Low | Fallback to voicemail, monitoring alerts |
| WebSocket connection instability | Medium | Medium | Auto-reconnect, timeout handling |
| Audio quality issues | Medium | Medium | Fallback to voicemail, quality checks |
| Latency higher than expected | Low | Low | Acceptable up to 1s, monitor closely |
| Cost overruns | Medium | Low | Per-call limits, monitoring alerts |
| OpenAI rate limits | Medium | Medium | Queue system, fallback to voicemail |
| Function calling failures | Medium | Low | Fallback to transcript parsing |

### 15.2 Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Customers prefer voicemail | Low | Medium | Opt-in beta, easy disable |
| AI hallucinations | High | Low | Structured extraction, limited scope |
| Compliance issues | High | Low | Legal review, clear disclosures |
| Poor user experience | High | Medium | Beta testing, feedback loops |
| Adoption too low | Medium | Medium | Marketing, onboarding guide |

### 15.3 Implementation Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Regression to existing flow | Critical | Very Low | Feature flag, extensive testing |
| WebSocket complexity | Medium | High | Use proven libraries, simplify |
| OpenAI API changes | Medium | Low | Version pinning, abstraction layer |
| Database migration issues | High | Low | Rollback plan, test migrations |

---

## 16. Beta Rollout Strategy

### 16.1 Phased Rollout

**Phase 1: Internal Testing (Week 1)**
- Enable for 3 internal test businesses
- Test all scenarios
- Monitor costs and errors
- Fix bugs

**Phase 2: Friendly Beta (Week 2)**
- Enable for 10 friendly customers
- Gather feedback
- Monitor closely
- Quick iterations

**Phase 3: Limited Beta (Week 3-4)**
- Enable for 50 beta customers
- Monitor at scale
- Optimize costs
- Document issues

**Phase 4: Open Beta (Week 5+)**
- Enable for all opt-in customers
- Full monitoring
- Gradual expansion

### 16.2 Success Metrics

- AI session success rate > 90%
- Fallback rate < 10%
- Average latency < 500ms
- Customer satisfaction > 4/5
- Cost per acceptable lead < current + 20%

### 16.3 Exit Criteria

If any metric fails for 3 consecutive days:
- Pause new enrollments
- Investigate root cause
- Fix or rollback

---

## 17. Monitoring and Observability

### 17.1 Key Metrics

- AI session success rate
- Average call duration
- Fallback rate
- Average latency
- Cost per call
- Extraction accuracy
- Customer satisfaction

### 17.2 Required Logs

```
[AI ASSISTANT] Session started: {session_id}, call_sid: {call_sid}
[AI ASSISTANT] WebSocket connected: {session_id}
[AI ASSISTANT] OpenAI connected: {session_id}
[AI ASSISTANT] Conversation turn: {turn_number}, duration: {duration}
[AI ASSISTANT] Extraction result: {name, reason, urgency, number}
[AI ASSISTANT] Session completed: {session_id}, duration: {duration}s
[AI ASSISTANT] Fallback triggered: {reason}, call_sid: {call_sid}
[AI ASSISTANT] Error: {error}, session_id: {session_id}
```

### 17.3 Error Alerts

- OpenAI API error rate > 5%
- AI session failure rate > 10%
- Average latency > 1s
- Cost per call > $0.50
- WebSocket error rate > 5%

---

## 18. Success Criteria

### 18.1 Technical Success

- [ ] AI sessions complete successfully > 90% of time
- [ ] Fallback rate < 10%
- [ ] Average latency < 500ms
- [ ] Zero regressions to existing voicemail flow
- [ ] All error scenarios handled gracefully
- [ ] WebSocket reliability > 95%

### 18.2 Business Success

- [ ] Beta adoption rate > 20% of active businesses
- [ ] Customer satisfaction score > 4/5
- [ ] Lead conversion rate increase > 5%
- [ ] Cost per acceptable lead < current cost + 20%

### 18.3 User Experience Success

- [ ] Settings UI intuitive (completion time < 30s)
- [ ] AI greeting natural and clear
- [ ] Extraction accuracy > 85%
- [ ] Easy to disable if issues arise
- [ ] No dead ends for any caller

---

## 19. Conclusion

### 19.1 Final Recommendation

**Architecture**: Twilio Media Streams + OpenAI Realtime API

**Why**:
- Natural conversation experience (~400ms latency)
- High reliability (Twilio + OpenAI)
- Manageable complexity
- Fast beta path (4-5 weeks)
- Easy fallback
- Cost-effective (~$0.20-0.30/call)

### 19.2 Next Steps

1. Review this document
2. Approve architecture
3. Approve budget
4. Approve timeline
5. Begin Phase 1 implementation

### 19.3 Approval Checklist

- [ ] Architecture approved by Twilio architect
- [ ] Architecture approved by OpenAI specialist
- [ ] Database schema approved by DBA
- [ ] Security review completed
- [ ] Legal review for compliance
- [ ] Cost analysis approved
- [ ] Implementation timeline approved
- [ ] Success criteria agreed upon
- [ ] Rollback plan documented
- [ ] Monitoring strategy defined
- [ ] Beta testers identified

---

**Document Status**: Ready for Review  
**Next Step**: Architecture review meeting with stakeholders
