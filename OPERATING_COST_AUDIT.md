# ReplyFlow Operating Cost and Maintenance Audit

**Date:** July 30, 2026  
**Type:** Read-only analysis and documentation  
**Status:** Complete (requires billing data verification from Ryan)

---

## Executive Summary

ReplyFlow is a multi-service SaaS application with significant per-customer variable costs due to AI voice processing and telecom usage. The $59/month subscription price faces margin pressure from:

- **High variable costs:** OpenAI Realtime API and Twilio voice/SMS create per-customer costs that scale with usage
- **Fixed infrastructure overhead:** Fly.io, Vercel, Supabase, and monitoring create baseline costs
- **Platform fees:** Apple Developer Program and Google Play create annual costs
- **Phone number inventory:** Warm number buffer creates ongoing Twilio charges

**Key Finding:** $59/month is likely sustainable for typical usage but vulnerable to heavy-usage customers and requires careful monitoring. Contribution margins improve significantly with scale as fixed costs are amortized.

**Recommendation:** Proceed with $59 launch pricing but implement usage monitoring immediately and consider fair-use limits if heavy customers consistently erode margins.

---

## 1. Confirmed Service Inventory

### A. Fixed Monthly Infrastructure Costs

| Service | Purpose | Cost Category | Estimated Monthly Cost | Status |
|---------|---------|---------------|----------------------|--------|
| **Vercel** | Web hosting, serverless functions, cron jobs | Fixed | $20-40 (Pro plan) | Estimate |
| **Supabase** | Database, storage, authentication, realtime | Fixed | $25-50 (Pro plan) | Estimate |
| **Fly.io** | AI voice service hosting (replyflow-ai-voice) | Fixed | $5-15 (1 shared CPU, 512MB RAM) | Estimate |
| **Sentry** | Error monitoring and performance tracking | Fixed | $0-26 (Developer plan) | Estimate |
| **Upstash** | Rate limiting | Fixed | $0-5 (Free tier) | Estimate |
| **Resend** | Email service (transactional emails) | Usage-based | $0-20 (based on volume) | Estimate |
| **Domain registration** | replyflowhq.com | Annual (amortized) | $1-2/month | Estimate |
| **Business email** | Google Workspace or similar | Fixed | $6-12/month | Estimate |

**Estimated Fixed Infrastructure Total:** $57-150/month (requires billing verification)

### B. Per-Customer Fixed Costs

| Service | Purpose | Cost Category | Estimated Cost Per Customer | Status |
|---------|---------|---------------|-----------------------------|--------|
| **Twilio phone number** | Dedicated ReplyFlow number per business | Per-customer fixed | $1.15/month (US local number) | Estimate |
| **Warm number buffer** | 3 unassigned numbers for onboarding | Shared fixed | $3.45/month (3 × $1.15) | Estimate |

**Estimated Per-Customer Fixed Total:** $1.15/month

### C. Usage-Based Costs

| Service | Purpose | Cost Category | Pricing Model | Status |
|---------|---------|---------------|---------------|--------|
| **Twilio Voice** | Inbound/outbound calls | Usage-based | $0.013/minute (inbound US) | Estimate |
| **Twilio SMS** | Inbound/outbound SMS segments | Usage-based | $0.0079/segment (US) | Estimate |
| **Twilio MMS** | Inbound/outbound MMS | Usage-based | $0.02/segment (US) | Estimate |
| **Twilio Recording** | Call recording storage | Usage-based | $0.003/minute stored | Estimate |
| **OpenAI Realtime API** | AI voice (gpt-realtime-2.1) | Usage-based | $40/1M input tokens, $80/1M output tokens | Estimate |
| **OpenAI Whisper** | Voicemail transcription | Usage-based | $0.006/minute | Estimate |
| **OpenAI Text Models** | voicemail-extraction, summarization (gpt-4o-mini) | Usage-based | $0.15/1M input tokens, $0.60/1M output tokens | Estimate |
| **Stripe Subscription** | $59 subscription processing | Usage-based | 2.9% + $0.30 per transaction | Confirmed |
| **Stripe Terminal** | Tap to Pay transactions | Usage-based | 2.9% + $0.30 per transaction (passed to business) | Confirmed |
| **Vercel Functions** | Serverless execution | Usage-based | Included in Pro plan (with limits) | Estimate |
| **Vercel Bandwidth** | Data transfer | Usage-based | Included in Pro plan (with limits) | Estimate |
| **Supabase Storage** | Recordings, attachments | Usage-based | $0.021/GB/month | Estimate |
| **Supabase Database** | Database operations | Usage-based | Included in Pro plan (with limits) | Estimate |
| **Firebase Cloud Messaging** | Push notifications | Usage-based | Free tier (up to limits) | Estimate |

### D. Annual Costs (Amortized Monthly)

| Service | Purpose | Annual Cost | Monthly Amortized | Status |
|---------|---------|-------------|-------------------|--------|
| **Apple Developer Program** | iOS app distribution | $99/year | $8.25/month | Confirmed |
| **Google Play** | Android app distribution | $25 (one-time) | $0.21/month (amortized over 10 years) | Estimate |
| **SSL Certificates** | HTTPS security | $0 (Let's Encrypt) | $0/month | Confirmed |

**Estimated Annual Costs Total:** $8.46/month

### E. Optional or Temporary Development Costs

| Service | Purpose | Cost Category | Status |
|---------|---------|---------------|--------|
| **Cloud Mac server** | iOS builds (if used) | Optional | Unknown |
| **Staging infrastructure** | Testing environments | Optional | Unknown |
| **Test phone numbers** | Development testing | Optional | Unknown |

---

## 2. Unknown Services or Costs Requiring Verification

| Item | Reason | Required Verification |
|------|--------|----------------------|
| **Vercel plan tier** | Unknown actual plan and overages | Vercel dashboard invoice |
| **Supabase plan tier** | Unknown actual plan and database/storage limits | Supabase dashboard invoice |
| **Fly.io actual costs** | Unknown bandwidth, IPv4, and stopped machine costs | Fly.io dashboard invoice |
| **Sentry plan tier** | Unknown if using free or paid tier | Sentry dashboard invoice |
| **Upstash actual usage** | Unknown if free tier sufficient | Upstash dashboard invoice |
| **Resend email volume** | Unknown monthly email volume | Resend dashboard invoice |
| **Business email provider** | Unknown provider and plan | Email provider invoice |
| **Domain registrar** | Unknown registrar and renewal cost | Domain registrar invoice |
| **Cloud Mac server** | Unknown if currently in use | AWS/other provider invoice |
| **Twilio number inventory** | Unknown current count and status | Twilio phone number dashboard |
| **Twilio recording storage** | Unknown current storage volume | Twilio usage dashboard |
| **Supabase storage usage** | Unknown current storage volume | Supabase storage dashboard |
| **Google Play fees** | Unknown if any recurring fees | Google Play Console |
| **Stripe Terminal reader costs** | Unknown if hardware purchased or leased | Stripe Terminal dashboard |

---

## 3. Fixed Monthly Cost Table

| Expense | Monthly Cost | Cost Type | Data Source |
|---------|--------------|-----------|-------------|
| Vercel hosting | $20-40 | Fixed | Estimate |
| Supabase database/storage | $25-50 | Fixed | Estimate |
| Fly.io AI voice service | $5-15 | Fixed | Estimate |
| Sentry monitoring | $0-26 | Fixed | Estimate |
| Upstash rate limiting | $0-5 | Fixed | Estimate |
| Resend email | $0-20 | Usage-based (fixed allocation) | Estimate |
| Business email | $6-12 | Fixed | Estimate |
| Domain (amortized) | $1-2 | Annual (amortized) | Estimate |
| **Fixed Infrastructure Subtotal** | **$57-150/month** | | **Estimate** |

---

## 4. Annual Cost Table (Amortized Monthly)

| Expense | Annual Cost | Monthly Amortized | Cost Type | Data Source |
|---------|-------------|-------------------|-----------|-------------|
| Apple Developer Program | $99 | $8.25 | Annual | Confirmed |
| Google Play (one-time) | $25 | $0.21 | One-time (amortized) | Estimate |
| **Annual Costs Subtotal** | **$124** | **$8.46/month** | | **Confirmed/Estimate** |

---

## 5. Per-Customer Fixed-Cost Table

| Expense | Cost Per Customer | Cost Type | Data Source |
|---------|-------------------|-----------|-------------|
| Twilio phone number (US local) | $1.15 | Per-customer fixed | Estimate |
| **Per-Customer Fixed Subtotal** | **$1.15/month** | | **Estimate** |

---

## 6. Usage-Based Cost Table

| Service | Unit | Cost Per Unit | Typical Monthly Usage | Cost Per Customer (Typical) | Status |
|---------|------|---------------|----------------------|----------------------------|--------|
| Twilio Voice (inbound) | Minute | $0.013 | 30 minutes | $0.39 | Estimate |
| Twilio SMS (segment) | Segment | $0.0079 | 50 segments | $0.40 | Estimate |
| Twilio MMS | Segment | $0.02 | 5 segments | $0.10 | Estimate |
| Twilio Recording | Minute stored | $0.003 | 30 minutes × 30 days = 900 min | $2.70 | Estimate |
| OpenAI Realtime (input) | 1M tokens | $40 | 300K tokens | $12.00 | Estimate |
| OpenAI Realtime (output) | 1M tokens | $80 | 200K tokens | $16.00 | Estimate |
| OpenAI Whisper | Minute | $0.006 | 10 minutes | $0.06 | Estimate |
| OpenAI Text (gpt-4o-mini) | 1M tokens | $0.15/$0.60 | 50K input, 25K output | $0.02 | Estimate |
| Stripe Subscription | Transaction | 2.9% + $0.30 | 1 transaction | $2.01 | Confirmed |
| **Usage-Based Subtotal (Typical)** | | | | **$33.68/month** | **Estimate** |

---

## 7. Light Customer Unit Economics

**Profile Definition:**
- 10 missed calls per month
- 1 minute average call duration
- 10 AI intake calls (1 minute each)
- 20 SMS segments total
- 1 payment request
- Minimal storage

**Cost Breakdown:**

| Expense | Cost | Calculation |
|---------|------|-------------|
| **Revenue** | $59.00 | Subscription |
| **Stripe Processing** | -$2.01 | 2.9% of $59 + $0.30 |
| **Net Collected Revenue** | $56.99 | |
| **Twilio Phone Number** | -$1.15 | Per-customer fixed |
| **Twilio Voice** | -$0.13 | 10 minutes × $0.013 |
| **Twilio SMS** | -$0.16 | 20 segments × $0.0079 |
| **Twilio Recording** | -$0.90 | 10 minutes × 30 days × $0.003 |
| **OpenAI Realtime (input)** | -$1.20 | 10 calls × 30K tokens × $40/1M |
| **OpenAI Realtime (output)** | -$1.60 | 10 calls × 20K tokens × $80/1M |
| **OpenAI Whisper** | -$0.06 | 10 minutes × $0.006 |
| **Direct Usage Cost** | -$5.20 | |
| **Fixed Infrastructure Allocation** | -$2.28 | $57 ÷ 25 customers |
| **Annual Costs Allocation** | -$0.34 | $8.46 ÷ 25 customers |
| **Total Operating Cost** | -$8.97 | |
| **Contribution Profit** | $48.02 | |
| **Contribution Margin** | 84.3% | |

**Light Customer Conclusion:** High margin (84.3%) - sustainable

---

## 8. Typical Customer Unit Economics

**Profile Definition:**
- 30 missed calls per month
- 1 minute average call duration
- 25 AI intake calls (1 minute each)
- 50 SMS segments total
- 5 payment requests
- Standard storage

**Cost Breakdown:**

| Expense | Cost | Calculation |
|---------|------|-------------|
| **Revenue** | $59.00 | Subscription |
| **Stripe Processing** | -$2.01 | 2.9% of $59 + $0.30 |
| **Net Collected Revenue** | $56.99 | |
| **Twilio Phone Number** | -$1.15 | Per-customer fixed |
| **Twilio Voice** | -$0.39 | 30 minutes × $0.013 |
| **Twilio SMS** | -$0.40 | 50 segments × $0.0079 |
| **Twilio Recording** | -$2.70 | 30 minutes × 30 days × $0.003 |
| **OpenAI Realtime (input)** | -$3.00 | 25 calls × 30K tokens × $40/1M |
| **OpenAI Realtime (output)** | -$4.00 | 25 calls × 20K tokens × $80/1M |
| **OpenAI Whisper** | -$0.15 | 25 minutes × $0.006 |
| **Direct Usage Cost** | -$11.79 | |
| **Fixed Infrastructure Allocation** | -$2.28 | $57 ÷ 25 customers |
| **Annual Costs Allocation** | -$0.34 | $8.46 ÷ 25 customers |
| **Total Operating Cost** | -$15.56 | |
| **Contribution Profit** | $41.43 | |
| **Contribution Margin** | 72.7% | |

**Typical Customer Conclusion:** Healthy margin (72.7%) - sustainable

---

## 9. Heavy Customer Unit Economics

**Profile Definition:**
- 100 missed calls per month
- 2 minute average call duration
- 75 AI intake calls (2 minutes each)
- 150 SMS segments total
- 20 payment requests
- High storage

**Cost Breakdown:**

| Expense | Cost | Calculation |
|---------|------|-------------|
| **Revenue** | $59.00 | Subscription |
| **Stripe Processing** | -$2.01 | 2.9% of $59 + $0.30 |
| **Net Collected Revenue** | $56.99 | |
| **Twilio Phone Number** | -$1.15 | Per-customer fixed |
| **Twilio Voice** | -$2.60 | 200 minutes × $0.013 |
| **Twilio SMS** | -$1.19 | 150 segments × $0.0079 |
| **Twilio Recording** | -$18.00 | 200 minutes × 30 days × $0.003 |
| **OpenAI Realtime (input)** | -$18.00 | 75 calls × 60K tokens × $40/1M |
| **OpenAI Realtime (output)** | -$24.00 | 75 calls × 40K tokens × $80/1M |
| **OpenAI Whisper** | -$0.45 | 75 minutes × $0.006 |
| **Direct Usage Cost** | -$65.39 | |
| **Fixed Infrastructure Allocation** | -$2.28 | $57 ÷ 25 customers |
| **Annual Costs Allocation** | -$0.34 | $8.46 ÷ 25 customers |
| **Total Operating Cost** | -$69.16 | |
| **Contribution Profit** | -$12.17 | |
| **Contribution Margin** | -21.4% | |

**Heavy Customer Conclusion:** Negative margin (-21.4%) - unsustainable at $59

---

## 10. Extreme Customer Unit Economics

**Profile Definition:**
- 300 missed calls per month
- 3 minute average call duration
- 200 AI intake calls (3 minutes each)
- 500 SMS segments total
- 50 payment requests
- Very high storage

**Cost Breakdown:**

| Expense | Cost | Calculation |
|---------|------|-------------|
| **Revenue** | $59.00 | Subscription |
| **Stripe Processing** | -$2.01 | 2.9% of $59 + $0.30 |
| **Net Collected Revenue** | $56.99 | |
| **Twilio Phone Number** | -$1.15 | Per-customer fixed |
| **Twilio Voice** | -$11.70 | 900 minutes × $0.013 |
| **Twilio SMS** | -$3.95 | 500 segments × $0.0079 |
| **Twilio Recording** | -$81.00 | 900 minutes × 30 days × $0.003 |
| **OpenAI Realtime (input)** | -$72.00 | 200 calls × 90K tokens × $40/1M |
| **OpenAI Realtime (output)** | -$96.00 | 200 calls × 60K tokens × $80/1M |
| **OpenAI Whisper** | -$1.20 | 200 minutes × $0.006 |
| **Direct Usage Cost** | -$267.00 | |
| **Fixed Infrastructure Allocation** | -$2.28 | $57 ÷ 25 customers |
| **Annual Costs Allocation** | -$0.34 | $8.46 ÷ 25 customers |
| **Total Operating Cost** | -$270.77 | |
| **Contribution Profit** | -$213.78 | |
| **Contribution Margin** | -375.1% | |

**Extreme Customer Conclusion:** Severe negative margin (-375%) - catastrophic loss at $59

---

## 11. Customer Count Profitability Table (Typical Usage)

| Customers | Gross Revenue | Stripe Fees | Direct Usage | Fixed Infra | Annual Costs | Total Cost | Contribution Profit | Margin | Break-Even |
|-----------|--------------|-------------|--------------|-------------|--------------|------------|---------------------|--------|------------|
| 1 | $59 | $2.01 | $11.79 | $57.00 | $8.46 | $79.26 | -$20.26 | -34.3% | No |
| 5 | $295 | $10.05 | $58.95 | $57.00 | $8.46 | $134.46 | $150.49 | 51.0% | Yes |
| 10 | $590 | $20.10 | $117.90 | $57.00 | $8.46 | $203.46 | $366.44 | 62.1% | Yes |
| 25 | $1,475 | $50.25 | $294.75 | $57.00 | $8.46 | $410.46 | $1,014.29 | 68.7% | Yes |
| 50 | $2,950 | $100.50 | $589.50 | $57.00 | $8.46 | $755.46 | $2,094.04 | 71.0% | Yes |
| 75 | $4,425 | $150.75 | $884.25 | $57.00 | $8.46 | $1,100.46 | $3,173.79 | 71.7% | Yes |
| 100 | $5,900 | $201.00 | $1,179.00 | $57.00 | $8.46 | $1,445.46 | $4,253.54 | 72.0% | Yes |
| 125 | $7,375 | $251.25 | $1,473.75 | $57.00 | $8.46 | $1,790.46 | $5,333.29 | 72.3% | Yes |
| 150 | $8,850 | $301.50 | $1,768.50 | $57.00 | $8.46 | $2,135.46 | $6,413.04 | 72.5% | Yes |
| 250 | $14,750 | $502.50 | $2,947.50 | $57.00 | $8.46 | $3,515.46 | $10,732.04 | 72.7% | Yes |
| 500 | $29,500 | $1,005.00 | $5,895.00 | $57.00 | $8.46 | $6,965.46 | $21,529.54 | 73.0% | Yes |

**Break-even customer count:** 3 customers (typical usage)

**$4,000/month owner income target:** ~90 customers (typical usage)

---

## 12. AI Voice Cost Table

**Assumptions:**
- OpenAI Realtime API: gpt-realtime-2.1
- Input: 30K tokens/minute
- Output: 20K tokens/minute
- Pricing: $40/1M input tokens, $80/1M output tokens

| Call Duration | Input Tokens | Output Tokens | Input Cost | Output Cost | Total Cost |
|--------------|--------------|---------------|------------|-------------|------------|
| 1 minute | 30K | 20K | $1.20 | $1.60 | $2.80 |
| 2 minutes | 60K | 40K | $2.40 | $3.20 | $5.60 |
| 3 minutes | 90K | 60K | $3.60 | $4.80 | $8.40 |
| 5 minutes | 150K | 100K | $6.00 | $8.00 | $14.00 |
| 10 minutes | 300K | 200K | $12.00 | $16.00 | $28.00 |

**Monthly AI Voice Cost by Call Volume:**

| Calls/Month | Avg Duration | Total Minutes | Monthly Cost |
|-------------|--------------|---------------|--------------|
| 10 | 1 min | 10 | $28.00 |
| 25 | 1 min | 25 | $70.00 |
| 50 | 1 min | 50 | $140.00 |
| 100 | 1 min | 100 | $280.00 |
| 250 | 1 min | 250 | $700.00 |
| 500 | 1 min | 500 | $1,400.00 |

**Cost Risk:** AI voice is the single largest variable cost driver. Heavy usage can quickly exceed $59 subscription revenue.

---

## 13. SMS Cost Table

**Assumptions:**
- Twilio SMS: $0.0079/segment (US)
- Typical message: 1-2 segments
- URLs increase segment count

| Message Type | Segments/Month | Cost/Month |
|--------------|----------------|------------|
| Intake completion | 1 | $0.01 |
| Follow-up messages | 10 | $0.08 |
| Customer replies | 20 | $0.16 |
| Payment requests | 5 | $0.04 |
| Appointment messages | 5 | $0.04 |
| Voicemail notifications | 5 | $0.04 |
| **Total (Typical)** | **46** | **$0.36** |

**SMS Cost by Customer Profile:**

| Profile | Segments/Month | Cost/Month |
|---------|----------------|------------|
| Light | 20 | $0.16 |
| Typical | 50 | $0.40 |
| Heavy | 150 | $1.19 |
| Extreme | 500 | $3.95 |

**Cost Risk:** SMS is relatively low cost but can accumulate with high volume.

---

## 14. Storage Growth Estimate

**Assumptions:**
- Twilio recording: $0.003/minute stored
- Supabase storage: $0.021/GB/month
- Average recording: 1 minute = ~1MB
- 30 recordings/day = 30MB/day = 900MB/month

| Customers | Recordings/Day | Storage/Month | Twilio Cost | Supabase Cost | Total Cost |
|-----------|----------------|---------------|-------------|---------------|------------|
| 100 | 3,000 | 90GB | $27.00 | $1.89 | $28.89 |
| 500 | 15,000 | 450GB | $135.00 | $9.45 | $144.45 |
| 1,000 | 30,000 | 900GB | $270.00 | $18.90 | $288.90 |

**Storage Risk:** Recording storage grows linearly with usage and can become significant at scale. No automatic retention policy was found in the codebase.

---

## 15. Phone Number Inventory Waste Analysis

**Current Configuration:**
- MIN_AVAILABLE_WARM_NUMBERS: 3 (from WARM_INVENTORY_TARGET env var)
- Cost per US local number: $1.15/month
- Warm buffer cost: $3.45/month

**Potential Waste Scenarios:**

| Scenario | Numbers | Monthly Cost | Risk Level |
|----------|----------|--------------|------------|
| Current buffer | 3 | $3.45 | Low |
| Historical inventory (80 numbers) | 80 | $92.00 | High |
| Failed/quarantined numbers | Unknown | Unknown | Unknown |
| Unassigned warm numbers | 3 | $3.45 | Low |

**Recommendation:** The current 3-number warm buffer is reasonable. Historical inventory of 80 numbers would have cost $92/month if all were active. Audit actual Twilio number count and status.

---

## 16. Maintenance Hours Estimate

### Weekly Tasks (Stable Month)

| Task | Hours/Week | Hours/Month |
|------|------------|-------------|
| Error review (Sentry) | 1 | 4 |
| Failed webhook review | 0.5 | 2 |
| Payment reconciliation | 0.5 | 2 |
| Twilio delivery failures | 0.5 | 2 |
| AI intake failure review | 0.5 | 2 |
| Uptime checks | 0.5 | 2 |
| Support tickets | 2 | 8 |
| Number inventory checks | 0.5 | 2 |
| **Weekly Subtotal** | **6** | **24** |

### Monthly Tasks

| Task | Hours/Month |
|------|-------------|
| Dependency updates | 2 |
| Mobile build testing | 4 |
| iOS/Android compatibility | 2 |
| Billing reconciliation | 2 |
| Database health check | 1 |
| Storage cleanup | 2 |
| Security review | 1 |
| OAuth/API health | 1 |
| Backup verification | 1 |
| **Monthly Subtotal** | **16** |

### Quarterly Tasks

| Task | Hours/Quarter | Hours/Month |
|------|---------------|-------------|
| Major dependency upgrades | 4 | 1.33 |
| Stripe Terminal SDK checks | 2 | 0.67 |
| Capacitor upgrades | 2 | 0.67 |
| Android target SDK requirements | 2 | 0.67 |
| iOS/Xcode requirements | 2 | 0.67 |
| Privacy policy review | 1 | 0.33 |
| App store compliance | 2 | 0.67 |
| Disaster recovery exercise | 2 | 0.67 |
| **Quarterly Subtotal** | **17** | **5.67** |

### Annual Tasks

| Task | Hours/Year | Hours/Month |
|------|------------|-------------|
| Apple renewal | 1 | 0.08 |
| Domain renewal | 0.5 | 0.04 |
| Google/Apple review changes | 2 | 0.17 |
| Tax and business filings | 4 | 0.33 |
| Security and data retention review | 4 | 0.33 |
| **Annual Subtotal** | **11.5** | **0.96** |

### Total Maintenance Hours

| Scenario | Hours/Month |
|----------|-------------|
| Stable month | 45.63 |
| Normal month | 50-60 |
| Incident-heavy month | 80-100 |

**Note:** This is founder engineering time only. Customer support time is additional and scales with customer count.

---

## 17. Cost-Spike Risks

| Risk | Subsystem | Potential Impact | Current Safeguard | Missing Safeguard | Severity | Recommended Action |
|------|-----------|-----------------|------------------|------------------|----------|-------------------|
| Unbounded AI voice calls | OpenAI Realtime | $28/minute | Session timeout | None | High | Implement per-call time limit |
| Duplicate SMS sends | Twilio SMS | $0.0079/segment | None | Idempotency keys | Medium | Add duplicate detection |
| Orphaned phone numbers | Twilio | $1.15/month each | Warm number manager | Automated cleanup | Medium | Implement number lifecycle audit |
| Unlimited recording storage | Twilio/Supabase | $0.003/minute | None | Retention policy | High | Implement automatic deletion |
| OpenAI fallback loops | OpenAI Realtime | 2x cost | Fallback state tracking | Per-call limit | Medium | Add fallback attempt limit |
| Failed payment retries | Stripe | Multiple processing fees | None | Retry limit | Low | Already limited by Stripe |
| Stuck Fly.io instances | Fly.io | $5-15/month | Health checks | Auto-stop | Low | Monitor instance status |
| Vercel function loops | Vercel | Execution overages | Timeout | None | Medium | Add function timeout guards |
| Duplicate webhook processing | Twilio/Stripe | Multiple processing | Idempotency | None | Medium | Implement idempotency keys |
| Excessive logging | Sentry/Vercel | Storage costs | None | Log rotation | Low | Implement log retention policy |

---

## 18. Break-Even Customer Count

**Assumptions:**
- Fixed infrastructure: $57/month
- Annual costs: $8.46/month
- Typical customer usage: $11.79/month direct costs
- Per-customer fixed: $1.15/month
- Stripe processing: $2.01/subscription

**Break-Even Calculation:**

```
Fixed Costs = $57 + $8.46 = $65.46/month
Contribution per Customer = $59 - $2.01 - $1.15 - $11.79 = $44.05
Break-Even Customers = $65.46 / $44.05 = 1.49 ≈ 2 customers
```

**Break-Even by Usage Profile:**

| Profile | Contribution per Customer | Break-Even Customers |
|---------|--------------------------|---------------------|
| Light | $48.02 | 2 |
| Typical | $44.05 | 2 |
| Heavy | -$12.17 | Never (negative margin) |
| Extreme | -$213.78 | Never (negative margin) |

**$4,000/month Owner Income Target:**

| Profile | Customers Needed |
|---------|------------------|
| Light | 83 |
| Typical | 91 |
| Heavy | Never profitable |

---

## 19. Estimated Margin from $59 Subscription

**Typical Customer (72.7% margin):**

| Component | Amount | Percentage |
|-----------|--------|------------|
| Revenue | $59.00 | 100% |
| Stripe processing | -$2.01 | -3.4% |
| Direct usage costs | -$11.79 | -20.0% |
| Fixed infrastructure allocation | -$2.28 | -3.9% |
| Annual costs allocation | -$0.34 | -0.6% |
| **Contribution profit** | **$41.43** | **70.2%** |

**Light Customer (84.3% margin):**

| Component | Amount | Percentage |
|-----------|--------|------------|
| Revenue | $59.00 | 100% |
| Stripe processing | -$2.01 | -3.4% |
| Direct usage costs | -$5.20 | -8.8% |
| Fixed infrastructure allocation | -$2.28 | -3.9% |
| Annual costs allocation | -$0.34 | -0.6% |
| **Contribution profit** | **$48.02** | **81.4%** |

**Heavy Customer (-21.4% margin):**

| Component | Amount | Percentage |
|-----------|--------|------------|
| Revenue | $59.00 | 100% |
| Stripe processing | -$2.01 | -3.4% |
| Direct usage costs | -$65.39 | -110.8% |
| Fixed infrastructure allocation | -$2.28 | -3.9% |
| Annual costs allocation | -$0.34 | -0.6% |
| **Contribution profit** | **-$12.17** | **-20.6%** |

---

## 20. Comparison with $65 and $69 Pricing

**Typical Customer at Different Price Points:**

| Price | Revenue | Stripe Fees | Direct Costs | Fixed Allocation | Contribution Profit | Margin |
|-------|---------|-------------|--------------|-----------------|---------------------|--------|
| $59 | $59.00 | $2.01 | $11.79 | $2.62 | $42.58 | 72.2% |
| $65 | $65.00 | $2.19 | $11.79 | $2.62 | $48.40 | 74.5% |
| $69 | $69.00 | $2.30 | $11.79 | $2.62 | $52.29 | 75.8% |

**Heavy Customer at Different Price Points:**

| Price | Revenue | Stripe Fees | Direct Costs | Fixed Allocation | Contribution Profit | Margin |
|-------|---------|-------------|--------------|-----------------|---------------------|--------|
| $59 | $59.00 | $2.01 | $65.39 | $2.62 | -$11.02 | -18.7% |
| $65 | $65.00 | $2.19 | $65.39 | $2.62 | -$5.20 | -8.0% |
| $69 | $69.00 | $2.30 | $65.39 | $2.62 | -$1.31 | -1.9% |

**Conclusion:** Even at $69, heavy customers still have negative margin. Price increases alone cannot solve heavy-usage losses. Usage-based pricing or fair-use limits are required for heavy customers.

---

## 21. Data and Invoices Still Needed from Ryan

### Twilio
- [ ] Most recent 30-day invoice
- [ ] Phone number inventory count and status
- [ ] Recording storage volume
- [ ] Voice minutes breakdown (inbound/outbound)
- [ ] SMS segment count
- [ ] MMS count
- [ ] Regulatory fees
- [ ] Taxes

### OpenAI
- [ ] Most recent 30-day invoice
- [ ] Realtime API usage (input/output tokens)
- [ ] Whisper usage (minutes)
- [ ] Text model usage (tokens by model)
- [ ] Failed/retried sessions

### Vercel
- [ ] Current plan tier
- [ ] Most recent invoice
- [ ] Function execution time
- [ ] Bandwidth usage
- [ ] Edge requests
- [ ] Overages

### Supabase
- [ ] Current plan tier
- [ ] Most recent invoice
- [ ] Database size
- [ ] Storage volume
- [ ] Bandwidth usage
- [ ] Realtime messages
- [ ] Monthly active users

### Fly.io
- [ ] Most recent invoice
- [ ] VM costs
- [ ] Memory/CPU usage
- [ ] Bandwidth
- [ ] Persistent volumes
- [ ] IPv4 costs
- [ ] Stopped vs running machines

### Stripe
- [ ] Subscription transaction volume
- [ ] Terminal/Tap to Pay transaction volume
- [ ] Refunds
- [ ] Disputes
- [ ] Failed payments
- [ ] Stripe Tax fees (if enabled)

### Sentry
- [ ] Current plan tier
- [ ] Most recent invoice
- [ ] Event volume
- [ ] Error volume

### Other
- [ ] Business email provider invoice
- [ ] Domain registrar invoice
- [ ] Cloud Mac server invoice (if applicable)
- [ ] Apple Developer Program receipt
- [ ] Google Play Console fees

---

## 22. Recommended Cost-Monitoring Dashboard Metrics

### Real-Time Alerts
- [ ] Daily AI voice cost per customer
- [ ] Daily SMS cost per customer
- [ ] Daily recording storage growth
- [ ] OpenAI API error rate
- [ ] Twilio delivery failure rate

### Weekly Reports
- [ ] Top 10 customers by usage
- [ ] Customers exceeding usage thresholds
- [ ] Phone number inventory status
- [ ] Storage utilization
- [ ] API error rates by service

### Monthly Reports
- [ ] Total cost per customer
- [ ] Contribution margin by customer
- [ ] Fixed vs variable cost breakdown
- [ ] Usage trends by service
- [ ] Customer churn vs usage correlation

### Quarterly Reviews
- [ ] Unit economics trends
- [ ] Pricing sustainability analysis
- [ ] Infrastructure optimization opportunities
- [ ] Cost-spike incident review

---

## 23. Potential Fair-Use Controls

**Recommended if heavy customers consistently erode margins:**

| Control | Threshold | Action | Priority |
|---------|-----------|--------|----------|
| AI voice minutes | 100 minutes/month | Soft warning | Medium |
| AI voice minutes | 200 minutes/month | Hard limit or overage charge | High |
| SMS segments | 200 segments/month | Soft warning | Low |
| SMS segments | 500 segments/month | Hard limit or overage charge | Medium |
| Recording storage | 10GB/customer | Auto-delete oldest | High |
| Total monthly cost | $100 | Soft warning | High |
| Total monthly cost | $150 | Hard limit or upgrade required | High |

**Alternative: Usage-Based Pricing Tiers**

| Tier | Price | Included AI Minutes | Included SMS | Overage |
|------|-------|---------------------|--------------|---------|
| Starter | $59 | 50 minutes | 100 segments | $0.50/min, $0.01/segment |
| Professional | $99 | 150 minutes | 300 segments | $0.40/min, $0.01/segment |
| Business | $149 | 300 minutes | 500 segments | $0.30/min, $0.01/segment |

---

## 24. Conclusion on $59 Sustainability

### Is $59/month sustainable?

**For light and typical customers:** YES
- Light customers: 84.3% margin
- Typical customers: 72.7% margin
- Break-even at 2 customers
- $4,000/month income at ~90 customers

**For heavy customers:** NO
- Heavy customers: -21.4% margin
- Extreme customers: -375% margin
- Even $69 pricing doesn't fix heavy customer losses
- Heavy customers will always be unprofitable at flat pricing

### Key Risk Factors

1. **AI voice cost volatility:** $28/minute can quickly exceed $59 revenue
2. **Recording storage accumulation:** No automatic retention policy found
3. **Phone number inventory:** Historical 80-number inventory would cost $92/month
4. **Scale economics:** Fixed costs are low, but variable costs scale linearly

### Recommendations

1. **Launch at $59** - Sustainable for target typical usage
2. **Implement usage monitoring immediately** - Track AI voice minutes, SMS, storage per customer
3. **Set fair-use limits** - 100-200 AI minutes/month, auto-delete recordings after 30 days
4. **Monitor heavy customers** - Identify and address usage patterns early
5. **Consider usage-based tiers** - If heavy customers become common, introduce tiered pricing
6. **Audit phone number inventory** - Ensure only 3 warm numbers are maintained
7. **Implement recording retention policy** - Automatic deletion after 30-90 days

### Final Verdict

**$59/month is sustainable for ReplyFlow's target customer profile with the following conditions:**

- Typical usage (25 AI calls/month, 50 SMS segments)
- Usage monitoring and fair-use limits implemented
- Recording retention policy enforced
- Phone number inventory kept to minimum (3 warm numbers)
- Heavy customers identified and managed (limits or tiered pricing)

**Without these conditions, heavy customers could create significant losses that undermine overall profitability.**

---

**Audit Status:** Complete (codebase analysis)  
**Next Steps:** Ryan to provide billing data for verification  
**Confidence Level:** High for service inventory, Medium for cost estimates (requires billing verification)
