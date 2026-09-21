# Team Permissions — Post-Launch Architecture

Status: **prep only** (Prelaunch Batch 4). Zero launch behavior change.
Nothing in production reads, writes, or enforces per-permission logic yet.

## 1. Current launch access model

- `businesses.user_id` — owner-of-record (compatibility field).
- `business_memberships` — authorization source of truth.
  `(business_id, user_id, role ∈ 'owner'|'member', invited_by, created_at, permissions jsonb NULL)`.
  One owner per business (partial unique index). RLS: users read only their
  own membership row; all mutations are service-role mediated.
- `team_invites` — pending invites, service-role only, one pending per
  `(business_id, phone)`, 7-day TTL, statuses pending/accepted/cancelled/expired.
- One user → at most one membership → one business.
- Safety ceilings: 100 members (owner excluded) + 100 live pending invites
  (`src/lib/team-limits.ts`, `accept_team_invite` advisory-locked cap).

## 2. Current owner/member behavior

| Surface | Owner | Member |
|---|---|---|
| Canonical resolver | `requireBusinessAccess` / `requireBusinessOwner` (`src/lib/team-access.ts`) | same |
| Role source | `BusinessContext.role` (membership row) | same |
| Team management | full (invite/resend/cancel/remove) | read-only "you're a member" |
| Stripe Connect / payouts | full | hidden + calls gated |
| Billing / subscription | full | "managed by owner" |
| Calendar connect/disconnect | full | hidden + calls gated |
| Tap to Pay enable | full | hidden + calls gated |
| Danger Zone | rendered | not rendered |
| Shared settings (business info, booking, Venmo/PayPal, etc.) | editable | editable |

## 3. Permission vocabulary (`src/lib/team-permissions.ts`)

Domain-level `.read` / `.write` pairs plus management keys:

```
customers, conversations, jobs, schedule, booking,
quotes_invoices, payments, reminders   → .read / .write
team.manage, settings.manage, integrations.manage,
billing.manage, business.delete
```

Deliberately modest: no `.create`/`.archive`/`.export` granularity yet.

## 4. Member defaults (exact launch parity)

All `.read`/`.write` keys: **true** — members have full operational access today.
`settings.manage`: **true** — members edit shared business settings today.
`team.manage`, `integrations.manage`, `billing.manage`, `business.delete`: **false**
— already owner-only in current code.

## 5. Storage model

`business_memberships.permissions jsonb NULL` — sparse override object.
No full permission arrays, no NOT NULL, no default value.

## 6. NULL semantics

`NULL` → role defaults only. All existing rows are NULL → **identical access
after migration, guaranteed by construction.**

## 7. Sparse override semantics

`{"payments.write": false, "settings.manage": false}` overrides only those
keys; every other key resolves to the role default.

## 8. Effective permission algorithm

`hasBusinessPermission(role, permissions, key)`:
1. `role === 'owner'` → **true** (hard invariant).
2. Sanitized explicit boolean override for a known key → that value.
3. Otherwise → `DEFAULT_ROLE_PERMISSIONS[role][key]`.
4. Unknown key → false (also prevented at compile time by `PermissionKey`).

## 9. Owner invariant

Owner + NULL → all true. Owner + malformed JSON → all true. Owner +
`{"x": false}` → still true. Nothing can lock the owner out.

## 10. Server resolver design (future)

`MembershipRecord`/`BusinessAccess` already carry optional `permissions`.
After the column exists in prod, add `'permissions'` to the select in
`getMembershipForUser` (one line) and pass it through — then a future helper:

```ts
requireBusinessPermission({ access, permission: 'payments.write' })
// → 403 { code: 'permission_denied', permission } when false
```

## 11. Client helper design (future)

```ts
const canEditPayments = hasBusinessPermission(role, membership.permissions, 'payments.write')
```

UI hides/disables the action; server remains authoritative. BusinessContext
can expose `permissions` + `hasPermission()` once the column is live.

## 12. RLS migration strategy (future)

Add one central SQL helper instead of embedding JSON logic per policy:

```sql
has_business_permission(p_business_id uuid, p_permission text)
```

Phased adoption: sensitive writes first, reads later only if needed.
Do NOT rewrite existing membership-EXISTS policies in one pass.

## 13. API enforcement strategy (future)

Adopt `requireBusinessPermission` incrementally at mutation boundaries —
payments write, booking write, integrations — never a big-bang rewrite.
Deny = 403 with machine-readable `permission_denied` + the key.

## 14. Invite interaction

Today: invite → membership with `permissions NULL` → defaults. Future:
invites may optionally carry an override template set by the owner at
invite time; acceptance copies it onto the membership. Not built.

## 15. Future permission editor

Owner-facing: simple per-member toggle list grouped by domain, rendered from
`KNOWN_PERMISSION_KEYS` + effective values; writes sparse diffs (only keys
that differ from role defaults) via an owner-only mutation endpoint.
No custom roles in V1 of the editor.

## 16. Audit-log contract (future)

Event `team_permissions_updated`:
`business_id, actor_user_id, target_membership_id, before (sanitized
overrides), after, created_at`. Reuse whatever audit/event sink exists at
implementation time; none exists today.

## 17. Rollout phases

1. **Schema + helper present** (this batch — done, no behavior change).
2. Permission mutation API behind a feature flag (owner-only).
3. Owner-facing permission editor UI.
4. UI action gating via client helper.
5. Server mutation enforcement via `requireBusinessPermission`.
6. Permission-aware RLS for sensitive writes.
7. Expand vocabulary only on real customer demand.

## 18. Rollback strategy

Every layer is independent: disabling the editor or enforcement leaves
role defaults intact. Worst case: `UPDATE business_memberships SET
permissions = NULL` restores launch behavior for every member instantly;
the column can remain harmlessly unused.

## 19. Security risks

- Overrides are service-role-write only — never accept client JSON writes
  to `business_memberships` directly.
- Sanitizer drops unknown keys and non-boolean values; a poisoned payload
  can only narrow (never widen) access, and never affects owners.
- Client gating is UX only; server enforcement is mandatory before any
  override is trusted.
- Keep vocabulary small — each new key is a permanent API contract.

## 20. Testing strategy

Current: pure-helper unit tests + migration contract tests
(`prelaunch-batch4-permissions.test.ts`). Future: per-phase tests —
override sanitization, deny-path 403s, editor round-trip, RLS deny cases,
and a NULL-row regression proving launch parity persists.
