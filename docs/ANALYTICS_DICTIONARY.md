# ReplyFlow Analytics Dictionary

Last updated: 2026-07-09

This document is the single source of truth for ReplyFlow metrics, KPIs, counters, charts, percentages, trends, summaries, and analytics terminology. It documents current implementation behavior only. It does not define new product behavior.

## Scope

Analytics surfaces represented here include:

- Dashboard
- Analytics page
- ReplyFlow Performance card
- Dashboard Metrics cards
- Business Snapshot
- Business Wins / Achievements
- Lead Engagement / Customer Responses
- Follow-Up Activity
- Needs Attention
- Activity Timeline / Recent Activity
- Recent Leads
- Leads page summaries
- Payments page and payments API stats
- Calendar / Jobs schedule surfaces
- Operational Status
- AI Call Summary
- Settings / Billing summaries where numeric/status summaries are displayed

## Confidence scale

- High: Calculation is direct, guarded against empty data, and matches visible label.
- Medium: Calculation is safe but has naming, time-window, or source-of-truth ambiguity.
- Low: Calculation is incomplete, misleading, or known to have implementation drift.

---

# Glossary

## Lead

A customer opportunity stored in the `leads` table. In many ReplyFlow surfaces, a lead represents a captured missed call or customer inquiry. A lead may have messages, conversations, voicemail recordings, AI call records, jobs, and payment requests attached.

## Recovered Lead

Current canonical analytics meaning: a unique lead with at least one inbound customer message in the relevant time window. Some UI copy also uses "recovered" to mean captured lead or missed call, which is inconsistent and documented below.

## Ignored Lead

A lead or caller excluded from normal follow-up or capture workflows, usually through ignored contact settings or a lead status such as `ignored`. Some analytics surfaces do not explicitly exclude ignored leads unless noted.

## Conversation

A row in `conversations`, typically linked to a business and possibly a lead. Conversation counts are not the same as inbound replies.

## Customer Reply

An inbound message from a customer. Current calculations usually count messages where `direction` is `inbound` or where `to_phone` matches the ReplyFlow/Twilio number.

## AI Call

A row in `ai_call_records`, representing an AI voice intake attempt or fallback. Outcomes include completed intake, partial intake, caller hangup, no speech, AI failure, and voicemail fallback variants.

## Missed Call

Ambiguous in current implementation. Some surfaces count `leads` as missed calls captured. Other surfaces count actual `call_events`. Use metric-specific definitions below.

## Voicemail

A voicemail should ideally mean a row in `voicemail_recordings`. Current Analytics page uses `ai_call_records.outcome === 'no_speech'` for "Voicemails Captured", which is not equivalent.

## Job

A row in `jobs`, representing scheduled or completed service work. Jobs may be manually created, created from leads, or synced to Google Calendar.

## Appointment

A Google Calendar event or scheduled job/event shown on the Calendar page. Calendar events are external Google Calendar objects; jobs are internal rows in `jobs`.

## Payment Request

A row in `payment_requests`, representing a payment link/request sent to a customer through Stripe, Venmo, or PayPal.

## Completed Payment

A payment request with `status === 'paid'`.

## Pending Payment

A payment request with `status === 'pending'`. Some calculations exclude expired pending requests while others count all pending rows.

## Follow-up

A row in `follow_up_jobs`, representing an automated follow-up job. Status values include pending, scheduled, in progress, sent, failed, and cancelled.

## Business Hours

Business-level configured availability settings stored on `businesses`, used for operational behavior and settings summaries.

## Out of Office

Business-level temporary status stored on `businesses`, displayed as a dashboard attention/status item when active.

---

# Metric Dictionary

## 1. Recovery Rate

- Purpose: Answers "What percentage of captured leads replied to ReplyFlow?"
- Where It Appears: Dashboard Metrics, Analytics page.
- Definition: Unique leads with at least one inbound customer message divided by total leads in the same rolling 30-day window.
- Counts: Leads with one or more inbound messages where `message.lead_id` is present.
- Does Not Count: Multiple replies from the same lead as multiple recovered leads; leads outside the window; messages not tied to lead IDs.
- Database Tables Used: `leads`, `messages`.
- Query / Calculation: Fetch leads for business with `created_at >= now - 30 days`; fetch messages for those lead IDs with `created_at >= now - 30 days`; filter inbound; build unique lead ID set; divide by lead count; clamp 0-100 and round.
- Time Window: Rolling 30 days.
- Update Triggers: Lead created, inbound SMS received, message lead association changed, lead deleted.
- Edge Cases: If zero leads, rate is 0. Duplicate replies do not inflate numerator. Late-arriving messages outside 30 days are excluded. Uses browser/client time.
- Confidence: High.

## 2. Missed Calls Captured

- Purpose: Answers "How many missed-call opportunities did ReplyFlow capture?"
- Where It Appears: Dashboard Metrics, ReplyFlow Performance, Analytics Lead Recovery Overview.
- Definition: In these surfaces, current implementation counts rows in `leads` for the business in the time window.
- Counts: Leads created in the window.
- Does Not Count: Actual `call_events` that did not create leads; ignored or demo leads are not consistently excluded.
- Database Tables Used: `leads`.
- Query / Calculation: Count business leads with `created_at >= now - 30 days`.
- Time Window: Rolling 30 days.
- Update Triggers: Lead created, lead deleted, lead business assignment changed.
- Edge Cases: If `call_events` and `leads` diverge, this metric does not reflect actual call volume. Browser/client time is used.
- Confidence: Medium.

## 3. Missed Calls

- Purpose: Answers "How many missed calls were handled or observed?"
- Where It Appears: Business Snapshot, StatsCards, Recent Leads Section.
- Definition: In Business Snapshot, counts `call_events`. In StatsCards, counts `leads`. In Recent Leads Section, counts `call_events` all time.
- Counts: Depends on surface.
- Does Not Count: Depends on surface; this is not canonicalized.
- Database Tables Used: `call_events` or `leads`.
- Query / Calculation: Business Snapshot uses count from `call_events` over rolling 30 days. StatsCards uses count from `leads` in current month. Recent Leads Section loads all `call_events` for business.
- Time Window: Rolling 30 days, current month, or all time depending on surface.
- Update Triggers: Call event created, lead created, lead deleted.
- Edge Cases: This is the largest naming inconsistency in analytics.
- Confidence: Medium.

## 4. Leads Created

- Purpose: Answers "How many lead records were created?"
- Where It Appears: Analytics page.
- Definition: Count of `leads` rows for the business in the rolling 30-day window.
- Counts: All business leads in the window.
- Does Not Count: Leads outside the window. Demo/ignored/deleted leads are not explicitly excluded unless database filtering or deletion removes them.
- Database Tables Used: `leads`.
- Query / Calculation: Fetch leads where `business_id` matches and `created_at >= now - 30 days`; count rows.
- Time Window: Rolling 30 days.
- Update Triggers: Lead created, lead deleted, business association changed.
- Edge Cases: Ignored leads may still count if present.
- Confidence: High.

## 5. Total Leads

- Purpose: Answers "How many leads exist in this context?"
- Where It Appears: Business Snapshot, Lead Engagement Card, Operational metrics hook.
- Definition: Count of `leads`; time window varies by surface.
- Counts: Lead rows for business.
- Does Not Count: Deleted rows. Ignored/demo leads may or may not be excluded depending on surface.
- Database Tables Used: `leads`.
- Query / Calculation: Business Snapshot uses rolling 30 days. Lead Engagement uses all time. Operational metrics uses all time.
- Time Window: Rolling 30 days or all time depending on surface.
- Update Triggers: Lead created, lead deleted, lead restored if represented as a row/status update.
- Edge Cases: Label can imply all time while calculation may be rolling 30 days.
- Confidence: Medium.

## 6. Active Leads

- Purpose: Answers "How many leads are still open or active?"
- Where It Appears: Analytics page, ReplyFlow Performance.
- Definition: Count of leads where `status` is `active` or `new` in the relevant 30-day lead set.
- Counts: `status === 'active'` or `status === 'new'`.
- Does Not Count: Completed, won, ignored, deleted, or other statuses.
- Database Tables Used: `leads`.
- Query / Calculation: Fetch business leads in rolling 30 days; filter by status.
- Time Window: Rolling 30 days.
- Update Triggers: Lead created, lead status updated, lead deleted.
- Edge Cases: Unknown/custom statuses are excluded.
- Confidence: High.

## 7. Completed Leads

- Purpose: Answers "How many leads reached a completed/won state?"
- Where It Appears: Analytics page.
- Definition: Count of leads where `status` is `completed` or `won`.
- Counts: `completed`, `won`.
- Does Not Count: Active, new, ignored, deleted, scheduled unless also completed/won.
- Database Tables Used: `leads`.
- Query / Calculation: Fetch business leads in rolling 30 days; filter by status.
- Time Window: Rolling 30 days.
- Update Triggers: Lead status updated, lead created, lead deleted.
- Edge Cases: If completed status is stored differently, it will not count.
- Confidence: High.

## 8. Ignored Leads / Ignored Contacts Count

- Purpose: Answers "How many callers or leads are being ignored/excluded?"
- Where It Appears: Leads page state and settings/contact management summaries.
- Definition: Count source depends on page implementation; ignored contacts are distinct from ignored lead status.
- Counts: Ignored contacts or leads marked ignored depending on surface.
- Does Not Count: Non-ignored leads.
- Database Tables Used: Likely `ignored_contacts`, `leads`.
- Query / Calculation: The leads page tracks `ignoredContactsCount`; implementation should be treated as contact-list based unless further page-specific query says otherwise.
- Time Window: Current state / all time.
- Update Triggers: Contact ignored, ignored contact removed, lead ignored/restored.
- Edge Cases: Ignored contacts and ignored leads are different concepts and should not be mixed.
- Confidence: Medium.

## 9. Messages Sent

- Purpose: Answers "How many outbound texts did ReplyFlow/business send?"
- Where It Appears: Dashboard Metrics, Analytics page, Operational metrics.
- Definition: Count outbound messages associated with business leads or business Twilio phone.
- Counts: Messages with `direction === 'outbound'` or direction starting with outbound; in some surfaces also messages where `from_phone` equals business Twilio number.
- Does Not Count: Inbound customer replies; messages outside time window.
- Database Tables Used: `messages`, often via `leads`.
- Query / Calculation: Fetch business leads; fetch messages by lead IDs; filter outbound and/or from business phone.
- Time Window: Rolling 30 days for Dashboard/Analytics; all time for Operational metrics.
- Update Triggers: SMS sent, message status record inserted, message deleted.
- Edge Cases: Duplicate retries may count as multiple messages if represented by multiple rows. Failed outbound messages may count unless filtered elsewhere.
- Confidence: High.

## 10. Total SMS Sent

- Purpose: Answers "How many SMS messages has this business sent all time?"
- Where It Appears: Operational metrics hook.
- Definition: Count of all messages nested under business leads where `direction === 'outbound'`.
- Counts: Outbound messages.
- Does Not Count: Inbound messages; messages not linked to leads.
- Database Tables Used: `leads`, `messages`.
- Query / Calculation: Query leads with nested messages; flatten messages; filter outbound.
- Time Window: All time.
- Update Triggers: Message inserted/deleted; lead-message association changed.
- Edge Cases: Messages not linked to leads are excluded.
- Confidence: Medium.

## 11. Customer Replies

- Purpose: Answers "How many inbound customer responses were received?"
- Where It Appears: Dashboard Metrics, ReplyFlow Performance, Business Snapshot, Analytics page.
- Definition: Count of inbound messages in the relevant dataset.
- Counts: Messages where `direction` is inbound or starts inbound; in some surfaces messages where `to_phone` equals business Twilio number.
- Does Not Count: Outbound messages; replies outside time window.
- Database Tables Used: `messages`, often via `leads`.
- Query / Calculation: Fetch messages scoped by lead IDs or business phone; filter inbound.
- Time Window: Rolling 30 days for most dashboard/analytics surfaces; all time in some hooks.
- Update Triggers: Inbound SMS received, message deleted, lead association changed.
- Edge Cases: If messages lack lead IDs but match phone number, some surfaces count them and others may not.
- Confidence: High.

## 12. Total Replies Received

- Purpose: Answers "How many inbound replies has this business received all time?"
- Where It Appears: Operational metrics hook.
- Definition: Count of nested lead messages where `direction === 'inbound'`.
- Counts: Inbound messages linked to business leads.
- Does Not Count: Messages not linked through leads.
- Database Tables Used: `leads`, `messages`.
- Query / Calculation: Query leads with nested messages; flatten; filter inbound.
- Time Window: All time.
- Update Triggers: Inbound message inserted/deleted.
- Edge Cases: Phone-number-only messages may be excluded.
- Confidence: Medium.

## 13. Customer Response / Replied Leads

- Purpose: Answers "How many unique leads have replied?"
- Where It Appears: Lead Engagement Card.
- Definition: Unique lead IDs from inbound messages among all leads.
- Counts: A lead once if it has at least one inbound message.
- Does Not Count: Multiple replies from the same lead as multiple replied leads.
- Database Tables Used: `leads`, `messages`.
- Query / Calculation: Fetch all leads; fetch messages for those lead IDs; filter inbound; unique lead IDs.
- Time Window: Current implementation is all time, despite UI copy saying Last 30 days.
- Update Triggers: Inbound SMS received, lead created/deleted.
- Edge Cases: Current UI label mismatch.
- Confidence: Medium.

## 14. Engagement Rate

- Purpose: Answers "What percent of leads responded?"
- Where It Appears: Lead Engagement Card.
- Definition: Unique replied leads divided by total leads.
- Counts: All-time leads and all-time replied leads in current implementation.
- Does Not Count: Multiple replies per lead as separate numerator events.
- Database Tables Used: `leads`, `messages`.
- Query / Calculation: `round(repliedLeads / totalLeads * 100)`, or 0 if no leads.
- Time Window: All time in calculation; UI says Last 30 days.
- Update Triggers: Lead created, inbound message created, lead deleted.
- Edge Cases: Label/window inconsistency.
- Confidence: Medium.

## 15. Recent Replies

- Purpose: Answers "How many customer replies happened recently?"
- Where It Appears: Lead Engagement Card.
- Definition: Count of inbound reply messages from the already-fetched replies whose `created_at` is in the last 7 days.
- Counts: Inbound messages in last 7 days.
- Does Not Count: Outbound messages; replies older than 7 days.
- Database Tables Used: `messages`.
- Query / Calculation: Filter inbound messages by `created_at >= now - 7 days`.
- Time Window: Rolling 7 days.
- Update Triggers: Inbound SMS received/deleted.
- Edge Cases: Uses client time.
- Confidence: High.

## 16. Total Conversations

- Purpose: Answers "How many conversation records exist for recent activity?"
- Where It Appears: Analytics page.
- Definition: Count of `conversations` rows for the business created in the rolling 30-day window.
- Counts: Conversation rows.
- Does Not Count: Messages without a conversation row; conversations outside window.
- Database Tables Used: `conversations`.
- Query / Calculation: Fetch conversations by `business_id` and `created_at >= now - 30 days`; count rows.
- Time Window: Rolling 30 days.
- Update Triggers: Conversation created/deleted.
- Edge Cases: Conversation created before window but active within window is excluded.
- Confidence: High.

## 17. Customer Reply Rate

- Purpose: Answers "What share of recent messages are inbound customer replies?"
- Where It Appears: Analytics page.
- Definition: Inbound messages divided by total messages in the rolling 30-day message set.
- Counts: Inbound messages as numerator; all messages as denominator.
- Does Not Count: Lead-level response rate.
- Database Tables Used: `messages`, `leads`.
- Query / Calculation: Fetch messages for leads in last 30 days and messages created in last 30 days; divide inbound count by total message count.
- Time Window: Rolling 30 days.
- Update Triggers: Message inserted/deleted.
- Edge Cases: Label may be interpreted as lead-level reply rate, but it is message-level.
- Confidence: Medium.

## 18. Average Messages per Conversation

- Purpose: Answers "How much message activity exists per conversation?"
- Where It Appears: Analytics page.
- Definition: Total messages divided by total conversations in the rolling 30-day window.
- Counts: All messages fetched for recent leads; recent conversations.
- Does Not Count: Messages outside window.
- Database Tables Used: `messages`, `conversations`, `leads`.
- Query / Calculation: `totalMessages / totalConversations`, or 0 if no conversations; displayed rounded to one decimal.
- Time Window: Rolling 30 days.
- Update Triggers: Message created/deleted, conversation created/deleted.
- Edge Cases: Messages and conversations are independently windowed; denominator may omit older active conversations.
- Confidence: Medium.

## 19. Lead Activity Trend

- Purpose: Shows daily lead creation trend.
- Where It Appears: Analytics page chart.
- Definition: Count of leads per local display date for the last 7 displayed dates.
- Counts: Leads created on each displayed day.
- Does Not Count: Leads older than rolling 7-day cutoff.
- Database Tables Used: `leads`.
- Query / Calculation: Initialize 7 local date labels; loop through recent leads; increment bucket by `toLocaleDateString` label.
- Time Window: Rolling 7 days, displayed as local calendar labels.
- Update Triggers: Lead created/deleted.
- Edge Cases: DST and timezone can shift buckets; uses browser locale labels rather than business timezone.
- Confidence: Medium.

## 20. Customer Reply Trend

- Purpose: Shows daily inbound customer reply trend.
- Where It Appears: Analytics page chart.
- Definition: Count of inbound messages per local display date for the last 7 displayed dates.
- Counts: Inbound customer messages.
- Does Not Count: Outbound messages.
- Database Tables Used: `messages`, `leads`.
- Query / Calculation: Initialize 7 local date labels; loop messages; filter inbound; increment bucket by local date label.
- Time Window: Rolling 7 days.
- Update Triggers: Inbound SMS received/deleted.
- Edge Cases: Timezone/DST bucket drift possible.
- Confidence: Medium.

## 21. AI Intakes Completed

- Purpose: Answers "How many AI calls completed intake successfully?"
- Where It Appears: Analytics page.
- Definition: Count of AI call records with `outcome === 'completed_intake'` or `outcome === 'completed'`.
- Counts: Completed AI intake records.
- Does Not Count: Partial, incomplete, no speech, failed, voicemail fallback unless marked completed.
- Database Tables Used: `ai_call_records`.
- Query / Calculation: Fetch AI calls by business in rolling 30 days; filter outcome.
- Time Window: Rolling 30 days.
- Update Triggers: AI call completed, AI outcome updated, record deleted.
- Edge Cases: Outcome naming variants are partially supported.
- Confidence: High.

## 22. AI Intakes Incomplete

- Purpose: Answers "How many AI intakes did not fully complete but captured partial/incomplete state?"
- Where It Appears: Analytics page.
- Definition: Count of AI call records with `outcome === 'partial_intake'` or `outcome === 'incomplete'`.
- Counts: Partial/incomplete records.
- Does Not Count: Early hangups, no speech, AI failures unless outcome is one of the above.
- Database Tables Used: `ai_call_records`.
- Query / Calculation: Fetch AI calls in rolling 30 days; filter outcome.
- Time Window: Rolling 30 days.
- Update Triggers: AI call completed/updated/deleted.
- Edge Cases: Some failure outcomes are not counted as incomplete.
- Confidence: Medium.

## 23. AI Completion Rate

- Purpose: Answers "What percentage of AI calls complete intake?"
- Where It Appears: Analytics page.
- Definition: Completed AI intakes divided by total AI call records.
- Counts: Completed outcomes as numerator; all AI call records as denominator.
- Does Not Count: No denominator if no AI calls; returns 0.
- Database Tables Used: `ai_call_records`.
- Query / Calculation: `(completed / totalAiCalls) * 100`, displayed to one decimal.
- Time Window: Rolling 30 days.
- Update Triggers: AI call created, AI outcome updated, AI call deleted.
- Edge Cases: All failures reduce completion rate.
- Confidence: High.

## 24. Voicemails Captured

- Purpose: Intended to answer "How many voicemails were captured?"
- Where It Appears: Analytics page, Recent Activity timeline.
- Definition: Analytics page currently counts AI calls with `outcome === 'no_speech'`; Recent Activity uses `voicemail_recordings` through leads.
- Counts: Depends on surface.
- Does Not Count: Analytics page does not count actual `voicemail_recordings` rows.
- Database Tables Used: `ai_call_records`, `voicemail_recordings`, `leads`.
- Query / Calculation: Analytics filters AI call outcomes. Recent Activity flattens `voicemail_recordings` from recent leads.
- Time Window: Rolling 30 days for Analytics; rolling 7 days in Recent Activity.
- Update Triggers: Voicemail created, AI call outcome set to no speech.
- Edge Cases: This is inconsistent; no-speech is not necessarily voicemail.
- Confidence: Low.

## 25. Follow-Ups Sent

- Purpose: Answers "How many follow-up messages/jobs were sent?"
- Where It Appears: Dashboard Metrics, ReplyFlow Performance, Analytics page.
- Definition: Count of `follow_up_jobs` where `status === 'sent'`.
- Counts: Sent follow-up jobs.
- Does Not Count: Pending, scheduled, in-progress, failed, cancelled.
- Database Tables Used: `follow_up_jobs`.
- Query / Calculation: Fetch jobs by business and time window; filter status sent.
- Time Window: Rolling 30 days for Dashboard/Analytics; current week in FollowUpActivityCard.
- Update Triggers: Follow-up job created, status updated to sent, job deleted.
- Edge Cases: Some surfaces use `created_at` as send-window proxy.
- Confidence: High.

## 26. Follow-Ups Canceled

- Purpose: Answers "How many follow-up jobs were cancelled because a customer replied?"
- Where It Appears: Analytics page.
- Definition: Count of `follow_up_jobs` where `status === 'cancelled'` and `cancelled_reason === 'customer_replied'`.
- Counts: Customer-reply-cancelled follow-ups.
- Does Not Count: Other cancellation reasons.
- Database Tables Used: `follow_up_jobs`.
- Query / Calculation: Fetch follow-up jobs by business in rolling 30 days; filter status/reason.
- Time Window: Rolling 30 days.
- Update Triggers: Follow-up cancelled, cancellation reason updated.
- Edge Cases: Requires exact cancellation reason string.
- Confidence: High.

## 27. Follow-Up Response Rate

- Purpose: Answers "How often did customers respond before follow-up completion?"
- Where It Appears: Dashboard Metrics, Analytics page.
- Definition: Customer-reply cancellations divided by sent plus customer-reply cancellations.
- Counts: `cancelled/customer_replied` as numerator; sent and customer-reply-cancelled jobs as denominator.
- Does Not Count: Failed or unrelated cancelled follow-ups.
- Database Tables Used: `follow_up_jobs`.
- Query / Calculation: `round(cancelledCustomerReplied / (sent + cancelledCustomerReplied) * 100)` or 0 if denominator is zero.
- Time Window: Rolling 30 days.
- Update Triggers: Follow-up sent, follow-up cancelled due to customer reply.
- Edge Cases: This measures cancellation response behavior, not all customer replies after follow-up.
- Confidence: Medium.

## 28. Pending Follow-Ups

- Purpose: Answers "How many follow-up jobs are still queued or active?"
- Where It Appears: Follow-Up Activity card, Business Snapshot active follow-ups, StatsCards.
- Definition: Count of follow-up jobs in pending/scheduled/in-progress states, with some surfaces using only pending.
- Counts: `pending`, `scheduled`, `in_progress` in FollowUpActivity and BusinessSnapshot; only `pending` in StatsCards.
- Does Not Count: Sent, failed, cancelled.
- Database Tables Used: `follow_up_jobs`.
- Query / Calculation: Filter business follow-up jobs by status.
- Time Window: All time current state in most cards; current month in StatsCards.
- Update Triggers: Follow-up job created, status changed, deleted.
- Edge Cases: Status sets differ by surface.
- Confidence: Medium.

## 29. Failed Follow-Ups

- Purpose: Answers "How many follow-ups failed?"
- Where It Appears: Follow-Up Activity card.
- Definition: Count of `follow_up_jobs` with `status === 'failed'`.
- Counts: Failed follow-up rows.
- Does Not Count: Cancelled or pending jobs.
- Database Tables Used: `follow_up_jobs`.
- Query / Calculation: Filter by business ID and failed status.
- Time Window: All time current state.
- Update Triggers: Follow-up status changes to failed, job deleted.
- Edge Cases: Failure retries may create multiple records or update same record depending on implementation.
- Confidence: High.

## 30. Sent This Week

- Purpose: Answers "How many follow-ups were sent this week?"
- Where It Appears: Follow-Up Activity card.
- Definition: Count of follow-up jobs with `status === 'sent'` and `created_at >= weekStart`.
- Counts: Sent jobs created this week.
- Does Not Count: Jobs created earlier but sent this week.
- Database Tables Used: `follow_up_jobs`.
- Query / Calculation: Calculate Monday week start in browser local time; filter status and `created_at`.
- Time Window: Current week from Monday local time.
- Update Triggers: Follow-up created/sent.
- Edge Cases: Uses created timestamp as sent timestamp proxy.
- Confidence: Medium.

## 31. Needs Attention Count

- Purpose: Answers "How many actionable items need review?"
- Where It Appears: Needs Attention card.
- Definition: Sum of generated attention items from recent leads and business state.
- Counts: Customer reply review items, corrected intake items, urgent leads, active out-of-office, forwarding verification warning.
- Does Not Count: Items not generated by current rules.
- Database Tables Used: `leads`, `businesses`.
- Query / Calculation: Fetch last 7 days leads; inspect raw metadata and business state; each item has count 1; sum counts.
- Time Window: Rolling 7 days for lead-based items; current state for business items.
- Update Triggers: Lead metadata changes, lead created, business out-of-office changes, forwarding state changes.
- Edge Cases: Unread reply logic depends on metadata, not message read table.
- Confidence: Medium.

## 32. Business Wins / Achievements Earned

- Purpose: Gives customers milestone feedback and confidence that ReplyFlow is working.
- Where It Appears: Business Wins / Achievements card.
- Definition: Count of earned achievements based on first lead, first reply, lead count thresholds, first follow-up, reply count threshold, and account age.
- Counts: Milestones whose conditions are met.
- Does Not Count: Unearned milestones.
- Database Tables Used: `leads`, `messages`, `follow_up_jobs`, `businesses`.
- Query / Calculation: Multiple queries for first lead, first inbound reply, total lead count, first sent follow-up, total inbound replies, and business age.
- Time Window: All time.
- Update Triggers: Lead created, inbound reply received, follow-up sent, business age passes thresholds.
- Edge Cases: Current implementation can add the 25-lead achievement twice, inflating earned count.
- Confidence: Low.

## 33. Recent Activity Timeline

- Purpose: Answers "What recently happened in ReplyFlow?"
- Where It Appears: Recent Activity card / Activity Timeline.
- Definition: Combined latest lead captures, messages, and voicemail records from the last 7 days, sorted by timestamp and limited to 5.
- Counts: Activity events, not KPI totals.
- Does Not Count: Jobs and payments despite empty-state copy mentioning them.
- Database Tables Used: `leads`, `messages`, `voicemail_recordings`.
- Query / Calculation: Fetch latest leads, latest messages by business phone, voicemail recordings nested under recent leads; normalize to event objects; sort; slice 5.
- Time Window: Rolling 7 days.
- Update Triggers: Lead created, message created, voicemail created.
- Edge Cases: Voicemails attached to older leads may be missed even if voicemail is recent.
- Confidence: Medium.

## 34. Recent Leads

- Purpose: Shows the latest lead opportunities and their communication state.
- Where It Appears: Recent Leads Section, Leads page.
- Definition: List of business leads sorted by latest message/contact/created timestamps with nested messages, conversations, voicemail recordings, and AI records.
- Counts: Lead rows and associated child records shown in UI.
- Does Not Count: Deleted rows; filtering behavior depends on page state.
- Database Tables Used: `leads`, `messages`, `conversations`, `voicemail_recordings`, `ai_call_records`, `follow_up_jobs`, `call_events`.
- Query / Calculation: Fetch all business leads with nested records; order by `last_message_at`, `first_contact_at`, then `created_at`.
- Time Window: All time unless page filters are applied.
- Update Triggers: Lead created/updated, message inserted/updated, follow-up job changes, call events.
- Edge Cases: Realtime subscription for `messages` appears to filter by `business_id` even though messages may not have that column.
- Confidence: Medium.

## 35. Lead Stage

- Purpose: Helps a user understand whether a recent lead is new, contacted, or awaiting response.
- Where It Appears: Recent Leads Section.
- Definition: Derived from whether the lead has inbound messages and outbound messages after latest inbound.
- Counts: Not a numeric metric; per-lead status summary.
- Does Not Count: Message read state.
- Database Tables Used: `leads`, `messages`.
- Query / Calculation: Inspect nested messages and compare timestamps.
- Time Window: Per lead/all fetched messages.
- Update Triggers: Message inserted/updated.
- Edge Cases: Sorting mutates inbound messages array in implementation; same timestamp edge cases may be ambiguous.
- Confidence: Medium.

## 36. Operational Health Status

- Purpose: Answers "Is ReplyFlow operational right now?"
- Where It Appears: Operational Status card.
- Definition: Derived state based on Twilio number presence, forwarding verification, messaging status, and delivery failure count.
- Counts: Not numeric except delivery failures.
- Does Not Count: Stripe subscription health except indirectly through setup state elsewhere.
- Database Tables Used: `businesses`, `messages`, `call_events`, `ai_call_records`.
- Query / Calculation: `action-required` if no Twilio number or delivery failures > 5; `needs-attention` if forwarding/SMS not active; otherwise healthy.
- Time Window: Current state plus rolling 24h failures.
- Update Triggers: Business setup changes, message failures, forwarding verification, AI call records.
- Edge Cases: Last successful SMS only checks outbound direction/from phone, not explicit success status.
- Confidence: Medium.

## 37. Last Forwarded Call

- Purpose: Shows whether calls have recently been routed through ReplyFlow.
- Where It Appears: Operational Status card system details.
- Definition: Latest `call_events.created_at` for business.
- Counts: Latest timestamp only.
- Does Not Count: Calls not recorded in `call_events`.
- Database Tables Used: `call_events`.
- Query / Calculation: Order business call events by created desc, limit 1.
- Time Window: All time latest.
- Update Triggers: Call event inserted/deleted.
- Edge Cases: Does not distinguish successful forwarded call from other call event types if stored together.
- Confidence: Medium.

## 38. Last Successful SMS

- Purpose: Shows whether SMS recently sent from ReplyFlow.
- Where It Appears: Operational Status card.
- Definition: Latest outbound message from business Twilio phone.
- Counts: Latest timestamp only.
- Does Not Count: Inbound SMS.
- Database Tables Used: `messages`.
- Query / Calculation: Filter `from_phone` equals business Twilio number and `direction === 'outbound'`; order created desc; limit 1.
- Time Window: All time latest.
- Update Triggers: Outbound SMS inserted/deleted.
- Edge Cases: Does not verify delivery success status.
- Confidence: Medium.

## 39. Last AI Intake

- Purpose: Shows whether AI intake has run recently.
- Where It Appears: Operational Status card.
- Definition: Latest AI call record timestamp for the business.
- Counts: Latest timestamp only.
- Does Not Count: Outcome quality.
- Database Tables Used: `ai_call_records`.
- Query / Calculation: Order by `created_at` desc, limit 1.
- Time Window: All time latest.
- Update Triggers: AI call record inserted/deleted.
- Edge Cases: Failed AI calls still count as last AI intake.
- Confidence: Medium.

## 40. Delivery Failures

- Purpose: Alerts when recent SMS delivery problems exist.
- Where It Appears: Operational Status card.
- Definition: Count of outbound business-phone messages with non-null `error_code` in last 24 hours.
- Counts: Messages with error codes.
- Does Not Count: Failed messages without error_code; older failures.
- Database Tables Used: `messages`.
- Query / Calculation: Filter by `from_phone`, non-null `error_code`, `created_at >= now - 24h`; limit 5 for display.
- Time Window: Rolling 24 hours.
- Update Triggers: Message status/error updated, failed message inserted.
- Edge Cases: Limit 5 means displayed count cannot exceed 5 even if more failures exist.
- Confidence: Medium.

## 41. Payment Pending Amount

- Purpose: Answers "How much requested money is still actionable and outstanding?"
- Where It Appears: Payments page.
- Definition: Sum of `amount_cents` for pending payment requests that are not expired.
- Counts: `status === 'pending'` and no `expires_at` or `expires_at > now`.
- Does Not Count: Paid, cancelled, expired, failed, expired pending.
- Database Tables Used: `payment_requests`.
- Query / Calculation: Fetch all payment requests for business; filter in API; reduce amount cents.
- Time Window: Current state.
- Update Triggers: Payment request created, paid, cancelled, expired, amount changed.
- Edge Cases: Expiry is checked at request time; stale pending rows remain pending if no status transition occurred.
- Confidence: High.

## 42. Paid This Month

- Purpose: Answers "How much money was collected this month?"
- Where It Appears: Payments page.
- Definition: Sum of paid payment request amounts where paid date or created date is in current month.
- Counts: `status === 'paid'` and `paid_at || created_at >= startOfMonth`.
- Does Not Count: Pending/cancelled/failed; payments before month start.
- Database Tables Used: `payment_requests`.
- Query / Calculation: Server calculates month start; filters paid rows; sums `amount_cents`.
- Time Window: Current month.
- Update Triggers: Payment completed, paid_at updated, request deleted.
- Edge Cases: Server timezone defines month start; fallback to created_at if paid_at missing.
- Confidence: High.

## 43. Pending Requests

- Purpose: Answers "How many payment requests are still pending?"
- Where It Appears: Payments page.
- Definition: Count of payment requests where `status === 'pending'`.
- Counts: All pending rows, including expired pending rows.
- Does Not Count: Paid, cancelled, expired status, failed.
- Database Tables Used: `payment_requests`.
- Query / Calculation: Filter fetched payment requests by pending status; count rows.
- Time Window: Current state.
- Update Triggers: Payment request created, status changed, deleted.
- Edge Cases: Definition differs from Pending Amount, which excludes expired pending requests.
- Confidence: Medium.

## 44. Collection Rate

- Purpose: Answers "What percentage of non-cancelled, non-expired payment requests were paid?"
- Where It Appears: Payments page.
- Definition: Paid requests divided by payment requests whose status is not cancelled or expired.
- Counts: Paid as numerator; paid/pending/failed as denominator if not cancelled/expired.
- Does Not Count: Cancelled and expired requests in denominator.
- Database Tables Used: `payment_requests`.
- Query / Calculation: `round(paidRequests / totalRequests * 100)` or 0 when no denominator.
- Time Window: All time current dataset.
- Update Triggers: Payment request created, paid, cancelled, expired, failed.
- Edge Cases: Failed requests remain in denominator; expired pending rows with status still pending remain in denominator.
- Confidence: Medium.

## 45. Job Count / Jobs List

- Purpose: Shows scheduled service workload.
- Where It Appears: Calendar/Schedule Jobs tab, job components.
- Definition: Rows from `jobs` for the business, optionally filtered by status and date range.
- Counts: Jobs matching API filters.
- Does Not Count: Calendar events not stored as jobs.
- Database Tables Used: `jobs`.
- Query / Calculation: API filters by business ID, optional `status`, `from`, `to`; ordered by `scheduled_date`, `scheduled_time`.
- Time Window: Caller-supplied or all jobs.
- Update Triggers: Job created, completed, updated, deleted.
- Edge Cases: Date filtering uses date strings; timezone depends on date chosen/stored.
- Confidence: High.

## 46. Completed Jobs

- Purpose: Intended to show completed service workload where surfaced by job filters or status badges.
- Where It Appears: Jobs/Schedule surfaces if status filter or badges are used.
- Definition: Jobs whose `status` indicates completed.
- Counts: Jobs with completed status.
- Does Not Count: Scheduled/in-progress/cancelled jobs.
- Database Tables Used: `jobs`.
- Query / Calculation: `/api/jobs?status=completed` if used by caller; otherwise status-derived display.
- Time Window: Caller-supplied or all time.
- Update Triggers: Job status updated to completed, job created/deleted.
- Edge Cases: Exact status taxonomy must remain consistent.
- Confidence: Medium.

## 47. Upcoming Jobs

- Purpose: Shows scheduled future work.
- Where It Appears: Calendar/Schedule surfaces and job components.
- Definition: Jobs with scheduled date/time in the future, depending on component filter.
- Counts: Future scheduled jobs.
- Does Not Count: Past/completed/cancelled jobs if filtered by component.
- Database Tables Used: `jobs`.
- Query / Calculation: Usually fetched from `/api/jobs` and filtered/rendered client-side by schedule components.
- Time Window: Current/future depending on UI.
- Update Triggers: Job created, rescheduled, completed, deleted.
- Edge Cases: Timezone/date-only handling depends on `scheduled_date` and `scheduled_time` semantics.
- Confidence: Medium.

## 48. Calendar Connected Status

- Purpose: Shows whether Google Calendar integration is active.
- Where It Appears: Calendar page, Settings Integrations.
- Definition: Business or integration state indicating Google Calendar is connected.
- Counts: Not numeric; status summary.
- Does Not Count: Token health unless separately checked.
- Database Tables Used: `calendar_integrations`, `businesses` depending on surface.
- Query / Calculation: Check integration connection state and fields such as connected email and token expiry.
- Time Window: Current state.
- Update Triggers: Google Calendar connect/disconnect, token refresh, sync errors.
- Edge Cases: Token may expire after status is displayed.
- Confidence: Medium.

## 49. Last Calendar Sync

- Purpose: Shows freshness of Google Calendar data.
- Where It Appears: Calendar page, Settings Integrations.
- Definition: Last sync timestamp from integration/page state.
- Counts: Timestamp display only.
- Does Not Count: Sync success quality beyond timestamp.
- Database Tables Used: `calendar_integrations` or local page state.
- Query / Calculation: Display relative time/date for last sync.
- Time Window: Latest known sync.
- Update Triggers: Calendar sync completed, connect/disconnect.
- Edge Cases: Local state may reset until refreshed from database.
- Confidence: Medium.

## 50. AI Call Outcome Status

- Purpose: Shows the result of an AI intake call on a lead.
- Where It Appears: AI Call Summary card.
- Definition: Display mapping from `ai_call_records.outcome` to human-readable status.
- Counts: Not numeric; status label.
- Does Not Count: Multiple AI calls except latest selected record.
- Database Tables Used: `ai_call_records`.
- Query / Calculation: Fetch latest AI call by lead ID; fallback by business+caller phone; fallback by conversation ID; map outcome.
- Time Window: Latest matching record.
- Update Triggers: AI call record created/updated.
- Edge Cases: Fallback by caller phone can select a newer unrelated call from the same caller if lead ID is absent.
- Confidence: Medium.

## 51. AI Transcript Entries

- Purpose: Lets users inspect what happened during an AI call.
- Where It Appears: AI Call Summary card.
- Definition: Entries in `ai_call_records.transcript` rendered in order stored.
- Counts: Transcript item display, not a KPI.
- Does Not Count: Missing transcript rows.
- Database Tables Used: `ai_call_records`.
- Query / Calculation: Read transcript array from latest AI call record.
- Time Window: Latest matching AI call.
- Update Triggers: AI transcript saved/updated.
- Edge Cases: Empty transcripts hide the transcript section.
- Confidence: High.

## 52. Setup / Billing Status Summaries

- Purpose: Helps the customer understand current subscription and setup state.
- Where It Appears: SetupStatusCard, Settings Subscription & Billing, dashboard banners.
- Definition: Derived from business subscription fields, setup status, Twilio number, forwarding verification, messaging status, and trial dates.
- Counts: Not numeric; status and copy summary.
- Does Not Count: Usage metrics.
- Database Tables Used: `businesses`.
- Query / Calculation: Derived client-side through subscription/setup utility functions and business context fields.
- Time Window: Current state.
- Update Triggers: Trial starts, subscription changes, payment failure/recovery, Twilio provisioning, forwarding verification, messaging activation.
- Edge Cases: Stripe webhook delays can temporarily show stale subscription state until business context refreshes.
- Confidence: High.

---

# Summary Table

| Metric | Definition | Location |
|---|---|---|
| Recovery Rate | Unique replied leads / total leads | Dashboard Metrics, Analytics |
| Missed Calls Captured | Usually count of leads in 30 days | Dashboard Metrics, ReplyFlow Performance, Analytics |
| Missed Calls | Count of call events or leads depending on surface | Business Snapshot, StatsCards, Recent Leads |
| Leads Created | Count of leads | Analytics |
| Total Leads | Count of leads | Business Snapshot, Lead Engagement, Operational Metrics |
| Active Leads | Leads with status active or new | Analytics, ReplyFlow Performance |
| Completed Leads | Leads with status completed or won | Analytics |
| Ignored Leads / Contacts | Ignored lead/contact count | Leads, Settings/contact summaries |
| Messages Sent | Outbound message count | Dashboard Metrics, Analytics |
| Total SMS Sent | All-time outbound messages linked to leads | Operational Metrics |
| Customer Replies | Inbound message count | Dashboard, Analytics, Snapshot, Performance |
| Total Replies Received | All-time inbound messages linked to leads | Operational Metrics |
| Replied Leads | Unique leads with inbound messages | Lead Engagement |
| Engagement Rate | Replied leads / total leads | Lead Engagement |
| Recent Replies | Inbound replies in last 7 days | Lead Engagement |
| Total Conversations | Count of conversation rows | Analytics |
| Customer Reply Rate | Inbound messages / total messages | Analytics |
| Avg Messages/Conversation | Total messages / conversations | Analytics |
| Lead Activity Trend | Leads grouped by local date | Analytics chart |
| Customer Reply Trend | Inbound messages grouped by local date | Analytics chart |
| AI Intakes Completed | Completed AI call outcomes | Analytics |
| AI Intakes Incomplete | Partial/incomplete AI call outcomes | Analytics |
| AI Completion Rate | Completed AI calls / total AI calls | Analytics |
| Voicemails Captured | AI no-speech or voicemail rows depending surface | Analytics, Recent Activity |
| Follow-Ups Sent | Follow-up jobs with sent status | Dashboard, Analytics, Performance |
| Follow-Ups Canceled | Cancelled follow-ups due to customer reply | Analytics |
| Follow-Up Response Rate | Customer-reply cancellations / sent+cancellations | Dashboard, Analytics |
| Pending Follow-Ups | Pending/scheduled/in-progress follow-up jobs | Follow-Up Activity, Snapshot, StatsCards |
| Failed Follow-Ups | Failed follow-up jobs | Follow-Up Activity |
| Sent This Week | Sent follow-ups created this week | Follow-Up Activity |
| Needs Attention Count | Count of generated attention items | Needs Attention |
| Achievements Earned | Count of earned milestones | Business Wins |
| Recent Activity Timeline | Latest normalized events | Recent Activity |
| Recent Leads | Business leads with nested records | Recent Leads, Leads page |
| Lead Stage | Derived lead communication stage | Recent Leads |
| Operational Health Status | Derived setup/SMS/failure health | Operational Status |
| Last Forwarded Call | Latest call event timestamp | Operational Status |
| Last Successful SMS | Latest outbound message timestamp | Operational Status |
| Last AI Intake | Latest AI call record timestamp | Operational Status |
| Delivery Failures | Recent message error count | Operational Status |
| Payment Pending Amount | Sum of pending unexpired payment requests | Payments |
| Paid This Month | Sum of paid requests this month | Payments |
| Pending Requests | Count of pending payment requests | Payments |
| Collection Rate | Paid requests / non-cancelled non-expired requests | Payments |
| Job Count / Jobs List | Jobs matching filters | Calendar / Jobs |
| Completed Jobs | Jobs with completed status | Calendar / Jobs |
| Upcoming Jobs | Future scheduled jobs | Calendar / Jobs |
| Calendar Connected Status | Google Calendar connection state | Calendar, Settings |
| Last Calendar Sync | Most recent calendar sync timestamp | Calendar, Settings |
| AI Call Outcome Status | Latest AI call outcome label | AI Call Summary |
| AI Transcript Entries | Transcript items from AI call record | AI Call Summary |
| Setup / Billing Status | Derived subscription/setup status | Dashboard, Settings |

---

# Known Inconsistencies

## Missed Calls has multiple meanings

Some surfaces count `leads`; others count `call_events`. Recommendation: use "Captured Leads" for `leads` and "Missed Calls" only for `call_events`.

## Recovered Lead copy is inconsistent

Some achievements and copy use "recovered" to mean captured lead. Analytics recovery rate uses unique leads with replies. Recommendation: reserve "Recovered Lead" for lead-with-reply or rename achievement copy to "Leads Captured".

## Lead Engagement window mismatch

The Lead Engagement Card displays "Last 30 days" but calculates total leads and replied leads all time. Recommendation: either update calculation to 30 days or relabel as all time.

## Business Wins duplicate 25-lead achievement

The 25-lead achievement can be added twice, inflating achievement count. Recommendation: remove duplicate block when code changes are allowed.

## StatsCards Replies uses conversations

The dashboard StatsCards `Replies` metric counts `conversations`, not inbound replies. Recommendation: rename to "Conversations" or calculate inbound messages.

## Pending payment definitions differ

Pending Amount excludes expired pending requests. Pending Requests counts all pending requests, including expired pending rows. Recommendation: align both definitions.

## Voicemails Captured is not canonical

Analytics uses AI `no_speech`; Recent Activity uses `voicemail_recordings`. Recommendation: use `voicemail_recordings` for voicemail metrics.

## Realtime message filters may be ineffective

Some components subscribe to `messages` with `business_id` filters even though other code indicates `messages` lacks `business_id`. Recommendation: subscribe through lead/conversation-aware refresh or denormalize business ID if intended.

## Timezone handling is inconsistent

Client-side metrics use browser local time. Server-side payment month uses server timezone. Business timezone is not consistently applied. Recommendation: centralize analytics windows with business timezone.

---

# Future Metrics

These are not currently implemented as canonical analytics and should not be treated as current product behavior.

## Lead Conversion Percentage

Percent of captured leads that become completed/won jobs or paid customers.

## Average AI Call Duration

Average duration of AI voice calls, using call metadata or Twilio call duration.

## Average Time To First Reply

Average time from lead creation or first missed call to first outbound business/ReplyFlow response.

## Average Customer Reply Time

Average time from outbound message to first inbound customer reply.

## Average Job Value

Average revenue or quoted value per completed job.

## Revenue Collected

Total successfully collected payments from `payment_requests` and payment provider webhooks.

## Payment Collection Rate

Canonical payment conversion rate over a chosen time window, excluding expired/cancelled consistently.

## Average Response Time

A real implementation for Business Snapshot's currently unavailable average response metric.

## Missed Calls Recovered

Percent of actual `call_events` that result in a replied lead, using `call_events`, `leads`, and `messages` together.

## Repeat Customers

Count or percent of callers with multiple leads/jobs over time.

## Customer Lifetime Value

Revenue attributed to repeat customers over lifetime.

## Follow-Up Conversion Rate

Percent of follow-up sequences that produce a reply, booked job, or payment.

## AI Intake Field Completion Rate

Percent of required AI intake fields captured per AI call.

## Booking Rate

Percent of leads that become scheduled jobs.

## No-Show / Cancellation Rate

Percent of scheduled jobs cancelled or not completed.

## Business Hours Capture Rate

Missed calls/leads split by inside vs outside business hours.

---

# Maintenance Notes

When adding or changing analytics:

1. Add the metric here first.
2. Define whether it is event-based, lead-based, conversation-based, job-based, payment-based, or business-state-based.
3. Define the exact time window and timezone.
4. Define whether ignored/demo/deleted records are included.
5. Use the same definition everywhere the metric appears.
6. Add empty-state behavior for zero denominators.
7. Prefer database-side aggregation for large datasets.
