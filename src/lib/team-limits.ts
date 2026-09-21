/**
 * Team Access — launch safety ceilings (client + server safe).
 *
 * These are TECHNICAL abuse protections, not seat pricing:
 * a business may have up to 100 invited 'member' memberships plus its
 * owner (owner rows are excluded from the count), and up to 100
 * actionable pending invites (accepted/cancelled/expired don't count).
 *
 * The member cap is enforced atomically in the accept_team_invite DB
 * function (supabase/migrations/20261002000000_team_safety_limits.sql);
 * keep that value in sync with MAX_TEAM_MEMBERS_PER_BUSINESS.
 */
export const MAX_TEAM_MEMBERS_PER_BUSINESS = 100
export const MAX_PENDING_TEAM_INVITES_PER_BUSINESS = 100
