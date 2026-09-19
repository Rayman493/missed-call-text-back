import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (rel: string) => readFileSync(rel, 'utf8').replace(/\r\n/g, '\n')

const calendarPage = read('src/app/dashboard/calendar/page.tsx')
const activityCard = read('src/components/RecentActivityCard.tsx')
const mediaRenderer = read('src/components/MessageMediaRenderer.tsx')
const leadClient = read('src/app/dashboard/leads/[id]/page-client.tsx')
const mobileList = read('src/components/MobileConversationMessageList.tsx')
const desktopList = read('src/components/DesktopConversationMessageList.tsx')
const navbarNotifs = read('src/components/NavbarNotifications.tsx')
const leadCard = read('src/components/LeadCard.tsx')
const statusDropdown = read('src/components/LeadStatusDropdown.tsx')
const assistant = read('src/components/ReplyFlowAssistant.tsx')
const accountDeletion = read('src/app/account-deletion/page.tsx')
const filterButton = read('src/components/ui/ChartFilterButton.tsx')
const todaySchedule = read('src/components/jobs/TodaySchedule.tsx')
const tasksTab = read('src/components/schedule/TasksTab.tsx')

describe('Batch 7F — Appointments tab data consistency', () => {
  it('feeds MeetingsTab the union of all fetched months, not the visible-month snapshot', () => {
    expect(calendarPage).toContain('const allFetchedEvents')
    expect(calendarPage).toContain('for (const list of eventsCache.values())')
    expect(calendarPage).toMatch(/<MeetingsTab[\s\S]*?events=\{allFetchedEvents\}/)
    // Deduped by event id — no duplicate records
    expect(calendarPage).toContain('map.set(ev.id, ev)')
  })

  it('passes the real completion map instead of an always-empty Map', () => {
    expect(calendarPage).toContain('const appointmentCompletedMap')
    expect(calendarPage).toContain("j.status === 'completed'")
    expect(calendarPage).toMatch(/<MeetingsTab[\s\S]*?completedMap=\{appointmentCompletedMap\}/)
    expect(calendarPage).not.toContain('completedMap={new Map()}')
  })

  it('has explicit loading and error states instead of a false empty state', () => {
    expect(calendarPage).toContain('isLoading={isLoadingEvents}')
    expect(calendarPage).toContain('loadError={monthLoadError}')
    expect(calendarPage).toContain('onRetry={() => fetchEvents()}')
    expect(calendarPage).toContain("Couldn't load appointments")
    expect(calendarPage).toContain('aria-label="Loading appointments"')
    // Error state only renders when there is genuinely nothing to show
    expect(calendarPage).toContain('loadError && !hasAnyAppointments')
  })

  it('keeps a visible group for eligible past events (Earlier) so populated data never looks empty', () => {
    expect(calendarPage).toContain("renderGroup('Earlier', earlier.length, earlier)")
    expect(calendarPage).toContain('hasAnyAppointments')
    expect(calendarPage).toContain('No appointments scheduled')
  })
})

describe('Batch 7F — Dashboard Activity false empty state', () => {
  it('scopes the messages query by canonical business_id, not phone-number text matching', () => {
    const messagesQuery = activityCard.match(/\.from\('messages'\)[\s\S]*?\.limit\(\d+\)/)?.[0] || ''
    expect(messagesQuery).toContain(".eq('business_id', business.id)")
    expect(messagesQuery).not.toContain('from_phone')
    expect(messagesQuery).not.toContain('to_phone')
    expect(messagesQuery).not.toContain('twilio_phone_number')
  })

  it('scopes direct jobs/tasks/payment queries by business_id', () => {
    const jobsQuery = activityCard.match(/\.from\('jobs'\)[\s\S]*?\.limit\(\d+\)/)?.[0] || ''
    const tasksQuery = activityCard.match(/\.from\('tasks'\)[\s\S]*?\.limit\(\d+\)/)?.[0] || ''
    const paymentsQuery = activityCard.match(/\.from\('payment_requests'\)[\s\S]*?leads\(id, caller_phone, name, business_id\)[\s\S]*?\.limit\(\d+\)/)?.[0] || ''
    expect(jobsQuery).toContain(".eq('business_id', business.id)")
    expect(tasksQuery).toContain(".eq('business_id', business.id)")
    expect(paymentsQuery).toContain(".eq('business_id', business.id)")
  })

  it('lets standalone (unlinked) records through while still dropping other-business leads', () => {
    expect(activityCard).toContain('lead && lead.business_id !== business.id')
    // Null-safe access so standalone records cannot crash the merge
    expect(activityCard).toContain("lead?.name || 'Unknown'")
    expect(activityCard).toContain('lead?.caller_phone')
  })

  it('renders an actionable load-failure surface instead of a false empty state', () => {
    expect(activityCard).toContain('loadFailed')
    expect(activityCard).toContain("Couldn't load recent activity")
    expect(activityCard).toContain('Try again')
    // Only fails closed when nothing else could render
    expect(activityCard).toContain('hadQueryError && sortedEvents.length === 0')
  })
})

describe('Batch 7F — unified graph filter control', () => {
  const graphs = [
    'src/components/analytics/RevenueGraph.tsx',
    'src/components/analytics/BusinessActivityGraph.tsx',
    'src/components/analytics/NewCustomersGraph.tsx',
    'src/components/analytics/PaymentCollectionGraph.tsx',
    'src/components/analytics/LeadsSourceGraph.tsx',
    'src/components/analytics/LeadConversionGraph.tsx',
  ]

  it('every dashboard graph uses the same visible Filter control', () => {
    for (const path of graphs) {
      const content = read(path)
      expect(content).toContain('ChartFilterButton')
      expect(content).not.toContain('<PremiumSelect')
    }
  })

  it('every graph keeps its timeframe options inside the shared control', () => {
    for (const path of graphs) {
      const content = read(path)
      expect(content).toContain('ANALYTICS_TIMEFRAME_OPTIONS')
      expect(content).toContain('groups={[')
    }
  })

  it('graph-specific filters remain as additional groups (not separate buttons)', () => {
    const activity = read('src/components/analytics/BusinessActivityGraph.tsx')
    const conversion = read('src/components/analytics/LeadConversionGraph.tsx')
    expect(activity).toContain('SERIES_FILTER_OPTIONS')
    expect(conversion).toContain('STAGE_FILTER_OPTIONS')
    // Both dimensions live inside ONE Filter button's groups
    expect(activity).toMatch(/groups=\{\[[\s\S]*?SERIES_FILTER_OPTIONS[\s\S]*?\]\}/)
    expect(conversion).toMatch(/groups=\{\[[\s\S]*?STAGE_FILTER_OPTIONS[\s\S]*?\]\}/)
  })

  it('ChartFilterButton supports grouped sections with independent active detection', () => {
    expect(filterButton).toContain('interface ChartFilterGroup')
    expect(filterButton).toContain('groupsMode')
    expect(filterButton).toContain('role="group"')
    // Active dot only shows when a selection differs from its own default
    expect(filterButton).toContain('g.value !== (g.activeValue')
  })
})

describe('Batch 7F — schedule headers and summary hierarchy', () => {
  it('Reminders / Jobs / Appointments all use the unified "+ New" action', () => {
    expect(calendarPage).not.toContain('<span className="sm:hidden">Add</span>')
    const newButtons = calendarPage.match(/<span className="sm:hidden">New<\/span>/g) || []
    expect(newButtons.length).toBeGreaterThanOrEqual(3)
  })

  it('reminder summary is a one-column read-only hierarchy', () => {
    const summary = calendarPage.match(/title="Reminder Summary"[\s\S]*?<\/Modal>/)?.[0] || ''
    expect(summary).toContain('space-y-3')
    expect(summary).toContain('>Title<')
    expect(summary).toContain('>Status<')
    expect(summary).toContain('>Scheduled<')
    expect(summary).toContain('>Customer<')
    expect(summary).toContain('>Job<')
    expect(summary).toContain('>Notes<')
    // No two-column row floating Scheduled opposite Status
    expect(summary).not.toMatch(/grid-cols-2|justify-between[\s\S]*?Status[\s\S]*?Scheduled/)
  })

  it('Google Calendar row left-aligns with the first summary metric', () => {
    expect(calendarPage).toContain('flex items-center justify-start gap-1.5')
  })
})

describe('Batch 7F — schedule card stuck-hover fix', () => {
  it('schedule card rows and card actions use coarse-pointer-safe hover variants', () => {
    // Calendar page schedule cards — no utility-level plain hover:bg-slate-100
    // (the safe variant is always [@media(hover:hover)]:hover:..., i.e. the
    // hover utility is never preceded by whitespace or a quote)
    const plainCardHover = calendarPage.match(/[\s"']hover:bg-slate-100\b/g) || []
    expect(plainCardHover).toHaveLength(0)
    expect(calendarPage).toContain('[@media(hover:hover)]:hover:bg-slate-100')
    // TodaySchedule rows + quick actions
    expect(todaySchedule).toContain('[@media(hover:hover)]:hover:bg-slate-100')
    expect(todaySchedule).not.toMatch(/[\s"']hover:bg-amber-200/)
    expect(todaySchedule).not.toMatch(/[\s"']hover:bg-green-200/)
    // TasksTab card + checkbox + edit action
    expect(tasksTab).toContain('[@media(hover:hover)]:hover:border-blue-300')
    expect(tasksTab).toContain('[@media(hover:hover)]:hover:bg-amber-200')
    expect(tasksTab).toContain('[@media(hover:hover)]:hover:scale-105')
    expect(tasksTab).not.toMatch(/'hover:scale-105'/)
  })
})

describe('Batch 7F — customer card polish', () => {
  it('status pill allows ~148px for longer labels', () => {
    expect(statusDropdown).toContain('max-w-[148px]')
    expect(statusDropdown).not.toContain('max-w-[120px]')
  })

  it('timestamp lives in a bottom-right footer row under a thin divider', () => {
    expect(leadCard).toContain('border-t border-border/40')
    expect(leadCard).toContain('ml-auto text-[10px] sm:text-[11px]')
    expect(leadCard).toContain('formatRelativeTime(lead.last_activity_at || lead.created_at)')
    // Removed the standalone mid-card metadata row
    expect(leadCard).not.toContain('{/* Metadata */}')
  })
})

describe('Batch 7F — notification duplicate customer name', () => {
  it('suppresses the standalone subject line when the message body already starts with it', () => {
    expect(navbarNotifs).toContain('notification.message.startsWith(`${subject}:`)')
    // Display formatting only — payload untouched
    expect(navbarNotifs).toContain('resolveNotificationSubject(notification)')
  })
})

describe('Batch 7F — Help and account-deletion presentation', () => {
  it('ReplyFlow Help header has no icon and centers title/subtitle', () => {
    expect(assistant).not.toContain('MessageCircle')
    expect(assistant).toContain('<div className="text-center">')
    expect(assistant).toContain('ReplyFlow Help')
    // Close button stays, absolutely positioned so it cannot offset centering
    expect(assistant).toContain('absolute right-0 top-0')
  })

  it('account-deletion drops the public header and uses the in-app back control', () => {
    expect(accountDeletion).not.toContain('SSRSafeNavbar')
    expect(accountDeletion).not.toContain('Back to Home')
    expect(accountDeletion).toContain('AppBackButton')
    expect(accountDeletion).toContain('fallbackHref="/dashboard/settings"')
  })
})

describe('Batch 7F — inbound attachment retry', () => {
  it('has a bounded automatic retry policy (no infinite loop)', () => {
    expect(mediaRenderer).toContain('const MAX_RETRIES = 2')
    expect(mediaRenderer).toContain('currentRetries >= MAX_RETRIES')
    // Backoff grows per attempt
    expect(mediaRenderer).toContain('2000 * (currentRetries + 1)')
    // Retries only schedule while the item is still resolving
    expect(mediaRenderer).toContain('for (const mediaId of resolvingMedia)')
  })

  it('video failures are tracked and terminally actionable', () => {
    expect(mediaRenderer).toContain('onError={() => handleImageError(mediaItem.id)}')
    expect(mediaRenderer).toContain("Couldn't load video")
    expect(mediaRenderer).toContain('aria-label="Retry loading video"')
    // No autoplay on retry or normal render
    expect(mediaRenderer).not.toContain('autoPlay')
    // Video remounts on manual retry via the load nonce
    expect(mediaRenderer).toContain('key={`${mediaItem.id}-${loadNonces[mediaItem.id] || 0}`}')
  })

  it('document/fallback failures keep identity and become actionable after retries exhaust', () => {
    expect(mediaRenderer).toContain('truncateFilename')
    expect(mediaRenderer).toContain('getFileTypeLabel(mediaItem.mime_type)')
    expect(mediaRenderer).toContain('Couldn’t load · Retry')
    expect(mediaRenderer).toContain('aria-label="Retry loading attachment"')
    // No permanently dead "Unavailable"/fake-loading end state
    expect(mediaRenderer).not.toContain('>Unavailable<')
    expect(mediaRenderer).not.toContain('Attachment unavailable')
    expect(mediaRenderer).not.toContain('Video failed to load')
  })

  it('manual retry resets the budget and re-enters the resolution pipeline', () => {
    expect(mediaRenderer).toContain('const handleManualRetry')
    expect(mediaRenderer).toContain('setRetryCount(prev => ({ ...prev, [id]: 0 }))')
    expect(mediaRenderer).toContain('setResolvingMedia(prev => new Set(prev).add(id))')
  })

  it('expired MMS media tokens recover via the canonical recover-url endpoint', () => {
    expect(mediaRenderer).toContain('/api/mms-media/recover-url')
  })

  it('a dead expanded-viewer image closes back to the actionable card', () => {
    expect(mediaRenderer).toContain('onError={handleCloseExpanded}')
  })
})

describe('Batch 7F — outbound attachment send failure', () => {
  it('marks MMS optimistic messages failed on HTTP errors (no isMMS gate)', () => {
    const failureBlock = leadClient.match(/if \(!response\.ok\) \{[\s\S]*?optimistic-failed[\s\S]*?\}\)\s*\}/)?.[0] || ''
    expect(failureBlock).toBeTruthy()
    expect(failureBlock).not.toContain('!isMMS')
    expect(failureBlock).toContain("status: 'failed'")
    // Media stays on the failed bubble so the attachment remains visible
    expect(leadClient).toContain('failedPreviewMedia')
  })

  it('retains File objects per failed clientMessageId for the bubble retry', () => {
    expect(leadClient).toContain('failedMediaFilesRef')
    expect(leadClient).toContain('failedMediaFilesRef.current.set(clientMessageId, submittedMediaFiles)')
    // Consumed when the same files are resent via the composer
    expect(leadClient).toContain('failedMediaFilesRef.current.delete(failedId)')
  })

  it('retries reuse the failed message identity — no fresh UUID per attempt', () => {
    expect(leadClient).toContain('const retryClientMessageId = clientTempId || crypto.randomUUID()')
    // The lists pass the canonical message identity, not an always-undefined field
    for (const list of [mobileList, desktopList]) {
      expect(list).toContain('msg.clientTempId || msg.clientMessageId || msg.client_message_id')
    }
  })

  it('media retry resends FormData through the same idempotent endpoint', () => {
    const retryFn = leadClient.match(/const handleRetry = async[\s\S]*?setSending\(false\)\s*\}/)?.[0] || ''
    expect(retryFn).toContain('new FormData()')
    expect(retryFn).toContain("formData.append('clientMessageId', retryClientMessageId)")
    expect(retryFn).toContain('formData.append(`media_${index}`, file)')
    expect(retryFn).toContain('/api/send-sms')
  })

  it('media retry is guarded and cannot spam duplicate sends', () => {
    const retryFn = leadClient.match(/const handleRetry = async[\s\S]*?setSending\(false\)\s*\}/)?.[0] || ''
    expect(retryFn).toContain('if (sending) return')
    expect(retryFn).toContain('if (hasMedia && !retainedFiles) return')
    // Files pulled back out of the composer while retrying
    expect(retryFn).toContain('setMobileImages([])')
    // Retention consumed on success
    expect(retryFn).toContain('failedMediaFilesRef.current.delete(')
  })

  it('lists hide the retry affordance for media that can no longer be recovered', () => {
    expect(leadClient).toContain('const canRetryMessage')
    expect(leadClient).toContain('failedMediaFilesRef.current.has(key)')
    for (const list of [mobileList, desktopList]) {
      expect(list).toContain('canRetryMessage?: (msg: any) => boolean')
      expect(list).toContain('canRetryMessage ? canRetryMessage(msg) : true')
    }
    // Wired at every list call site
    const callSites = leadClient.match(/canRetryMessage=\{canRetryMessage\}/g) || []
    expect(callSites.length).toBeGreaterThanOrEqual(4)
  })
})

describe('Batch 7F — appointment customer picker hierarchy (unchanged contract)', () => {
  it('shared pickers keep the PickerListRow primary/secondary/tertiary hierarchy', () => {
    const pickerRow = read('src/components/ui/PickerListRow.tsx')
    const customerSelect = read('src/components/customers/SearchableCustomerSelect.tsx')
    const leadPicker = read('src/components/jobs/LeadPickerModal.tsx')
    expect(customerSelect).toContain('PickerListRow')
    expect(leadPicker).toContain('PickerListRow')
    // Primary + optional secondary + tertiary metadata + check
    expect(pickerRow).toMatch(/primary/i)
    expect(pickerRow).toMatch(/secondary|subtitle/i)
    expect(pickerRow).toMatch(/tertiary|meta/i)
  })
})
