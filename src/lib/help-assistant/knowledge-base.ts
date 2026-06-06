export interface HelpArticle {
  id: string
  keywords: string[]
  question: string
  answer: string
  category: string
  source: string
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
  if (bestMatch && bestScore >= 2) {
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

export function getSuggestedQuestions(category?: string): HelpArticle[] {
  let articles = KNOWLEDGE_BASE
  
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
