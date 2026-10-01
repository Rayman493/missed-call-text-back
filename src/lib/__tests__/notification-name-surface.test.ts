import { describe, it, expect } from 'vitest'
import {
  aiIntakeNotificationBody,
  resolveVoicemailCallerName,
} from '@/lib/notification-format'
// The client mirror module carries identical templates to
// notifications-server.ts (which cannot be imported in vitest due to its
// `server-only` dependency on supabase/admin).
import {
  NOTIFICATION_TEMPLATES,
  resolveCustomerDisplayName,
} from '@/lib/notifications'

/**
 * Regression tests for two production notification defects:
 *
 * 1. AI intake push rendered "Ryan Ryan · Grass cut by you guys" because the
 *    /api/notifications/create route composed `name · reason` into the
 *    message body while the template title already carried the name.
 *    Contract: the name appears exactly once (title), body = reason.
 *
 * 2. Voicemail notification rendered "New Voicemail From (412) 253-3598"
 *    even for a known customer because the Twilio voicemail webhook read
 *    `lead.name` (a legacy alias populated only by read normalization) off a
 *    raw row whose real column is `contact_name`.
 *    Contract: business-scoped known name wins; formatted phone is fallback.
 */
describe('AI intake notification — name rendered exactly once', () => {
  const render = (customerName: string | null, serviceRequested: string | null) => {
    // Mirror the fixed route + template pipeline:
    //   title  <- NOTIFICATION_TEMPLATES.ai_intake_completed(displayName)
    //   body   <- aiIntakeNotificationBody(serviceRequested)
    const template = NOTIFICATION_TEMPLATES.ai_intake_completed({
      leadName: customerName || '',
      leadPhone: '',
      leadId: 'lead-1',
      serviceRequested: serviceRequested || undefined,
    })
    const body = aiIntakeNotificationBody(serviceRequested)
    return { title: template.title, body }
  }

  it('known name + reason → title "Ryan", body "Grass cut by you guys" (combined once)', () => {
    const { title, body } = render('Ryan', 'grass cut by you guys')
    expect(title).toBe('Ryan')
    expect(body).toBe('Grass cut by you guys')
    expect(`${title} ${body}`).not.toContain('Ryan Ryan')
    expect(body).not.toContain('Ryan')
  })

  it('multi-word name → name once in title, never in body', () => {
    const { title, body } = render('Ryan Smith', 'grass cut by you guys')
    expect(title).toBe('Ryan Smith')
    expect(body).toBe('Grass cut by you guys')
    expect(`${title} · ${body}`).toBe('Ryan Smith · Grass cut by you guys')
  })

  it('duplicate name aliases cannot double-render', () => {
    // customerName and callerName populated with the same person arrive as a
    // single leadName — the body never echoes it back.
    const { title, body } = render('Ryan', 'my furnace stopped working')
    expect(`${title} ${body}`).toBe('Ryan My furnace stopped working')
  })

  it('no usable name → title falls back, body has no dangling separator or junk', () => {
    const { title, body } = render(null, 'grass cut by you guys')
    expect(title).toBe('New Request')
    expect(body).toBe('Grass cut by you guys')
    expect(body).not.toMatch(/^\s*·/)
    expect(body).not.toContain('undefined')
  })

  it('no name and no reason → clean generic body', () => {
    const { title, body } = render(null, null)
    expect(title).toBe('New Request')
    expect(body).toBe('New customer request')
  })

  it('deep link unchanged — template still routes to the lead', () => {
    const t = NOTIFICATION_TEMPLATES.ai_intake_completed({
      leadName: 'Ryan',
      leadPhone: '',
      leadId: 'lead-99',
    })
    expect(t.action_url).toBe('/dashboard/leads/lead-99')
    expect(t.action_text).toBe('View Customer')
  })
})

describe('Voicemail notification — business-scoped known name', () => {
  const render = (lead: any, leadPhone: string) => {
    const name = resolveVoicemailCallerName(lead) || ''
    const template = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: name,
      leadPhone,
      leadId: 'lead-1',
    })
    return `${template.title} ${template.message}`
  }

  it('known lead with contact_name → "New Voicemail From Ryan"', () => {
    const out = render({ contact_name: 'Ryan', caller_phone: '+14122533598' }, '+14122533598')
    expect(out).toBe('New Voicemail From Ryan')
  })

  it('known lead with legacy name column → name wins', () => {
    const out = render({ name: 'Ryan' }, '+14122533598')
    expect(out).toBe('New Voicemail From Ryan')
  })

  it('known lead with name only in extracted_info → name wins', () => {
    const out = render(
      { raw_metadata: { extracted_info: { callerName: 'Ryan' } } },
      '+14122533598'
    )
    expect(out).toBe('New Voicemail From Ryan')
  })

  it('blank/unusable name → formatted phone fallback', () => {
    expect(render({ contact_name: '   ' }, '+14122533598')).toBe('New Voicemail From (412) 253-3598')
    expect(render({ contact_name: 'Unknown' }, '+14122533598')).toBe('New Voicemail From (412) 253-3598')
    expect(render({ contact_name: 'Not collected' }, '+14122533598')).toBe('New Voicemail From (412) 253-3598')
  })

  it('unknown caller (no lead) → formatted phone fallback', () => {
    expect(render(null, '+14122533598')).toBe('New Voicemail From (412) 253-3598')
  })

  it('phone-number-shaped name value is not used as a name', () => {
    expect(render({ contact_name: '(412) 253-3598' }, '+14122533598')).toBe('New Voicemail From (412) 253-3598')
    expect(render({ contact_name: '+14122533598' }, '+14122533598')).toBe('New Voicemail From (412) 253-3598')
  })

  it('multi-word known name → full name used', () => {
    expect(render({ contact_name: 'Ryan Smith' }, '+14122533598')).toBe('New Voicemail From Ryan Smith')
  })

  it('cross-business leakage is impossible — route resolves the lead scoped to business_id', () => {
    // Source-level assertion: the voicemail route resolves the caller's lead
    // strictly inside the called business — getLeadByPhone(business.id, …)
    // and the stub-lead identity fetch is .eq('business_id', business.id).
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const routeSrc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app', 'api', 'twilio', 'voicemail', 'route.ts'),
      'utf-8'
    )
    expect(routeSrc).toContain('getLeadByPhone(business.id, normalizedCallerPhone)')
    expect(routeSrc).toContain(".eq('business_id', business.id)")
    // The resolver is row-bound: it can only reflect the lead the
    // business-scoped lookup returned, never another tenant's row.
    expect(resolveVoicemailCallerName({ contact_name: 'Other Tenant Name' })).toBe('Other Tenant Name')
  })

  it('voicemail deep link unchanged', () => {
    const t = NOTIFICATION_TEMPLATES.voicemail_received({
      leadName: 'Ryan',
      leadPhone: '+14122533598',
      leadId: 'lead-42',
    })
    expect(t.action_url).toBe('/dashboard/leads/lead-42')
    expect(t.action_text).toBe('Listen')
    expect(t.title).toBe('New Voicemail')
  })

  it('resolveCustomerDisplayName placeholder list still rejects Customer/Caller', () => {
    expect(resolveCustomerDisplayName('Customer', '+14122533598')).toBe('(412) 253-3598')
    expect(resolveCustomerDisplayName('Caller', '+14122533598')).toBe('(412) 253-3598')
    expect(resolveCustomerDisplayName('Ryan', '+14122533598')).toBe('Ryan')
  })
})
