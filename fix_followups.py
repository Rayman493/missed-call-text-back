import re

with open('src/app/api/cron/send-followups/route.ts', 'r') as f:
    content = f.read()

# Find the location after 'Found lead' and before 'QA LOGGING'
pattern = r"(console\.log\(`\[send-followups\] Found lead: \$\{lead\.id\}, business: \$\{business\.id\}`\)\s*\n\s*)(// QA LOGGING)"

replacement = r"""\1
        // Check if lead phone is in ignored contacts
        if (lead.caller_phone) {
          const isIgnored = await isIgnoredContact(business.id, lead.caller_phone)
          if (isIgnored) {
            console.log(`[send-followups] Lead ${lead.id} phone is in ignored contacts, skipping follow-up ${followUp.id}`)
            const { error: cancelError } = await supabase
              .from('follow_up_jobs')
              .update({
                status: 'cancelled',
                cancelled_reason: 'ignored_contact',
                cancelled_at: new Date().toISOString()
              })
              .eq('id', followUp.id)

            if (cancelError) {
              console.error('[send-followups] Error cancelling follow-up for ignored contact:', cancelError)
            }
            cancelled++
            continue
          }
        }

        // Check if business has active access (subscription or manual access)
        if (!hasBillingAccess(business)) {
          console.log(`[send-followups] Business ${business.id} does not have active access, skipping follow-up ${followUp.id}`)
          const { error: cancelError } = await supabase
            .from('follow_up_jobs')
            .update({
              status: 'cancelled',
              cancelled_reason: 'no_active_access',
              cancelled_at: new Date().toISOString()
            })
            .eq('id', followUp.id)

          if (cancelError) {
            console.error('[send-followups] Error cancelling follow-up for inactive business:', cancelError)
          }
          cancelled++
          continue
        }

        \2"""

new_content = re.sub(pattern, replacement, content)

with open('src/app/api/cron/send-followups/route.ts', 'w') as f:
    f.write(new_content)

print('File updated successfully')
