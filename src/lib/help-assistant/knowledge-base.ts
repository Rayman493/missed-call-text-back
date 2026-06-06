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

export function searchKnowledgeBase(query: string): HelpArticle | null {
  const normalizedQuery = query.toLowerCase().trim()
  
  // Check for account-specific questions
  for (const keyword of ACCOUNT_SPECIFIC_KEYWORDS) {
    if (normalizedQuery.includes(keyword)) {
      return null // Will trigger account-specific fallback
    }
  }
  
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2)
  
  let bestMatch: HelpArticle | null = null
  let bestScore = 0
  
  for (const article of KNOWLEDGE_BASE) {
    let score = 0
    
    // Check exact question match
    if (article.question.toLowerCase() === normalizedQuery) {
      return article
    }
    
    // Check keyword matches
    for (const keyword of article.keywords) {
      const normalizedKeyword = keyword.toLowerCase()
      if (normalizedQuery.includes(normalizedKeyword)) {
        score += 3
      }
    }
    
    // Check word matches in keywords
    for (const queryWord of queryWords) {
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
    dashboard: ['metrics-zero', 'test-replyflow', 'active-conversation'],
    leads: ['lead-statuses', 'reply-customer', 'follow-ups-work'],
    'lead-detail': ['ai-intake-meaning', 'pause-followups', 'manual-reply'],
    calendar: ['connect-google-calendar', 'events-not-showing'],
    settings: ['change-business-hours', 'update-forwarding'],
    onboarding: ['set-up-forwarding', 'carrier-instructions', 'test-call-failed']
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
    ids.push('forwarding-direction', 'test-call-second-phone', 'setup-time')
  }

  // Prioritize forwarding troubleshooting
  if (context.forwardingVerified === false) {
    ids.push('forwarding-direction', 'test-call-second-phone', 'cancel-forwarding')
  }

  // Prioritize calendar setup if not connected
  if (context.calendarConnected === false) {
    ids.push('google-calendar')
  }

  // Prioritize lead management for users with leads
  if (context.hasLeads) {
    ids.push('lead-statuses', 'reply-customer', 'follow-ups-work')
  }

  // Prioritize activity/conversation help for users with recent activity
  if (context.hasRecentActivity) {
    ids.push('sms-timing', 'mms-photos')
  }

  const articles = KNOWLEDGE_BASE.filter(a => ids.includes(a.id))
  return articles
}
