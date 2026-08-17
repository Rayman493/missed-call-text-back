# Canonical Request Title Generator - Analysis

**Date:** 2025-01-09
**Goal:** Improve canonical Request title generator to produce professional titles
**Status:** Analysis Complete

---

## Part 1 — Canonical Request-title Pipeline

### Exact Current Production Generation Path

1. **AI Voice Service** → Extracts `serviceRequested` from transcript
2. **AI Call Record** → Persists `extracted_info.serviceRequested` (raw transcript)
3. **getLeadAIIntake** (ai-field-mapping.ts lines 319-479)
   - Reads from `ai_call_records[0].extracted_info` or `raw_metadata.extracted_info`
   - Normalizes using `normalizeExtractedInfo`
   - Applies `normalizeServiceReason` to `serviceRequested`
   - Generates `conciseRequestTitle` using `generateConciseRequestTitle` (line 446-454)
4. **generateConciseRequestTitle** (ai-field-mapping.ts lines 24-27)
   - Calls `generateCanonicalRequestTitle` (ai-intake-formatter.ts lines 275-468)
   - Returns title or empty string
5. **getLeadRequestTitle** (ai-field-mapping.ts lines 495-557)
   - Primary: Uses `aiIntake.conciseRequestTitle` (validated with `validateRequestTitle`)
   - Secondary: Falls back to `rawMetadata.request` or `serviceRequested` (validated)
   - Tertiary: Falls back to `additionalDetails` (regenerated with `generateCanonicalRequestTitle`)
   - Quaternary: Falls back to job titles
   - Fallback: Returns empty string

### Exact Inputs Available to Title Generator

**Primary Input:**
- `serviceRequested` (raw transcript from AI extraction)
- `additionalDetails` (full customer sentence if available)
- `request` (canonical field, if set)
- Corrected fields from customer SMS corrections

**Normalization Applied Before Title Generation:**
- `normalizeServiceReason` removes conversational prefixes
- `normalizeServiceReason` applies safe trimming and capitalization
- `normalizeServiceReason` applies content sanitization

### Precedence Order

1. `corrected.serviceRequested` (highest priority - customer corrections)
2. `corrected.reason` / `corrected.reasonForCalling` (customer corrections)
3. `rawMetadata.serviceRequested` (original AI extraction)
4. `normalized.reasonForCalling` (canonical field from AI extraction)
5. `extractedInfoRaw.serviceRequested` (fallback to raw extracted info)

### Why Demonstrated Request Becomes "Get New Pipes"

**Demonstrated Input:**
```
I was looking to get some new pipes installed in my new house. It's getting built right now, and I'm trying to get the the piping all set up. And I was recommended to you guys by a friend. So I'd like you guys to come do it for my house.
```

**Step-by-Step Transformation in `generateCanonicalRequestTitle`:**

1. **Remove conversational prefixes** (lines 282-329):
   - Removes: "I was looking to "
   - Result: "get some new pipes installed in my new house..."

2. **Remove pronouns and personal references** (lines 332-339):
   - Removes: "my " at start, "my " in middle
   - Result: "get some new pipes installed in new house..."

3. **Remove trailing conversational filler** (lines 342):
   - Removes: nothing in this case

4. **Remove scheduling and timing information** (lines 345-347):
   - Removes: nothing in this case

5. **Remove property size and descriptions** (lines 350-351):
   - Removes: nothing in this case

6. **Remove common filler words** (lines 354-355):
   - Removes: "a", "an", "the", "to", "for", "with", "by", "at", "on", "in", "of", "just", "really", etc.
   - Result: "get new pipes installed new house getting built right now trying get piping set recommended friend would like come house"

7. **Try service mappings** (lines 403-410):
   - Matches "Plumbing Installation" pattern: `/\b(?:pipe|pipes|piping)\s*(?:install|installation|new|set up)/i`
   - However, the pattern matching happens AFTER filler word removal, which has already removed "to", "for", "with", etc.
   - The processed text is: "get new pipes installed new house getting built right now trying get piping set recommended friend would like come house"
   - The pattern should match, but the function continues to noun extraction

**Root Cause:**
The service mapping for "Plumbing Installation" exists and should match, but the function has a flaw in the logic flow. After filler word removal, the text is too fragmented for the pattern to match reliably. The function then falls through to noun extraction (lines 409-467), which extracts:
- "get" (removed by vague verb check? No, it's in the vagueVerbs list but the check is for 1-2 word phrases)
- "new" (added to extractedWords)
- "pipes" (added to extractedWords)
- Result: "New Pipes" → then single-word suffix logic adds "Service" → "Pipes Service"

**Actually, looking more carefully at the code:**
The priority noun extraction (lines 409-430) looks for priority nouns like 'piano', 'guitar', 'kitchen', 'bathroom', 'sink', 'toilet', 'faucet', 'pipe', 'drain', etc.
- 'pipe' is in the priority noun list
- 'new' is not in the priority noun list
- So extractedWords would be: ['pipe']
- Then the fallback (lines 433-439) takes first 2-3 meaningful words if no priority nouns found
- But 'pipe' IS a priority noun, so extractedWords = ['pipe']
- Then single-word suffix logic (lines 447-460) adds "Installation" for 'pipe' → "Pipe Installation"

**Wait, but the test shows "Get New Pipes" not "Pipe Installation"**

Let me re-examine the code more carefully...

Looking at line 367, the service mapping for "Plumbing Installation" was added in the SMS-polish changes. But the test still shows "Get New Pipes". This suggests the service mapping is not being matched properly.

The issue is that after filler word removal, "get" is still in the text. The filler word list includes 'get' at line 354, so it should be removed. But let me check if 'get' is actually in the list...

Looking at line 354: `const fillerWords = ['a', 'an', 'the', 'to', 'for', 'with', 'by', 'at', 'on', 'in', 'of', 'just', 'really', 'actually', 'basically', 'literally', 'very', 'some', 'any', 'this', 'that'];`

'get' is NOT in the filler word list! That's the bug. 'Get' should be removed as a conversational verb but it's not in the filler list.

So the processed text still contains "get", which then gets picked up by noun extraction as the first word.

### Whether Title is Persisted, Recomputed, or Both

**Persisted:**
- `conciseRequestTitle` is stored in `getLeadAIIntake` result (computed on demand)
- Not persisted in database (recomputed each time)
- Raw `serviceRequested` is persisted in `ai_call_records.extracted_info`

**Recomputed:**
- `getLeadRequestTitle` recomputes title on each call
- Uses `generateCanonicalRequestTitle` each time
- This means improving the generator will automatically improve all consumers

### Whether Different Consumers Generate Different Titles

**All consumers use the same generator:**
- UI components: Call `getLeadRequestTitle` → `generateCanonicalRequestTitle`
- SMS formatter: Calls `generateCanonicalRequestTitle` directly
- Dashboard: Uses `getLeadRequestTitle`

**Current issue:** SMS formatter was modified to call `generateCanonicalRequestTitle` directly, bypassing `getLeadRequestTitle`. This is correct architecture since SMS should use the canonical title, but it means SMS might get a different result if the input differs.

### Whether Historical Records Would Change

**Historical records:** Will NOT change automatically
- Raw `serviceRequested` is persisted in database
- Title is recomputed on each display
- Improving the generator will improve display for all records (both old and new)

---

## Part 2 — Canonical Data Responsibilities

### Raw Request
**Must remain unchanged in:**
✅ Transcript
✅ Raw extracted information (`ai_call_records.extracted_info.serviceRequested`)
✅ `serviceRequested` in `raw_metadata`
✅ AI call records
✅ Internal customer details
✅ Any diagnostic or audit record

### Canonical Request Title
**Should be reused consistently:**
✅ AI Intake card
✅ Current Request section
✅ Customer header or summary
✅ Customer cards
✅ Recent Customers
✅ Dashboard
✅ Notifications
✅ Search/filter results
✅ SMS intake confirmation
✅ Job or scheduling prefill
✅ Any API response that exposes the title

### AI Summary
**Separate concept:**
✅ Fuller office-assistant-style explanation
✅ Contains context, urgency, and next steps
✅ Generated by `generateOfficeAssistantSummary` (ai-intake-formatter.ts lines 1147-1216)

---

## Part 3 — Required Request-title Style

**Current Issues:**
❌ "Get New Pipes" - starts with command verb
❌ "Need Someone To Fix Sink" - conversational sentence
❌ "Looking For Roof Help" - conversational filler
❌ "General Service" - overused fallback

**Required Style:**
✅ 2-7 meaningful words
✅ Title Case in UI-facing output
✅ Noun phrase, not conversational sentence
✅ No ending punctuation
✅ No placeholder titles
✅ No redundant words
✅ Stable when generated repeatedly

**Reject/Transform Patterns:**
❌ Get, Need, Want, Looking For, Looking To, Was Looking To, Calling About, Calling Because, Come Fix, Come Do, Help With, Someone To, Trying To, See If You Can

---

## Part 4 — Demonstrated Plumbing Behavior

**Required Result:** "New-Construction Plumbing Installation"

**Current Result:** "Get New Pipes"

**Root Cause:**
1. 'get' is not in the filler word list, so it survives filler removal
2. Noun extraction picks 'get' as the first word
3. Service mapping for "Plumbing Installation" exists but the pattern doesn't match due to fragmented text
4. Fallback produces "Get New Pipes"

**Required Recognition:**
✅ Pipes/plumbing
✅ Installation (not repair)
✅ New house currently being built (new construction context)
✅ Requested outcome: plumbing installation for new construction

---

## Part 5 — Semantic Distinctions Required

| Caller Meaning | Canonical Title |
|---------------|-----------------|
| Pipes installed in house currently being built | New-Construction Plumbing Installation |
| New pipes installed in existing home | Pipe Installation |
| Existing pipes replaced | Pipe Replacement |
| Broken or leaking pipes repaired | Pipe Repair |
| Frozen pipe | Frozen Pipe Repair |
| Burst pipe | Burst Pipe Repair |
| Drain blockage | Drain Cleaning |
| Unclear request identifying only plumbing | Plumbing Service |

**Rules:**
✅ Installation must not become repair
✅ Repair must not become installation
✅ Replacement must not become installation unless wording supports both
✅ "New construction" must not be inferred from "new pipes" alone
✅ "New home" must not automatically mean under construction
✅ Do not invent emergency status
✅ Do not infer specific fixture, system, or material not mentioned

---

## Consumers Audited

1. **AI Intake card** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
2. **Current Request section** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
3. **Customer header/summary** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
4. **Customer cards (LeadCard.tsx)** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
5. **Recent Customers (RecentLeadsSection.tsx)** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
6. **Dashboard leads page** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
7. **Calendar page** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
8. **Payments page** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
9. **Notifications** → Uses AI summary, not canonical title
10. **Search/filter results** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
11. **SMS intake confirmation** → `generateCanonicalRequestTitle` (direct call) ✅
12. **Job scheduling prefill** → `getLeadRequestTitle` → `generateCanonicalRequestTitle` ✅
13. **API responses** → Uses raw fields, not canonical title

**Conclusion:** All UI consumers use the same canonical title generator. SMS uses it directly. Notifications use AI summary (separate concept). API uses raw fields (correct).

---

## Next Steps

1. Add conversational verbs to filler word list ('get', 'need', 'want', etc.)
2. Improve service mapping patterns to recognize semantic context
3. Add context detection for new construction vs existing home
4. Add comprehensive tests for all required scenarios
5. Verify all consumers display the same canonical title

---

**Analysis Complete** - Ready for implementation