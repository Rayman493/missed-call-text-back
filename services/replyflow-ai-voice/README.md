# ReplyFlow AI Voice Service - Phase 1A POC

## Overview

This is a minimal technical proof-of-concept (Phase 1A) for the ReplyFlowHQ AI Call Assistant. It proves that:

1. Twilio can connect to Fly.io WebSocket service
2. Fly.io can connect to OpenAI Realtime API
3. AI can speak a greeting
4. Caller can hear the greeting
5. Failure falls back safely to voicemail

**This is NOT the full AI assistant.** It only proves the technical loop.

## Architecture

```
Twilio → Vercel voice webhook → Fly.io WebSocket → OpenAI Realtime
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd services/replyflow-ai-voice
npm install
```

### 2. Configure Environment Variables

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
OPENAI_API_KEY=sk-...
PORT=8080
```

### 3. Build

```bash
npm run build
```

### 4. Test Locally

```bash
npm start
```

Health check: `http://localhost:8080/health`

### 5. Deploy to Fly.io

#### Install Fly.io CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

#### Authenticate

```bash
fly auth login
```

#### Initialize

```bash
fly launch
```

- App name: `replyflow-ai-voice`
- Region: `ewr` (or nearest to Twilio/OpenAI)
- No database needed

#### Set Secrets

```bash
fly secrets set OPENAI_API_KEY=sk-...
```

#### Deploy

```bash
fly deploy
```

#### Verify

```bash
# Check logs
fly logs

# Check health
curl https://replyflow-ai-voice.fly.dev/health
```

## Vercel Integration

### Environment Variables

Add to Vercel environment variables:

```bash
# Enable POC route (Phase 1A)
AI_ASSISTANT_USE_POC=true

# Fly.io WebSocket URL
AI_VOICE_FLY_WS_URL=wss://replyflow-ai-voice.fly.dev/stream

# Existing AI flags
AI_CALL_ASSISTANT_ENABLED=true
NEXT_PUBLIC_AI_CALL_ASSISTANT_ENABLED=true
AI_CALL_ASSISTANT_ALLOWED_BUSINESS_IDS=your-business-uuid-here
OPENAI_API_KEY=sk-...
```

### Deploy Vercel

```bash
vercel --prod
```

## Testing

### 1. Enable AI for Test Business

```bash
# Set environment variables
AI_CALL_ASSISTANT_ENABLED=true
AI_ASSISTANT_ALLOWED_BUSINESS_IDS=your-business-uuid
```

### 2. Place Test Call

Call your Twilio test number from your phone.

### 3. Expected Behavior

**Success**:
- Caller hears: "Hello. This is the ReplyFlow AI Assistant test environment."
- Call ends cleanly
- Logs show successful path

**Failure**:
- Falls back to voicemail
- Logs show failure reason

### 4. Check Logs

**Fly.io logs**:
```bash
fly logs
```

**Expected logs**:
```
[AI POC] Twilio connected
[AI POC] OpenAI connected
[AI POC] Greeting sent
[AI POC] Greeting completed
[AI POC] Stream closed
```

## Fallback

If anything fails, the system automatically falls back to the existing voicemail flow.

### Immediate Disable

```bash
# Vercel
AI_ASSISTANT_USE_POC=false
vercel --prod

# Or disable entirely
AI_CALL_ASSISTANT_ENABLED=false
vercel --prod
```

### Stop Fly.io Service

```bash
fly scale count 0
```

## Files

- `src/index.ts` - Main server
- `src/openai-client.ts` - OpenAI Realtime client (minimal)
- `src/twilio-stream.ts` - Twilio Media Stream handler
- `src/logger.ts` - Logging utility
- `Dockerfile` - Fly.io container
- `fly.toml` - Fly.io configuration
- `package.json` - Dependencies

## Cost

**Fly.io**: $5/month (512MB RAM, 1 vCPU)
**OpenAI**: ~$0.10-0.15 per call
**Twilio**: ~$0.015 per call

## Next Steps

After Phase 1A succeeds:
- Implement full conversation handling
- Add transcript saving
- Add data extraction
- Add lead creation
- Add monitoring
- Scale to production

## Troubleshooting

### Build Fails

```bash
# Check TypeScript
npm run typecheck
```

### Fly.io Deployment Fails

```bash
# Check Fly.io status
fly status

# Check logs
fly logs
```

### Connection Fails

Check:
- OpenAI API key is set
- Fly.io service is running
- Vercel environment variables are set
- Business is in allowlist

### Logs Show Errors

Check Fly.io logs:
```bash
fly logs --tail
```
