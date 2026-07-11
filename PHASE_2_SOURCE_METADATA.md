# Phase 2: Lead Source Metadata

## Current Source Values in Use

**From Entry Path Audit:**
- `call_intake` - Twilio voice calls and voicemail callbacks
- `sms` - Inbound SMS messages
- `manual_entry` - Manual lead creation API
- `manual_payment_request` - Generic leads API (payment request initialization)
- `admin_test` - Admin test lead API

## Canonical Source Values

**Decision:** Keep existing source values as canonical

**Rationale:**
1. **Already Semantic:** Current values clearly describe origin
2. **No Conflicts:** No duplicate or ambiguous values
3. **Analytics Compatible:** Existing analytics can distinguish sources
4. **No Schema Change Needed:** Values work in current schema
5. **Backward Compatible:** Historical data uses these values

## Canonical Source Values

| Source Value | Use Case | Entry Path |
|--------------|----------|------------|
| `call_intake` | Twilio voice calls and voicemail | Voice webhook, Voicemail callback |
| `sms` | Inbound SMS messages | SMS webhook |
| `manual_entry` | Manual lead creation via UI | Manual create API |
| `manual_payment_request` | Payment request initialization | Generic leads API |
| `admin_test` | Admin test leads | Admin test API |

## Implementation Status

**All Paths Already Using Canonical Values:**
- ✅ Voice webhook: `source: 'call_intake'`
- ✅ SMS webhook: `source: 'sms'`
- ✅ Manual create: `source: 'manual_entry'`
- ✅ Generic API: `source: 'manual_payment_request'`
- ✅ Admin test: `source: 'admin_test'`

**Source Assignment Location:**
- All source values assigned in `LeadService.createLead()` or `LeadService.findOrCreateLead()`
- Centralized in canonical lead service
- No scattered source assignment logic

## Future Source Values (Not Implemented)

**Potential Future Values:**
- `import` - Future bulk import feature
- `referral` - Future referral program
- `api` - Future external API integration

**Note:** These are speculative and not implemented in Phase 2.

## No Action Required

**Status:** ✅ COMPLETE

Current source values are:
- Semantic and clear
- Already canonical
- Centrally assigned
- Backward compatible
- Analytics-friendly

No schema changes or refactoring needed for source metadata in Phase 2.
