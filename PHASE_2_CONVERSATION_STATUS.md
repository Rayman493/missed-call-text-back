# Phase 2: Conversation Status Semantics

## Current Status Values Found

**In Use:**
- `active` - Used in `getOrCreateConversation()` and `ConversationService.findOrCreateConversation()`
- `open` - Previously used in SMS processing, now migrated to `active`

**Read Operations:**
- `getOpenConversationForLead()`: `.in('status', ['open', 'active'])` - accepts both
- `createConversation()`: `.in('status', ['active', 'open'])` - accepts both

**Write Operations:**
- `getOrCreateConversation()`: Creates with `status: 'active'`
- `ConversationService.findOrCreateConversation()`: Creates with `status: 'active'` (default)
- SMS processing: Now uses `status: 'active'` (migrated from `open`)

## Decision: Canonical Status = 'active'

**Canonical Write Value:** `active`
**Read Compatibility:** Accepts both `active` and `open`

## Rationale

1. **Existing Pattern:** `getOrCreateConversation()` already uses `active` as the canonical value
2. **Migration Complete:** SMS processing migrated from `open` to `active`
3. **Backward Compatible:** Read operations accept both values
4. **No Data Migration Needed:** Historical rows with `open` remain readable
5. **Simple Mental Model:** One canonical value for new writes

## Implementation Status

**Already Implemented:**
- ✅ `ConversationService.findOrCreateConversation()` uses `status: 'active'` (default)
- ✅ SMS processing migrated to use `status: 'active'`
- ✅ Manual lead creation uses `status: 'active'`
- ✅ Generic API uses `status: 'active'`
- ✅ Admin test lead uses `status: 'active'`
- ✅ Read operations accept both values for backward compatibility

**No Further Action Required:**
- All new writes use canonical `active` status
- Historical `open` conversations remain readable
- No breaking changes to existing data
- No database migration needed

## Future Cleanup (Optional)

If desired, a future migration could:
1. Update all historical `open` to `active`
2. Remove `open` from read filters
3. Add database constraint to enforce `active` only

**Not Required for Phase 2:**
- Current implementation is backward compatible
- No production risk
- Can be deferred to hardening phase

## Conclusion

**Canonical Status:** `active`
**Backward Compatibility:** Maintained
**Data Migration:** Not required
**Status:** ✅ COMPLETE
