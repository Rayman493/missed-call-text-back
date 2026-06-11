export interface HelpArticle {
  id: string
  keywords: string[]
  question: string
  answer: string
  category: string
  source: string
}

export interface HelpContext {
  currentPage?: 'dashboard' | 'leads' | 'lead-detail' | 'calendar' | 'settings' | 'onboarding'
  hasLeads?: boolean
  hasRecentActivity?: boolean
  forwardingVerified?: boolean
  calendarConnected?: boolean
  hasNotifications?: boolean
  isTrial?: boolean
}

export const KNOWLEDGE_BASE: HelpArticle[] = [
  {
    id: 'forwarding-direction',
    keywords: ['forward', 'direction', 'which number', 'forwarding setup', 'common mistake'],
    question: 'Which number do I forward?',
    answer: 'Forward YOUR BUSINESS NUMBER TO the ReplyFlow number. Do NOT forward the ReplyFlow number to your business number. Your customers still call your normal business number, and when you don\'t answer, the call forwards to ReplyFlow.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide'
  },
  {
    id: 'verizon-forwarding',
    keywords: ['verizon', 'forwarding code', 'verizon code', 'how to forward verizon'],
    question: 'How do I forward calls on Verizon?',
    answer: 'Dial *71 followed by the ReplyFlow number on your business phone. For example: *71 1-412-555-0123. You\'ll hear a confirmation tone when it\'s enabled.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide'
  },
  {
    id: 'att-forwarding',
    keywords: ['at&t', 'att', 'forwarding code', 'at&t code', 'how to forward at&t'],
    question: 'How do I forward calls on AT&T?',
    answer: 'Dial *004* followed by the ReplyFlow number, then #. For example: *004*14125550123#. You\'ll hear a confirmation tone when it\'s enabled.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide'
  },
  {
    id: 'tmobile-forwarding',
    keywords: ['t-mobile', 'tmobile', 'forwarding code', 't-mobile code', 'how to forward t-mobile'],
    question: 'How do I forward calls on T-Mobile?',
    answer: 'Dial **21* followed by the ReplyFlow number, then #. For example: **21*14125550123#. You\'ll hear a confirmation tone when it\'s enabled.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide'
  },
  {
    id: 'voip-forwarding',
    keywords: ['voip', 'ringcentral', '8x8', 'grasshopper', 'google voice', 'forwarding web'],
    question: 'How do I forward calls with VoIP providers?',
    answer: 'If you use RingCentral, 8x8, Grasshopper, Google Voice, or other VoIP providers, you typically set up forwarding through their website dashboard instead of dialing codes on your phone. Look for "Call Forwarding" or "Forwarding Settings" in your provider\'s online portal.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide'
  },
  {
    id: 'test-call-second-phone',
    keywords: ['test call', 'second phone', 'why different phone', 'test from business phone'],
    question: 'Why can\'t I call from my business phone to test?',
    answer: 'Call forwarding doesn\'t work from the same phone being forwarded. If you call from your business phone, the call won\'t forward to ReplyFlow. You must call from a different phone (like your personal cell phone) to test the setup.',
    category: 'Testing',
    source: 'Beta FAQ'
  },
  {
    id: 'sms-timing',
    keywords: ['sms timing', 'how long', 'when text', 'text delay', 'sms not arriving'],
    question: 'How long until I receive the auto-reply text?',
    answer: 'SMS typically arrives within 1-2 minutes after the missed call. Some carriers may take up to 5 minutes. If you don\'t receive the text after 2-3 minutes, try the test call again.',
    category: 'Testing',
    source: 'Beta FAQ'
  },
  {
    id: 'mms-photos',
    keywords: ['mms', 'photos', 'images', 'pictures', 'send photos'],
    question: 'Can customers send photos?',
    answer: 'Yes. Customers can send photos via MMS and they\'ll appear in your conversation threads with thumbnails. JPG, PNG, WEBP, and most common image formats are supported.',
    category: 'Features',
    source: 'Beta FAQ'
  },
  {
    id: 'google-calendar',
    keywords: ['calendar', 'google calendar', 'appointments', 'sync'],
    question: 'Is Google Calendar required?',
    answer: 'No. Google Calendar is optional and only needed if you want to sync appointments with your calendar. To connect, go to Dashboard → Calendar → Connect Google Calendar.',
    category: 'Features',
    source: 'Beta FAQ'
  },
  {
    id: 'pricing',
    keywords: ['pricing', 'cost', 'price', 'how much', 'subscription'],
    question: 'How much does ReplyFlow cost?',
    answer: 'ReplyFlow is $49/month with a 14-day free trial. No contracts required. Cancel anytime.',
    category: 'Billing',
    source: 'Pricing Page'
  },
  {
    id: 'trial-billing',
    keywords: ['trial', 'free trial', 'charged during trial', 'trial cost'],
    question: 'Will I be charged during the trial?',
    answer: 'No. The trial is free with no charge. You\'ll only be charged after the trial ends if you choose to continue.',
    category: 'Billing',
    source: 'Beta FAQ'
  },
  {
    id: 'cancel-trial',
    keywords: ['cancel', 'cancel trial', 'cancel subscription', 'how to cancel'],
    question: 'How do I cancel before the trial ends?',
    answer: 'Go to Dashboard → Settings → Subscription and click "Cancel Subscription." No charges will be made if you cancel before the trial ends.',
    category: 'Billing',
    source: 'Beta FAQ'
  },
  {
    id: 'ai-voicemail',
    keywords: ['ai', 'voicemail', 'ai voicemail', 'ai intake', 'voicemail intake'],
    question: 'How does AI voicemail intake work?',
    answer: 'When a call goes unanswered and forwards to ReplyFlow, AI captures caller information through voicemail. AI voicemail intake can capture the caller\'s name, reason for calling, urgency level, and preferred callback time.',
    category: 'Features',
    source: 'FAQ'
  },
  {
    id: 'ai-without-voicemail',
    keywords: ['ai without voicemail', 'sms only', 'no ai'],
    question: 'Can I use ReplyFlow without AI?',
    answer: 'Yes. Businesses can use SMS-only workflows without enabling AI voicemail intake. ReplyFlow offers flexible options - you can use traditional missed-call text responses, or enable AI voicemail intake for caller information capture.',
    category: 'Features',
    source: 'FAQ'
  },
  {
    id: 'customer-corrections',
    keywords: ['correction', 'address correction', 'customer reply address'],
    question: 'Can customers correct their address?',
    answer: 'Yes. ReplyFlow can detect and process address corrections from customer replies. When a customer provides a corrected address in their message, ReplyFlow extracts and updates the lead metadata with the new address information.',
    category: 'Features',
    source: 'Feature Documentation'
  },
  {
    id: 'keep-number',
    keywords: ['keep number', 'existing number', 'business number', 'change number'],
    question: 'Do I keep my existing business number?',
    answer: 'Yes, completely. Your business keeps its existing public phone number. Customers continue calling your published business number. ReplyFlow works seamlessly in the background - when calls go unanswered, they forward to ReplyFlow for automated text responses.',
    category: 'Setup',
    source: 'FAQ'
  },
  {
    id: 'different-number-text',
    keywords: ['different number', 'why different number', 'text from different number'],
    question: 'Why does the text come from a different number?',
    answer: 'ReplyFlow provides a dedicated messaging line so conversations remain organized and customers can continue texting you after the missed call. Your existing business phone number remains unchanged. The ReplyFlow messaging number appears in customer text conversations, but your business number stays the same for all incoming calls.',
    category: 'Setup',
    source: 'FAQ'
  },
  {
    id: 'setup-time',
    keywords: ['setup time', 'how long to setup', 'installation time'],
    question: 'How long does setup take?',
    answer: 'Setup takes under 5 minutes. You select your carrier, dial the forwarding code on your business phone, and make a test call. That\'s it.',
    category: 'Setup',
    source: 'Homepage'
  },
  {
    id: 'tcpa-compliance',
    keywords: ['tcpa', 'compliance', 'legal', 'marketing texts'],
    question: 'Is ReplyFlow TCPA compliant?',
    answer: 'ReplyFlow supports compliant conversational messaging workflows. Messages are only sent after customers initiate contact by calling your business. Messages relate directly to the missed call interaction. Full opt-out support is included - STOP and HELP keywords are automatically processed.',
    category: 'Compliance',
    source: 'FAQ'
  },
  {
    id: 'opt-out',
    keywords: ['opt out', 'stop', 'help', 'unsubscribe'],
    question: 'Can customers opt out?',
    answer: 'Yes, absolutely. ReplyFlow supports full compliance with opt-out requirements. Customers can reply "STOP" to immediately opt out of all future messages, or "HELP" to get support contact information. All opt-out requests are processed immediately.',
    category: 'Compliance',
    source: 'FAQ'
  },
  {
    id: 'cancel-forwarding',
    keywords: ['disable forwarding', 'turn off', 'stop forwarding', 'cancel forwarding'],
    question: 'How do I disable call forwarding?',
    answer: 'To disable forwarding, dial your carrier\'s disable code from your business phone. Verizon: *73, AT&T: ##004#, T-Mobile: ##004#, Comcast/Xfinity: *73. For VoIP providers, use the disable option in their web dashboard.',
    category: 'Setup',
    source: 'FAQ'
  },
  {
    id: 'metrics-zero',
    keywords: ['metrics zero', 'why metrics zero', 'dashboard zero', 'no metrics'],
    question: 'Why are my metrics zero?',
    answer: 'Your metrics will be zero until you receive your first missed call. Make sure call forwarding is set up correctly, then test with a call from a different phone. Metrics update in real-time after each missed call.',
    category: 'Dashboard',
    source: 'FAQ'
  },
  {
    id: 'test-replyflow',
    keywords: ['test replyflow', 'how to test', 'testing replyflow'],
    question: 'How do I test ReplyFlow?',
    answer: 'Call your business number from a different phone (not your business phone). Let it ring until it forwards to ReplyFlow. You should receive an automated text message within 1-2 minutes. You can then reply to test the conversation.',
    category: 'Dashboard',
    source: 'FAQ'
  },
  {
    id: 'active-conversation',
    keywords: ['active conversation', 'what is active conversation', 'conversation status'],
    question: 'What does Active Conversation mean?',
    answer: 'An "Active Conversation" is a lead you\'ve exchanged messages with in the last 7 days. These leads are prioritized in your dashboard as they represent current customer relationships that may need attention.',
    category: 'Dashboard',
    source: 'FAQ'
  },
  {
    id: 'lead-statuses',
    keywords: ['lead status', 'statuses', 'what do statuses mean', 'lead meaning'],
    question: 'What do lead statuses mean?',
    answer: 'New: No messages sent yet. Active: Ongoing conversation. Replied: Customer has responded. Ignored: You\'ve marked as not interested. Completed: Issue resolved. Statuses help you track lead progress.',
    category: 'Leads',
    source: 'FAQ'
  },
  {
    id: 'reply-customer',
    keywords: ['reply to customer', 'send message', 'how to reply'],
    question: 'How do I reply to a customer?',
    answer: 'Go to the Leads page, click on a lead, and type your message in the composer at the bottom. Press Enter to send. You can also send photos by clicking the image icon. Messages are sent instantly.',
    category: 'Leads',
    source: 'FAQ'
  },
  {
    id: 'follow-ups-work',
    keywords: ['follow-ups', 'automatic follow-up', 'how follow-ups work'],
    question: 'How do follow-ups work?',
    answer: 'ReplyFlow can automatically send follow-up messages to customers who don\'t reply. You can configure follow-up sequences in Settings. Follow-ups help re-engage leads and prevent lost opportunities.',
    category: 'Leads',
    source: 'FAQ'
  },
  {
    id: 'ai-intake-meaning',
    keywords: ['ai intake', 'ai summary', 'what does ai intake mean', 'ai summary meaning'],
    question: 'What does this AI intake mean?',
    answer: 'AI intake is information captured when a customer calls and leaves a voicemail. It includes the caller\'s name, reason for calling, urgency level, and preferred callback time. This helps you understand customer needs before you reply.',
    category: 'Lead Detail',
    source: 'FAQ'
  },
  {
    id: 'pause-followups',
    keywords: ['pause follow-ups', 'stop follow-ups', 'disable follow-ups'],
    question: 'How do I pause follow-ups?',
    answer: 'Go to the lead detail page and click "Pause Follow-ups" in the Quick Actions section. This stops automatic follow-up messages for that specific lead. You can resume follow-ups at any time.',
    category: 'Lead Detail',
    source: 'FAQ'
  },
  {
    id: 'manual-reply',
    keywords: ['manual reply', 'send manual message', 'custom message'],
    question: 'Can I send a manual reply?',
    answer: 'Yes. In the lead detail page, type your message in the composer at the bottom and press Enter. Manual replies are sent instantly and override any automated follow-up schedules for that lead.',
    category: 'Lead Detail',
    source: 'FAQ'
  },
  {
    id: 'connect-google-calendar',
    keywords: ['connect google calendar', 'google calendar setup', 'calendar connection'],
    question: 'How do I connect Google Calendar?',
    answer: 'Go to Dashboard → Calendar and click "Connect Google Calendar." You\'ll be prompted to authorize ReplyFlow to access your calendar. Once connected, appointments from conversations will sync to your calendar.',
    category: 'Calendar',
    source: 'FAQ'
  },
  {
    id: 'events-not-showing',
    keywords: ['events not showing', 'calendar not syncing', 'no events'],
    question: 'Why are events not showing?',
    answer: 'Make sure Google Calendar is connected and authorized. Check that appointments have dates/times set in conversations. Events sync within 5 minutes of being created. Try refreshing the calendar page.',
    category: 'Calendar',
    source: 'FAQ'
  },
  {
    id: 'change-business-hours',
    keywords: ['business hours', 'change hours', 'update hours'],
    question: 'How do I change business hours?',
    answer: 'Go to Dashboard → Settings → Business Hours. Set your operating hours and time zone. This helps ReplyFlow know when to expect responses and can be used for scheduling follow-ups.',
    category: 'Settings',
    source: 'FAQ'
  },
  {
    id: 'update-forwarding',
    keywords: ['update forwarding', 'change forwarding', 'forwarding settings'],
    question: 'How do I update call forwarding?',
    answer: 'If you need to change the ReplyFlow number, first disable forwarding on your business phone using your carrier\'s disable code. Then dial the new forwarding code with the updated ReplyFlow number. Test with a call from a different phone.',
    category: 'Settings',
    source: 'FAQ'
  },
  {
    id: 'set-up-forwarding',
    keywords: ['set up forwarding', 'forwarding setup', 'how to forward'],
    question: 'How do I set up call forwarding?',
    answer: 'Select your carrier in the setup instructions. Dial the forwarding code followed by your ReplyFlow number on your business phone. For example, on Verizon dial *71 followed by the ReplyFlow number. You\'ll hear a confirmation tone when enabled.',
    category: 'Onboarding',
    source: 'Onboarding Guide'
  },
  {
    id: 'carrier-instructions',
    keywords: ['carrier instructions', 'which carrier', 'carrier codes'],
    question: 'Which carrier instructions should I use?',
    answer: 'Use the instructions for your business phone carrier (Verizon, AT&T, T-Mobile, etc.). If you use a VoIP provider (RingCentral, Google Voice, etc.), use the VoIP instructions and set up forwarding through their web dashboard.',
    category: 'Onboarding',
    source: 'Onboarding Guide'
  },
  {
    id: 'test-call-failed',
    keywords: ['test call failed', 'test not working', 'forwarding not working'],
    question: 'Why didn\'t my test call work?',
    answer: 'Common issues: 1) You called from your business phone (call forwarding doesn\'t work from the same phone), 2) Forwarding not enabled correctly, 3) Wrong carrier code used. Always test from a different phone.',
    category: 'Onboarding',
    source: 'Onboarding Guide'
  },
  {
    id: 'no-lead-appeared',
    keywords: ['no lead', 'lead not showing', 'lead missing', 'call didn\'t show', 'call not in dashboard', 'where is my lead', 'lead not created'],
    question: 'No lead appeared after my test call',
    answer: 'If no lead appeared: 1) Verify forwarding is active by calling from a different phone, 2) Check that the call actually forwarded to ReplyFlow (you should hear the ReplyFlow voicemail), 3) Allow 1-2 minutes for the lead to appear in your dashboard, 4) Check the Leads page to see if the lead was created. If the call didn\'t forward, re-check your carrier forwarding setup.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'sms-not-sent',
    keywords: ['sms not sent', 'text not sent', 'message not delivered', 'sms failed', 'no text received', 'text didn\'t arrive', 'delivery failed'],
    question: 'SMS did not send after missed call',
    answer: 'If no SMS was sent: 1) Check that the lead exists in your dashboard, 2) Verify your ReplyFlow messaging number is active, 3) Some carriers may delay SMS delivery by 2-5 minutes, 4) Check if the customer\'s carrier is blocking short codes or automated messages, 5) Try sending a manual message from the lead detail page to test SMS functionality. If issues persist, contact support.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'ai-intake-incomplete',
    keywords: ['ai incomplete', 'ai missed details', 'ai not working', 'ai partial', 'intake incomplete', 'ai didn\'t capture', 'missing ai data'],
    question: 'AI intake is incomplete or missing details',
    answer: 'AI intake depends on voicemail quality. If details are missing: 1) The caller may not have provided the information, 2) Voicemail may have been unclear or cut off, 3) Background noise can interfere with AI transcription. You can manually add details to the lead. AI intake is designed to capture what\'s available from the voicemail.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'caller-hung-up-early',
    keywords: ['caller hung up', 'caller hung up early', 'short call', 'no voicemail', 'caller didn\'t leave message', 'quick hangup'],
    question: 'Caller hung up before voicemail',
    answer: 'If the caller hung up before voicemail, AI intake cannot capture information. However, ReplyFlow will still create a lead and send an automated text response. The lead will show the caller\'s phone number and call time, but AI intake details will be minimal or absent.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'partial-intake',
    keywords: ['partial intake', 'some details missing', 'incomplete data', 'partial ai', 'missing information'],
    question: 'AI intake has partial information',
    answer: 'Partial intake is normal when the voicemail doesn\'t contain all information. AI captures what it can from the voicemail. You can manually add missing details to the lead. ReplyFlow is designed to assist with intake, not guarantee complete data capture from every call.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'duplicate-lead',
    keywords: ['duplicate lead', 'same lead twice', 'duplicate entry', 'lead appeared twice'],
    question: 'Duplicate lead or duplicate SMS',
    answer: 'ReplyFlow uses phone number matching to prevent duplicate leads. If you see duplicates: 1) Check if the caller used different phone numbers, 2) Verify the leads are actually the same customer, 3) Duplicate SMS may occur if the system retries delivery. Contact support if you see persistent duplicates.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'follow-ups-not-sending',
    keywords: ['follow-ups not sending', 'follow-up failed', 'no follow-up', 'follow-up not working', 'automation not sending'],
    question: 'Follow-ups are not sending',
    answer: 'If follow-ups aren\'t sending: 1) Check that follow-ups are enabled in Settings, 2) Verify the lead status allows follow-ups (ignored/completed leads may not receive follow-ups), 3) Check that the customer hasn\'t opted out by replying STOP, 4) Review the follow-up schedule configuration. You can also manually send follow-ups from the lead detail page.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'customer-replied-automation-active',
    keywords: ['customer replied', 'automation still active', 'customer responded', 'automation didn\'t stop', 'follow-up after reply'],
    question: 'Customer replied but automation still active',
    answer: 'When a customer replies, ReplyFlow marks the lead as "Replied" and should pause automated follow-ups. If automation continues: 1) Check the lead status is "Replied", 2) Manually pause follow-ups from the lead detail page using "Pause Follow-ups", 3) Review your follow-up settings to ensure replies are handled correctly.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'calendar-not-connected',
    keywords: ['calendar not connected', 'calendar sync failed', 'calendar not working', 'google calendar error', 'calendar connection issue'],
    question: 'Calendar not connected or not syncing',
    answer: 'If calendar isn\'t connected: 1) Go to Dashboard → Calendar and click "Connect Google Calendar", 2) Ensure you authorize the connection when prompted, 3) Check that you\'re not blocking pop-ups, 4) Verify your Google account has calendar access. If connected but not syncing: Check that conversations have appointment dates/times set. Events sync within 5 minutes.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'forwarding-not-working',
    keywords: ['forwarding not working', 'forwarding broken', 'calls not forwarding', 'forwarding setup failed'],
    question: 'Call forwarding is not working',
    answer: 'If calls aren\'t forwarding: 1) Verify you used the correct carrier code, 2) Confirm you dialed the code on your business phone (not a different phone), 3) Test by calling from a different phone, 4) Check with your carrier that forwarding is enabled on your line, 5) For VoIP providers, check the web dashboard settings. Verizon: *73 to disable, *71+number to enable. AT&T: ##004# to disable, *004*number# to enable.',
    category: 'Troubleshooting',
    source: 'Support Guide'
  },
  {
    id: 'disable-forwarding',
    keywords: ['disable forwarding', 'turn off forwarding', 'stop forwarding', 'cancel forwarding', 'how to disable'],
    question: 'How do I disable call forwarding?',
    answer: 'To disable forwarding, dial your carrier\'s disable code from your business phone. Verizon: *73, AT&T: ##004#, T-Mobile: ##004#, Comcast/Xfinity: *73. For VoIP providers, use the disable option in their web dashboard. After disabling, test by calling your business number to confirm calls ring normally.',
    category: 'Setup',
    source: 'FAQ'
  },
  {
    id: 'replyflow-limitations',
    keywords: ['limitations', 'what replyflow can\'t do', 'what replyflow does', 'replyflow capabilities', 'cannot do', 'not control'],
    question: 'What can and can\'t ReplyFlow do?',
    answer: 'ReplyFlow helps recover missed calls and collect caller details through AI voicemail intake. It sends automated text responses and can manage follow-up sequences. ReplyFlow does NOT control your carrier forwarding settings directly, cannot guarantee SMS delivery if carriers block messages, does not answer live calls, and cannot prevent all missed calls. You control forwarding through your carrier.',
    category: 'Features',
    source: 'Product Guide'
  },
  {
    id: 'live-calls',
    keywords: ['live calls', 'answer live calls', 'does it answer calls', 'real-time calls', 'answer phone'],
    question: 'Does ReplyFlow answer live calls?',
    answer: 'No. ReplyFlow only handles calls that forward to it when you don\'t answer. It does not answer live calls or replace your existing phone service. When a call forwards to ReplyFlow (because you didn\'t answer), it can send an automated text response and capture AI intake from voicemail.',
    category: 'Features',
    source: 'FAQ'
  },
  {
    id: 'billing-trial-details',
    keywords: ['billing details', 'trial details', 'how billing works', 'when charged', 'trial end', 'subscription details'],
    question: 'How does billing and trial work?',
    answer: 'ReplyFlow offers a 14-day free trial with no charge. After the trial ends, you\'ll be charged $49/month if you choose to continue. You can cancel anytime before the trial ends with no charge. Billing is handled through Stripe. View your subscription status in Dashboard → Settings → Subscription.',
    category: 'Billing',
    source: 'Billing Guide'
  },
  {
    id: 'contact-support',
    keywords: ['contact support', 'support email', 'help', 'get help', 'talk to support', 'support contact'],
    question: 'How do I contact support?',
    answer: 'For account-specific issues, SMS delivery failures, billing questions, or technical problems, email support at support@replyflowhq.com. Include your business name and a description of the issue. For general questions, use this help assistant to search our knowledge base.',
    category: 'Support',
    source: 'Support Guide'
  }
]

// Account-specific guardrail keywords
const ACCOUNT_SPECIFIC_KEYWORDS = [
  'why did my sms fail',
  'sms failed',
  'message not delivered',
  'delivery failed',
  'why didn\'t my lead appear',
  'lead not showing',
  'missing lead',
  'why was i charged',
  'unexpected charge',
  'billing error',
  'why did my ai call fail',
  'ai not working',
  'voicemail not working',
  'my specific',
  'my account',
  'why didn\'t it work for me',
  'why is it not working'
]

// Synonym mappings for better matching
const SYNONYM_MAP: Record<string, string[]> = {
  'text': ['sms', 'message', 'txt'],
  'forward': ['forwarding', 'divert', 'redirect'],
  'call': ['phone', 'ring'],
  'lead': ['customer', 'caller', 'prospect'],
  'setup': ['install', 'configure', 'configure'],
  'connect': ['link', 'sync', 'integrate'],
  'fail': ['failed', 'error', 'not working', 'broken'],
  'problem': ['issue', 'trouble', 'difficulty'],
  'help': ['support', 'assist', 'guide']
}

// Failure language keywords to prioritize troubleshooting
const FAILURE_KEYWORDS = [
  'fail', 'failed', 'error', 'not working', 'broken', 'not sent', 'not showing',
  'missing', 'didn\'t', 'doesn\'t', 'won\'t', 'can\'t', 'unable', 'issue', 'problem'
]

export function searchKnowledgeBase(query: string, context?: HelpContext): HelpArticle | null {
  const normalizedQuery = query.toLowerCase().trim()
  
  // Check for account-specific questions first
  for (const keyword of ACCOUNT_SPECIFIC_KEYWORDS) {
    if (normalizedQuery.includes(keyword)) {
      return null // Will trigger account-specific fallback
    }
  }
  
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2)
  
  // Expand query with synonyms
  const expandedQueryWords = [...queryWords]
  for (const word of queryWords) {
    const synonyms = SYNONYM_MAP[word]
    if (synonyms) {
      expandedQueryWords.push(...synonyms)
    }
  }
  
  let bestMatch: HelpArticle | null = null
  let bestScore = 0
  
  // Check if query contains failure language
  const hasFailureLanguage = FAILURE_KEYWORDS.some(kw => normalizedQuery.includes(kw))
  
  for (const article of KNOWLEDGE_BASE) {
    let score = 0
    
    // Check exact question match
    if (article.question.toLowerCase() === normalizedQuery) {
      return article
    }
    
    // Boost troubleshooting articles for failure language
    if (hasFailureLanguage && article.category === 'Troubleshooting') {
      score += 5
    }
    
    // Check keyword matches
    for (const keyword of article.keywords) {
      const normalizedKeyword = keyword.toLowerCase()
      if (normalizedQuery.includes(normalizedKeyword)) {
        score += 3
      }
    }
    
    // Check expanded word matches in keywords
    for (const queryWord of expandedQueryWords) {
      for (const keyword of article.keywords) {
        if (keyword.toLowerCase().includes(queryWord) || queryWord.includes(keyword.toLowerCase())) {
          score += 1
        }
      }
    }
    
    // Check word matches in question
    const questionWords = article.question.toLowerCase().split(/\s+/)
    for (const queryWord of queryWords) {
      for (const questionWord of questionWords) {
        if (queryWord === questionWord) {
          score += 2
        }
      }
    }
    
    // Context-based boosting
    if (context) {
      // Boost forwarding articles if forwarding not verified
      if (context.forwardingVerified === false && article.category === 'Troubleshooting' && 
          (article.id.includes('forwarding') || article.id.includes('test-call'))) {
        score += 3
      }
      
      // Boost calendar articles if calendar not connected
      if (context.calendarConnected === false && article.category === 'Troubleshooting' &&
          article.id.includes('calendar')) {
        score += 3
      }
      
      // Boost lead/troubleshooting articles if no leads
      if (context.hasLeads === false && article.category === 'Troubleshooting' &&
          (article.id.includes('lead') || article.id.includes('test'))) {
        score += 3
      }
      
      // Boost billing articles if on trial
      if (context.isTrial && article.category === 'Billing') {
        score += 2
      }
    }
    
    if (score > bestScore) {
      bestScore = score
      bestMatch = article
    }
  }
  
  // Only return if we have a meaningful match
  if (bestMatch && bestScore >= 1) {
    return bestMatch
  }
  
  return null
}

export function getRelatedArticles(articleId: string, limit: number = 3): HelpArticle[] {
  const currentArticle = KNOWLEDGE_BASE.find(a => a.id === articleId)
  if (!currentArticle) return []
  
  const scored = KNOWLEDGE_BASE
    .filter(a => a.id !== articleId)
    .map(article => {
      let score = 0
      if (article.category === currentArticle.category) score += 2
      for (const keyword of currentArticle.keywords) {
        if (article.keywords.some(k => k.toLowerCase().includes(keyword.toLowerCase()))) {
          score += 1
        }
      }
      return { article, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.article)
  
  return scored
}

export function getSuggestedQuestions(category?: string, context?: HelpContext): HelpArticle[] {
  let articles = KNOWLEDGE_BASE

  // Page-specific suggested questions
  if (context?.currentPage) {
    const pageQuestions = getPageSpecificQuestions(context.currentPage, context)
    if (pageQuestions.length > 0) {
      return pageQuestions.slice(0, 4)
    }
  }

  // Contextual suggestions based on user state
  if (context) {
    const contextualQuestions = getContextualQuestions(context)
    if (contextualQuestions.length > 0) {
      return contextualQuestions.slice(0, 4)
    }
  }

  // Default to category-based or priority questions
  if (category) {
    articles = articles.filter(a => a.category === category)
  }

  // Return a mix of common questions from different categories
  const priorityIds = [
    'forwarding-direction',
    'verizon-forwarding',
    'att-forwarding',
    'tmobile-forwarding',
    'test-call-second-phone',
    'sms-timing',
    'pricing',
    'trial-billing'
  ]

  return articles
    .filter(a => priorityIds.includes(a.id))
    .sort((a, b) => priorityIds.indexOf(a.id) - priorityIds.indexOf(b.id))
    .slice(0, 5)
}

function getPageSpecificQuestions(page: string, context: HelpContext): HelpArticle[] {
  const pageArticleIds: Record<string, string[]> = {
    dashboard: ['metrics-zero', 'test-replyflow', 'active-conversation', 'no-lead-appeared', 'forwarding-not-working'],
    leads: ['lead-statuses', 'reply-customer', 'follow-ups-work', 'follow-ups-not-sending', 'duplicate-lead'],
    'lead-detail': ['ai-intake-meaning', 'pause-followups', 'manual-reply', 'ai-intake-incomplete', 'partial-intake'],
    calendar: ['connect-google-calendar', 'events-not-showing', 'calendar-not-connected'],
    settings: ['change-business-hours', 'update-forwarding', 'disable-forwarding', 'replyflow-limitations'],
    onboarding: ['set-up-forwarding', 'carrier-instructions', 'test-call-failed', 'forwarding-direction']
  }

  const ids = pageArticleIds[page] || []
  const articles = KNOWLEDGE_BASE.filter(a => ids.includes(a.id))

  // If no page-specific articles exist, return empty array to fall through to contextual
  if (articles.length === 0) return []

  return articles
}

function getContextualQuestions(context: HelpContext): HelpArticle[] {
  const ids: string[] = []

  // Prioritize setup help for new users
  if (!context.hasLeads) {
    ids.push('forwarding-direction', 'test-call-second-phone', 'setup-time', 'no-lead-appeared')
  }

  // Prioritize forwarding troubleshooting
  if (context.forwardingVerified === false) {
    ids.push('forwarding-direction', 'test-call-second-phone', 'cancel-forwarding', 'forwarding-not-working', 'test-call-failed')
  }

  // Prioritize calendar setup if not connected
  if (context.calendarConnected === false) {
    ids.push('google-calendar', 'calendar-not-connected')
  }

  // Prioritize lead management for users with leads
  if (context.hasLeads) {
    ids.push('lead-statuses', 'reply-customer', 'follow-ups-work', 'follow-ups-not-sending')
  }

  // Prioritize activity/conversation help for users with recent activity
  if (context.hasRecentActivity) {
    ids.push('sms-timing', 'mms-photos', 'customer-replied-automation-active')
  }

  // Prioritize trial/billing help for trial users
  if (context.isTrial) {
    ids.push('billing-trial-details', 'trial-billing', 'cancel-trial')
  }

  const articles = KNOWLEDGE_BASE.filter(a => ids.includes(a.id))
  return articles
}
