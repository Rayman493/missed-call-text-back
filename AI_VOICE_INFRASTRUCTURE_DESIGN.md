# ReplyFlowHQ - AI Voice Service Infrastructure Design (Phase 1)

## Executive Summary

This document outlines the infrastructure design for Phase 1 of the AI Call Assistant, which requires persistent WebSocket connections to support Twilio Media Streams + OpenAI Realtime API integration.

**Key Decision**: Deploy a dedicated WebSocket service on Fly.io for production-grade WebSocket support at low operational complexity and cost.

**Architecture**: Microservices pattern with clear separation between:
- Next.js API (Vercel) - Webhooks, UI, business logic
- AI Voice Service (Fly.io) - WebSocket handling, OpenAI integration
- Shared Database (Supabase) - State persistence

---

## 1. Hosting Options Evaluation

### 1.1 Comparison Matrix

| Provider | WebSocket Support | Deployment | Monthly Cost | Scaling | Ops Complexity | Best For |
|----------|-------------------|------------|--------------|---------|----------------|----------|
| **Fly.io** | ⭐⭐⭐⭐⭐ Native | CLI/CI | $5-20 | Auto | Low | ⭐⭐⭐⭐⭐ Recommended |
| Railway | ⭐⭐⭐⭐⭐ Native | Git push | $5-20 | Auto | Very Low | ⭐⭐⭐⭐ Runner-up |
| Render | ⭐⭐⭐⭐ Native | Git push | $7-25 | Manual | Low | ⭐⭐⭐ Good |
| DigitalOcean App Platform | ⭐⭐⭐⭐ Native | Git push | $5-40 | Manual | Low | ⭐⭐⭐ Good |
| AWS ECS/Fargate | ⭐⭐⭐⭐⭐ Native | Complex | $20-100 | Auto | High | ⭐ Enterprise |
| Google Cloud Run | ⭐⭐⭐⭐ Native | CLI/CI | $10-50 | Auto | Medium | ⭐⭐ Enterprise |
| Azure Container Apps | ⭐⭐⭐⭐ Native | CLI/CI | $15-60 | Auto | Medium | ⭐⭐ Enterprise |

### 1.2 Detailed Analysis

#### Option 1: Fly.io ⭐ RECOMMENDED

**Pros**:
- Native WebSocket support (built for persistent connections)
- Simple CLI deployment (`fly launch`)
- Global edge deployment (reduces latency)
- Automatic HTTPS
- Free tier available
- Docker-based (containerized)
- Easy rollback (`fly deploy --rollback`)
- Built-in secrets management
- Low cold start time

**Cons**:
- Smaller community than AWS/GCP
- Less mature monitoring (but adequate)

**Cost Estimate**:
- Free tier: 256MB RAM, 1 CPU share (may be insufficient)
- Paid: $5/month for 512MB RAM, 1 vCPU
- Scaled: $20/month for 2GB RAM, 2 vCPUs

**Best For**: Solo-founder SaaS, low ops burden, fast deployment

#### Option 2: Railway

**Pros**:
- Excellent developer experience
- Git push deployment
- Native WebSocket support
- Built-in metrics dashboard
- Easy scaling
- Good documentation

**Cons**:
- Slightly higher cost
- Less global edge presence
- Pricing can be unpredictable with scaling

**Cost Estimate**:
- Starter: $5/month (512MB RAM)
- Standard: $20/month (1GB RAM)

**Best For**: Teams prioritizing DX over cost

#### Option 3: Render

**Pros**:
- Simple deployment
- Native WebSocket support
- Good free tier
- Clear pricing

**Cons**:
- Manual scaling
- Cold starts on free tier
- Less edge locations

**Cost Estimate**:
- Free: 512MB RAM (with cold starts)
- Starter: $7/month (512MB RAM, always on)

**Best For**: Cost-sensitive projects

#### Option 4: DigitalOcean App Platform

**Pros**:
- Reliable and stable
- Native WebSocket support
- Good documentation
- Predictable pricing
- Managed databases available

**Cons**:
- Manual scaling
- Less DX than Railway/Fly.io
- Fewer edge locations

**Cost Estimate**:
- Basic: $5/month (512MB RAM)
- Professional: $12/month (1GB RAM)

**Best For**: Traditional cloud infrastructure preference

#### Option 5: AWS ECS/Fargate

**Pros**:
- Enterprise-grade reliability
- Auto-scaling
- Extensive monitoring
- Global infrastructure
- WebSocket support

**Cons**:
- High operational complexity
- Expensive for small scale
- Steep learning curve
- Overkill for solo founder

**Cost Estimate**:
- Fargate: $20-50/month minimum
- Load balancer: $20/month
- Monitoring: $10-30/month

**Best For**: Enterprise, scale requirements

### 1.3 Final Recommendation: Fly.io

**Why Fly.io for ReplyFlowHQ**:

1. **WebSocket Native**: Built for persistent connections
2. **Low Cost**: $5-20/month for adequate resources
3. **Low Ops Burden**: Simple CLI, auto-scaling, easy rollback
4. **Global Edge**: Reduces latency for Twilio → OpenAI
5. **Solo-Friendly**: Designed for individual developers
6. **Fast Deployment**: `fly deploy` in seconds
7. **Docker-Based**: Portable, testable locally
8. **Free Tier**: Can test without commitment

**Trade-offs Accepted**:
- Smaller ecosystem (adequate for use case)
- Less mature monitoring (sufficient for Phase 1)

---

## 2. Architecture Design

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Twilio                                   │
│                    (Incoming Call)                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel (Next.js)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  /api/twilio/voice (existing)                           │  │
│  │  - Check feature flags                                   │  │
│  │  - If AI enabled → redirect to AI voice service          │  │
│  │  - Else → existing voicemail flow                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  /api/twilio/ai-assistant/start (Phase 0)               │  │
│  │  - Create session in Supabase                           │  │
│  │  - Return TwiML with WebSocket URL                      │  │
│  │  - URL: wss://ai-voice.replyflowhq.com/stream           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Fly.io (AI Voice Service)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  WebSocket Server (Node.js)                              │  │
│  │  /stream endpoint                                        │  │
│  │  - Accept Twilio Media Stream                           │  │
│  │  - Connect to OpenAI Realtime                           │  │
│  │  - Bridge audio between Twilio & OpenAI                  │  │
│  │  - Manage conversation state                             │  │
│  │  - Capture transcript                                    │  │
│  │  - Call function to extract data                         │  │
│  │  - On completion: save to Supabase                       │  │
│  │  - On error: trigger fallback                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────┬────────────────────────────────┬───────────────────┘
               │                                │
               ▼                                ▼
┌─────────────────────────────┐  ┌──────────────────────────────┐
│    OpenAI Realtime API      │  │        Supabase              │
│  (wss://api.openai.com)    │  │  - ai_call_sessions table    │
│  - Audio streaming          │  │  - businesses table         │
│  - Function calling         │  │  - leads table              │
│  - Transcript generation    │  │  - notifications table      │
└─────────────────────────────┘  └──────────────────────────────┘
```

### 2.2 Service Boundaries

**Vercel (Next.js)** - Responsibilities:
- HTTP API endpoints
- Feature flag validation
- Session initialization
- Webhook handling (Twilio, Stripe)
- UI rendering
- Business logic (non-realtime)
- Authentication

**Fly.io (AI Voice Service)** - Responsibilities:
- WebSocket connection handling
- Real-time audio processing
- OpenAI Realtime integration
- Conversation state management
- Transcript capture
- Data extraction
- Fallback triggering

**Supabase** - Shared Responsibilities:
- Session state persistence
- Business data
- Lead data
- Notifications
- Transaction consistency

### 2.3 Connection Flow

```
1. Incoming Call → Twilio
2. Twilio → Vercel /api/twilio/voice
3. Vercel checks feature flags
4. If enabled → create session in Supabase
5. Vercel returns TwiML with WebSocket URL
6. Twilio connects to Fly.io WebSocket
7. Fly.io validates session ID
8. Fly.io connects to OpenAI Realtime
9. Bidirectional audio bridge established
10. Conversation proceeds
11. OpenAI calls extraction function
12. Fly.io saves extracted data to Supabase
13. Call ends
14. Fly.io updates session status
15. Fallback if any error occurs
```

---

## 3. WebSocket Server Design

### 3.1 Service Architecture

**Technology Stack**:
- **Runtime**: Node.js 20 LTS
- **Framework**: ws (WebSocket library)
- **Language**: TypeScript
- **Container**: Docker
- **Deployment**: Fly.io

**Service Components**:

1. **WebSocket Server**
   - `/stream` endpoint
   - Accepts Twilio Media Stream connections
   - Manages connection lifecycle

2. **OpenAI Client**
   - WebSocket connection to OpenAI Realtime
   - Audio streaming
   - Function calling

3. **Audio Bridge**
   - Relays audio between Twilio and OpenAI
   - Format conversion (if needed)
   - Buffer management

4. **Session Manager**
   - Tracks active sessions
   - Manages conversation state
   - Handles timeouts

5. **Database Client**
   - Supabase client (server-side)
   - Session persistence
   - Transcript saving

6. **Logger**
   - Structured logging
   - Error tracking
   - Metrics emission

### 3.2 Failure Handling

**Failure Scenarios**:

1. **Twilio Disconnects**
   - Detect connection close
   - Mark session as `caller_hungup`
   - Save partial transcript
   - No fallback needed (normal)

2. **OpenAI Disconnects**
   - Detect connection error
   - Mark session as `failed`
   - Trigger fallback to voicemail
   - Log error details

3. **WebSocket Error**
   - Catch all errors
   - Mark session as `failed`
   - Trigger fallback to voicemail
   - Log error

4. **Database Error**
   - Log error
   - Continue conversation (transcript in memory)
   - Retry save on completion
   - Alert if persistent

5. **Timeout**
   - 30s connection timeout
   - 120s session timeout
   - On timeout → fallback to voicemail

6. **Function Call Failure**
   - Fallback to transcript parsing
   - Use regex to extract data
   - Log failure

### 3.3 Logging Strategy

**Required Logs**:

```
[AI VOICE] Server started on port 8080
[AI VOICE] WebSocket connection accepted: {session_id}
[AI VOICE] Twilio stream connected: {session_id}
[AI VOICE] OpenAI connected: {session_id}
[AI VOICE] Audio bridge established: {session_id}
[AI VOICE] Conversation turn: {turn_number}, duration: {duration}
[AI VOICE] Transcript updated: {session_id}, length: {chars}
[AI VOICE] Function called: extract_customer_info, result: {data}
[AI VOICE] Session completed: {session_id}, duration: {duration}s
[AI VOICE] Fallback triggered: {session_id}, reason: {reason}
[AI VOICE] Error: {error}, session_id: {session_id}
[AI VOICE] Connection closed: {session_id}, reason: {reason}
```

**Log Levels**:
- `info`: Normal operations
- `warn`: Non-critical issues
- `error`: Failures requiring attention

**Log Destinations**:
- Console (Fly.io logs)
- Optional: External service (Sentry, LogRocket)

---

## 4. Database Integration

### 4.1 Review of Existing Schema

**Current `ai_call_sessions` table** (Phase 0):
- ✅ Basic fields (id, business_id, lead_id, call_sid, status, etc.)
- ✅ Extracted data fields (caller_name, reason_for_call, urgency, callback_number)
- ✅ Transcript and summary fields
- ✅ Error tracking
- ✅ Fallback stage tracking

### 4.2 Recommended Enhancements

**Add for Phase 1**:

```sql
-- Migration: 20260526020000_phase1_enhance_ai_sessions.sql

-- Add monitoring fields
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS websocket_connected_at timestamptz;
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS openai_connected_at timestamptz;
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS first_audio_at timestamptz;
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS last_audio_at timestamptz;

-- Add cost tracking
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS openai_cost_cents INTEGER DEFAULT 0;
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS twilio_cost_cents INTEGER DEFAULT 0;

-- Add conversation metrics
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS audio_bytes_received BIGINT DEFAULT 0;
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS audio_bytes_sent BIGINT DEFAULT 0;
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS transcript_chars INTEGER DEFAULT 0;

-- Add OpenAI-specific fields
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS openai_model TEXT DEFAULT 'gpt-4o';
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS openai_response_time_ms INTEGER;

-- Add health check fields
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS health_check_passed BOOLEAN DEFAULT TRUE;
ALTER TABLE ai_call_sessions ADD COLUMN IF NOT EXISTS health_check_reason TEXT;

-- Add indexes for monitoring queries
CREATE INDEX IF NOT EXISTS idx_ai_sessions_created_at_status ON ai_call_sessions(created_at, status);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_business_created_at ON ai_call_sessions(business_id, created_at);
```

### 4.3 Recommended Indexes

**Existing** (from Phase 0):
- `idx_ai_call_sessions_business_id`
- `idx_ai_call_sessions_lead_id`
- `idx_ai_call_sessions_call_sid`
- `idx_ai_call_sessions_status`
- `idx_ai_call_sessions_created_at`

**Additional for Phase 1**:
- `idx_ai_sessions_created_at_status` - Monitoring dashboard queries
- `idx_ai_sessions_business_created_at` - Business analytics

---

## 5. Security Review

### 5.1 API Key Storage

**OpenAI API Key**:
- Store in Fly.io secrets: `fly secrets set OPENAI_API_KEY=sk-...`
- Never log the key
- Rotate regularly
- Use environment variable in service

**Supabase Service Role Key**:
- Store in Fly.io secrets
- Required for server-side database access
- Never expose to client

### 5.2 Authentication

**Twilio Signature Validation**:
- Validate on Vercel (existing)
- Fly.io trusts Vercel (internal service)
- Add shared secret for service-to-service auth (optional)

**Service-to-Service Auth** (Optional for Phase 1):
- Shared secret between Vercel and Fly.io
- Pass in query param: `?secret=shared-secret`
- Validate on Fly.io before accepting connection
- Prevents unauthorized WebSocket connections

**Implementation**:
```bash
# Fly.io secret
fly secrets set SHARED_SECRET=your-random-secret-here

# Vercel env var
AI_VOICE_SHARED_SECRET=your-random-secret-here
```

### 5.3 Environment Variable Management

**Fly.io Secrets**:
```bash
fly secrets set OPENAI_API_KEY=sk-...
fly secrets set SUPABASE_SERVICE_ROLE_KEY=...
fly secrets set SUPABASE_URL=...
fly secrets set SHARED_SECRET=...
```

**Vercel Environment Variables**:
```bash
AI_VOICE_WS_URL=wss://ai-voice.replyflowhq.com/stream
AI_VOICE_SHARED_SECRET=...
```

### 5.4 Network Security

**TLS/SSL**:
- Fly.io provides automatic HTTPS
- WebSocket uses secure `wss://` protocol
- No plain HTTP/WebSocket

**IP Restrictions** (Optional):
- Restrict Fly.io to accept connections from Vercel IPs
- Use Fly.io firewall rules
- Not required for Phase 1 (can add later)

---

## 6. Monitoring Design

### 6.1 Metrics to Track

**Session Metrics**:
- Total sessions per hour
- Success rate (% completed)
- Fallback rate (% fallback_voicemail)
- Average session duration
- Average latency (first audio to first response)

**Cost Metrics**:
- OpenAI cost per session
- Twilio cost per session
- Total daily cost
- Cost per lead

**Error Metrics**:
- OpenAI connection errors
- WebSocket errors
- Database errors
- Timeout errors

### 6.2 Monitoring Implementation

**Phase 1 (Simple)**:
- Fly.io built-in metrics (CPU, memory, network)
- Console logs (structured JSON)
- Supabase dashboard for database queries
- Manual log review

**Phase 2 (Enhanced)**:
- Sentry for error tracking
- Custom metrics dashboard (Grafana/Chart.js)
- Alerting on error rate > 5%
- Cost alerts (daily budget exceeded)

### 6.3 Log Format

**Structured JSON**:
```json
{
  "timestamp": "2026-05-26T13:55:00Z",
  "level": "info",
  "service": "ai-voice",
  "session_id": "uuid",
  "event": "session_started",
  "business_id": "uuid",
  "call_sid": "CA..."
}
```

---

## 7. Phase 1 Implementation Plan

### 7.1 Infrastructure Setup Steps

**Step 1: Install Fly.io CLI**
```bash
# Install Fly.io CLI
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login
```

**Step 2: Initialize Fly.io App**
```bash
# Create new directory for AI voice service
mkdir ai-voice-service
cd ai-voice-service

# Initialize Fly.io app
fly launch
# - Select region (nearest to Twilio/OpenAI)
# - Select Node.js runtime
```

**Step 3: Create Dockerfile**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm", "start"]
```

**Step 4: Configure fly.toml**
```toml
app = "ai-voice-replyflowhq"
primary_region = "ewr"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

**Step 5: Deploy**
```bash
fly deploy
```

**Step 6: Set Secrets**
```bash
fly secrets set OPENAI_API_KEY=sk-...
fly secrets set SUPABASE_SERVICE_ROLE_KEY=...
fly secrets set SUPABASE_URL=...
fly secrets set SHARED_SECRET=...
```

**Step 7: Configure Custom Domain**
```bash
fly certs add ai-voice.replyflowhq.com
```

### 7.2 Service Implementation Steps

**Step 1: Create WebSocket Server**
- Initialize Node.js project
- Install dependencies: `ws`, `dotenv`, `@supabase/supabase-js`, `openai`
- Create `/stream` endpoint
- Implement connection handling

**Step 2: Implement OpenAI Integration**
- Connect to OpenAI Realtime WebSocket
- Handle audio streaming
- Implement function calling

**Step 3: Implement Audio Bridge**
- Relay audio between Twilio and OpenAI
- Handle format conversion (μ-law)
- Manage buffers

**Step 4: Implement Session Management**
- Track active sessions
- Manage conversation state
- Handle timeouts

**Step 5: Implement Database Integration**
- Connect to Supabase
- Save transcripts
- Save extracted data
- Update session status

**Step 6: Implement Fallback Logic**
- Detect errors
- Trigger fallback to voicemail
- Log fallback reasons

**Step 7: Add Logging**
- Structured logging
- Error tracking
- Metrics emission

**Step 8: Test Locally**
- Use ngrok for local testing
- Test with Twilio test calls
- Verify fallback behavior

**Step 9: Deploy to Fly.io**
- Deploy using `fly deploy`
- Verify deployment
- Test with real Twilio calls

### 7.3 Vercel Integration Steps

**Step 1: Update Environment Variables**
```bash
# Vercel
AI_VOICE_WS_URL=wss://ai-voice.replyflowhq.com/stream
AI_VOICE_SHARED_SECRET=...
```

**Step 2: Update Phase 0 Start Route**
- Remove Phase 0 fallback
- Return actual TwiML with WebSocket URL
- Add shared secret to URL

**Step 3: Deploy Vercel**
```bash
vercel --prod
```

### 7.4 Environment Variables Summary

**Fly.io Secrets**:
```bash
OPENAI_API_KEY=sk-...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_URL=https://....
SHARED_SECRET=random-secret-here
```

**Vercel Environment Variables**:
```bash
AI_VOICE_WS_URL=wss://ai-voice.replyflowhq.com/stream
AI_VOICE_SHARED_SECRET=random-secret-here
# Existing AI flags remain
AI_CALL_ASSISTANT_ENABLED=true
NEXT_PUBLIC_AI_CALL_ASSISTANT_ENABLED=true
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=...
```

### 7.5 Rollback Strategy

**Immediate Rollback**:
```bash
# Vercel: Disable AI
AI_CALL_ASSISTANT_ENABLED=false
vercel --prod

# Fly.io: Stop service
fly scale count 0
```

**Per-Business Rollback**:
```bash
# Remove from allowlist
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=
vercel --prod
```

**Code Rollback**:
```bash
# Vercel
vercel rollback

# Fly.io
fly deploy --rollback
```

---

## 8. Cost Estimate

### 8.1 Infrastructure Costs

**Fly.io**:
- Free tier: $0/month (256MB RAM, may be insufficient)
- Basic: $5/month (512MB RAM, 1 vCPU) - Recommended for Phase 1
- Scaled: $20/month (2GB RAM, 2 vCPUs) - For higher volume

**Vercel**:
- Pro plan: $20/month (already paying)
- No additional cost for AI feature

**Custom Domain**:
- $0 (Fly.io includes)
- DNS: $0 (existing)

**Total Infrastructure**: $5/month (Fly.io basic)

### 8.2 Operational Costs (Per Call)

**OpenAI Realtime**:
- Audio input: $0.06/min × 0.75min = $0.045
- Audio output: $0.24/min × 0.25min = $0.06
- **Total**: ~$0.10-0.15 per call

**Twilio Media Streams**:
- $0.0015/min × 1min = $0.0015
- Voice minutes: $0.013/min × 1min = $0.013
- **Total**: ~$0.015 per call

**Total Per Call**: ~$0.12-0.17

### 8.3 Monthly Cost Estimates

**Low Volume (100 calls/month)**:
- Infrastructure: $5
- OpenAI: $15
- Twilio: $1.50
- **Total**: ~$22/month

**Medium Volume (1,000 calls/month)**:
- Infrastructure: $5
- OpenAI: $150
- Twilio: $15
- **Total**: ~$170/month

**High Volume (10,000 calls/month)**:
- Infrastructure: $20 (scaled)
- OpenAI: $1,500
- Twilio: $150
- **Total**: ~$1,670/month

---

## 9. Risks and Mitigation

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| WebSocket connection drops | Medium | High | Auto-reconnect, fallback to voicemail |
| OpenAI API downtime | Low | High | Fallback to voicemail, monitoring alerts |
| Fly.io service outage | Low | Medium | Multi-region deployment (future) |
| Latency too high | Low | Medium | Choose nearest region, optimize |
| Memory exhaustion | Low | Medium | Monitor memory, auto-scale |
| Database connection issues | Low | Medium | Retry logic, connection pooling |

### 9.2 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cost overruns | Medium | Medium | Per-call limits, monitoring alerts |
| Scaling issues | Low | High | Load testing, auto-scaling config |
| Debugging difficulty | Medium | Medium | Structured logging, metrics |
| Deployment failures | Low | Medium | Rollback plan, blue-green deployment |

### 9.3 Security Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| API key exposure | Low | Critical | Secrets management, no logging |
| Unauthorized connections | Low | Medium | Shared secret auth (optional) |
| DDoS attacks | Low | Medium | Rate limiting, Fly.io protection |

---

## 10. Timeline for Phase 1 Implementation

### 10.1 Phased Approach

**Week 1: Infrastructure Setup**
- Day 1-2: Fly.io account setup, CLI installation
- Day 3-4: Initialize app, configure Dockerfile
- Day 5: Deploy basic WebSocket server, test connectivity

**Week 2: Core Functionality**
- Day 1-2: Implement OpenAI Realtime integration
- Day 3-4: Implement audio bridge
- Day 5: Implement session management

**Week 3: Data Integration**
- Day 1-2: Implement database integration
- Day 3-4: Implement transcript saving
- Day 5: Implement data extraction

**Week 4: Testing & Deployment**
- Day 1-2: Local testing with ngrok
- Day 3-4: Deploy to Fly.io, test with Twilio
- Day 5: Update Vercel integration, end-to-end testing

**Total**: 4 weeks (20 days)

### 10.2 Buffer for Unknowns

Add 1 week buffer: **5 weeks total**

### 10.3 Resource Requirements

**Developer Time**: 5 weeks (1 senior engineer)
**Infrastructure Cost**: $5-20/month
**Operational Cost**: $0.12-0.17 per call

---

## 11. Acceptance Criteria

Phase 1 is complete when:

- [ ] WebSocket service deployed on Fly.io
- [ ] Service accepts Twilio Media Stream connections
- [ ] Service connects to OpenAI Realtime
- [ ] Audio bridge works bidirectionally
- [ ] Conversation completes successfully
- [ ] Transcript is saved to database
- [ ] Extracted data is saved to database
- [ ] Lead is created/updated
- [ ] Fallback to voicemail works on errors
- [ ] No dead ends for any caller
- [ ] Monitoring logs are comprehensive
- [ ] Cost tracking is implemented
- [ ] Security secrets are properly managed
- [ ] Rollback strategy is tested
- [ ] Build passes
- [ ] End-to-end test passes

---

## 12. Appendix

### 12.1 Fly.io Commands Reference

```bash
# Install CLI
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login

# Initialize app
fly launch

# Deploy
fly deploy

# Set secrets
fly secrets set KEY=value

# View logs
fly logs

# Scale
fly scale count 2

# Rollback
fly deploy --rollback

# Open console
fly console
```

### 12.2 Recommended Dockerfile

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### 12.3 Sample fly.toml

```toml
app = "ai-voice-replyflowhq"
primary_region = "ewr"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false
  min_machines_running = 1

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

---

**Document Status**: Ready for Review  
**Next Step**: Infrastructure review and approval before Phase 1 implementation
