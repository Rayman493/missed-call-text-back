import type { AssistantArticle } from './types'

export const KNOWLEDGE_BASE: AssistantArticle[] = [
  {
    id: 'replyflow-overview',
    question: 'What is ReplyFlow?',
    summary: 'An overview of how ReplyFlow captures missed calls, converts them into leads, and helps small service businesses follow up with customers.',
    answer: `ReplyFlow is a missed-call-to-lead platform built for small service businesses.

When a customer calls your business and you can't answer, ReplyFlow picks up the call, captures the caller's information, and texts them back automatically so you never lose a lead.

What ReplyFlow does:
- Converts missed calls into structured leads.
- Answers calls with AI Voice when you are unavailable.
- Collects caller details such as name, reason for calling, urgency, and preferred timing.
- Sends automatic SMS follow-ups to the customer after a missed call.
- Lets you reply to customers and manage conversations in one place.
- Tracks follow-ups and appointment scheduling.
- Connects with Google Calendar to create appointments.
- Sends Stripe payment requests by text.
- Provides analytics on missed calls, lead conversion, and response times.

How it works:
1. You keep your existing business phone number.
2. You forward unanswered calls to your dedicated ReplyFlow number.
3. When a call forwards, ReplyFlow answers it or captures the voicemail.
4. AI extracts the caller's information and creates a lead.
5. ReplyFlow texts the customer with a helpful response and a link to continue the conversation.
6. You view the lead, reply, schedule, and send payment requests from the dashboard.

ReplyFlow is designed for small service businesses like lawn care, home services, pet grooming, tutoring, cleaning, plumbing, HVAC, real estate, and medical/dental offices.

It runs in the background so you can focus on the job while still capturing every missed opportunity.`,
    category: 'Overview',
    source: 'Product Guide',
    keywords: ['overview', 'what is replyflow', 'who are you', 'what are you', 'what does replyflow do', 'how does replyflow work', 'replyflow', 'product', 'platform', 'service', 'app', 'introduction', 'about'],
    readingTime: 3,
    lastUpdated: '2026-06-30',
    relatedQuestions: [
      'How does AI Voice work?',
      'How do I set up call forwarding?',
      'How much does ReplyFlow cost?',
    ],
  },
  {
    id: 'forwarding-direction',
    question: 'Which number do I forward?',
    summary: 'Forward your business number to ReplyFlow, not the other way around.',
    answer: 'Forward YOUR BUSINESS NUMBER to the ReplyFlow number. Do NOT forward the ReplyFlow number to your business number. Your customers call your normal business number first. When you don\'t answer, the call forwards to ReplyFlow. This is called conditional call forwarding - calls only forward when you\'re unavailable. Carrier-specific setup instructions are available in onboarding or settings. Ignored contacts may still forward depending on your carrier settings.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide',
    keywords: ['forward', 'direction', 'which number', 'forwarding setup', 'common mistake', 'conditional forwarding'],
    readingTime: 2,
    relatedQuestions: ['How do I set up call forwarding?', 'How do I forward calls on Verizon?', 'Why can\'t I call from my business phone to test?'],
  },
  {
    id: 'verizon-forwarding',
    question: 'How do I forward calls on Verizon?',
    summary: 'Verizon call forwarding setup.',
    answer: 'Dial *71 followed by the ReplyFlow number on your business phone. For example: *71 1-412-555-0123. You\'ll hear a confirmation tone when it\'s enabled.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide',
    keywords: ['verizon', 'forwarding code', 'verizon code', 'how to forward verizon'],
    readingTime: 1,
    relatedQuestions: ['How do I forward calls on AT&T?', 'How do I forward calls on T-Mobile?', 'How do I set up call forwarding?'],
  },
  {
    id: 'att-forwarding',
    question: 'How do I forward calls on AT&T?',
    summary: 'AT&T call forwarding setup.',
    answer: 'Dial *004* followed by the ReplyFlow number, then #. For example: *004*14125550123#. You\'ll hear a confirmation tone when it\'s enabled.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide',
    keywords: ['at&t', 'att', 'forwarding code', 'at&t code', 'how to forward at&t'],
    readingTime: 1,
    relatedQuestions: ['How do I forward calls on Verizon?', 'How do I forward calls on T-Mobile?', 'How do I set up call forwarding?'],
  },
  {
    id: 'tmobile-forwarding',
    question: 'How do I forward calls on T-Mobile?',
    summary: 'T-Mobile call forwarding setup.',
    answer: 'Dial **61* followed by the ReplyFlow number, then #. For example: **61*14125550123#. You\'ll hear a confirmation tone when it\'s enabled.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide',
    keywords: ['t-mobile', 'tmobile', 'forwarding code', 't-mobile code', 'how to forward t-mobile'],
    readingTime: 1,
    relatedQuestions: ['How do I forward calls on Verizon?', 'How do I forward calls on AT&T?', 'How do I set up call forwarding?'],
  },
  {
    id: 'voip-forwarding',
    question: 'How do I forward calls with VoIP providers?',
    summary: 'VoIP and web-based carrier forwarding.',
    answer: 'If you use RingCentral, 8x8, Grasshopper, Google Voice, or other VoIP providers, you typically set up forwarding through their website dashboard instead of dialing codes on your phone. Look for "Call Forwarding" or "Forwarding Settings" in your provider\'s online portal.',
    category: 'Call Forwarding',
    source: 'Onboarding Guide',
    keywords: ['voip', 'ringcentral', '8x8', 'grasshopper', 'google voice', 'forwarding web'],
    readingTime: 2,
    relatedQuestions: ['How do I set up call forwarding?', 'Which carrier instructions should I use?', 'Call forwarding is not working'],
  },
  {
    id: 'test-call-second-phone',
    question: 'Why can\'t I call from my business phone to test?',
    summary: 'Test calls must come from a different phone.',
    answer: 'Call forwarding doesn\'t work from the same phone being forwarded. If you call from your business phone, the call won\'t forward to ReplyFlow. You must call from a different phone (like your personal cell phone) to test the setup.',
    category: 'Testing',
    source: 'Beta FAQ',
    keywords: ['test call', 'second phone', 'why different phone', 'test from business phone'],
    readingTime: 1,
    relatedQuestions: ['How do I test ReplyFlow?', 'Why didn\'t my test call work?', 'No lead appeared after my test call'],
  },
  {
    id: 'sms-timing',
    question: 'How long until I receive the auto-reply text?',
    summary: 'SMS timing expectations.',
    answer: 'SMS typically arrives within 1-2 minutes after the missed call. Some carriers may take up to 5 minutes. If you don\'t receive the text after 2-3 minutes, try the test call again.',
    category: 'Testing',
    source: 'Beta FAQ',
    keywords: ['sms timing', 'how long', 'when text', 'text delay', 'sms not arriving'],
    readingTime: 1,
    relatedQuestions: ['SMS did not send after missed call', 'How do I test ReplyFlow?', 'How do I reply to a customer?'],
  },
  {
    id: 'mms-photos',
    question: 'Can customers send photos?',
    summary: 'MMS photo support.',
    answer: 'Yes. Customers can send photos via MMS and they\'ll appear in your conversation threads with thumbnails. JPG, PNG, WEBP, and most common image formats are supported.',
    category: 'Features',
    source: 'Beta FAQ',
    keywords: ['mms', 'photos', 'images', 'pictures', 'send photos'],
    readingTime: 1,
    relatedQuestions: ['How do I reply to a customer?', 'What do lead statuses mean?', 'Can I send a manual reply?'],
  },
  {
    id: 'google-calendar',
    question: 'Is Google Calendar required?',
    summary: 'Google Calendar is optional.',
    answer: 'No. Google Calendar is optional and only needed if you want to sync appointments with your calendar. To connect, go to Dashboard → Calendar → Connect Google Calendar.',
    category: 'Features',
    source: 'Beta FAQ',
    keywords: ['calendar', 'google calendar', 'appointments', 'sync'],
    readingTime: 1,
    relatedQuestions: ['How do I connect Google Calendar?', 'Why are events not showing?', 'Calendar not connected or not syncing'],
  },
  {
    id: 'pricing',
    question: 'How much does ReplyFlow cost?',
    summary: 'Pricing and subscription details.',
    answer: 'ReplyFlow is $59/month with a 14-day free trial. No contracts required. You can cancel anytime during the trial with no charge. Billing is managed through the Stripe portal accessible from Dashboard → Settings → Subscription.',
    category: 'Billing',
    source: 'Pricing Page',
    keywords: ['pricing', 'cost', 'price', 'how much', 'subscription'],
    readingTime: 1,
    relatedQuestions: ['How does billing and trial work?', 'Will I be charged during the trial?', 'How do I cancel before the trial ends?'],
  },
  {
    id: 'trial-billing',
    question: 'Will I be charged during the trial?',
    summary: 'Trial billing details.',
    answer: 'No. The 14-day trial is free with no charge. You\'ll only be charged after the trial ends if you choose to continue. Billing is managed through Stripe. You can cancel anytime during the trial via Dashboard → Settings → Subscription.',
    category: 'Billing',
    source: 'Beta FAQ',
    keywords: ['trial', 'free trial', 'charged during trial', 'trial cost'],
    readingTime: 1,
    relatedQuestions: ['How do I cancel before the trial ends?', 'How does billing and trial work?', 'How much does ReplyFlow cost?'],
  },
  {
    id: 'cancel-trial',
    question: 'How do I cancel before the trial ends?',
    summary: 'Canceling during the trial.',
    answer: 'Go to Dashboard → Settings → Subscription and click "Cancel Subscription" to access the Stripe portal. You can cancel anytime during the 14-day trial with no charge. After cancellation, you won\'t be billed when the trial ends.',
    category: 'Billing',
    source: 'Beta FAQ',
    keywords: ['cancel', 'cancel trial', 'cancel subscription', 'how to cancel'],
    readingTime: 1,
    relatedQuestions: ['How does billing and trial work?', 'Will I be charged during the trial?', 'How do I contact support?'],
  },
  {
    id: 'ai-voice',
    question: 'How does AI Voice work?',
    summary: 'AI Voice answers missed calls and captures intake information.',
    answer: 'AI Voice is a production feature that answers calls when you don\'t. When a call forwards to ReplyFlow, AI answers the call, asks scripted questions to collect caller information (name, reason, details, location, timing), and ends with a summary. The caller hears a professional AI assistant that adapts questions based on your business type. After the call, you receive a summary SMS with all captured information. This is not voicemail - it\'s a live AI conversation.',
    category: 'Features',
    source: 'Product Guide',
    keywords: ['ai voice', 'ai answering', 'ai intake', 'ai call assistant', 'live ai', 'ai picks up', 'ai receptionist', 'how does ai work'],
    readingTime: 3,
    relatedQuestions: ['What business types does AI Voice support?', 'What does this AI intake mean?', 'What if AI Voice isn\'t available?'],
  },
  {
    id: 'ai-voice-business-types',
    question: 'What business types does AI Voice support?',
    summary: 'Supported industries and AI question templates.',
    answer: 'AI Voice supports multiple business types with tailored intake questions, including: lawn care/landscaping, dog grooming/pet services, lessons/tutoring, home services, plumbing/HVAC, cleaning, real estate, medical/dental, legal consulting, and more. The AI adapts its questions based on your business type to ask relevant questions. You can set your business type in Settings.',
    category: 'Features',
    source: 'Product Guide',
    keywords: ['business types', 'ai questions', 'ai templates', 'lawn care', 'dog grooming', 'tutoring'],
    readingTime: 2,
    relatedQuestions: ['How does AI Voice work?', 'What does this AI intake mean?', 'How do I customize AI questions?'],
  },
  {
    id: 'ai-voicemail',
    question: 'What if AI Voice isn\'t available?',
    summary: 'Voicemail fallback when AI is unavailable.',
    answer: 'If AI Voice is unavailable (due to configuration or service issues), calls fall back to voicemail. AI can still capture caller information from voicemail transcriptions. AI Voice is the preferred path when available, but voicemail with AI transcription provides a reliable fallback.',
    category: 'Features',
    source: 'Product Guide',
    keywords: ['ai', 'voicemail', 'ai voicemail', 'voicemail intake'],
    readingTime: 1,
    relatedQuestions: ['How does AI Voice work?', 'AI intake is incomplete or missing details', 'Caller hung up before voicemail'],
  },
  {
    id: 'ai-without-voicemail',
    question: 'Can I use ReplyFlow without AI?',
    summary: 'Using ReplyFlow without AI Voice.',
    answer: 'AI Voice is a core feature that helps capture caller information. If you prefer not to use AI, contact support to discuss options. ReplyFlow always sends automated SMS acknowledgments for missed calls regardless of AI settings.',
    category: 'Features',
    source: 'FAQ',
    keywords: ['ai without voicemail', 'sms only', 'no ai', 'toggle ai off'],
    readingTime: 1,
    relatedQuestions: ['How does AI Voice work?', 'How do I contact support?', 'What are ReplyFlow\'s guarantees and limitations?'],
  },
  {
    id: 'customer-corrections',
    question: 'Can customers correct their information?',
    summary: 'Customer reply corrections update leads automatically.',
    answer: 'Yes, ReplyFlow can detect and process corrections from customer replies. When a customer replies to the summary SMS with corrected information (name, address, details, timing), ReplyFlow extracts the correction and updates the lead and AI summary. Corrections are logged in the lead metadata. Follow-up jobs are automatically cancelled when a customer replies.',
    category: 'Features',
    source: 'Feature Documentation',
    keywords: ['correction', 'address correction', 'customer reply address', 'update information', 'customer update', 'change info'],
    readingTime: 2,
    relatedQuestions: ['How do I reply to a customer?', 'How do follow-ups work?', 'Can I send a manual reply?'],
  },
  {
    id: 'keep-number',
    question: 'Do I keep my existing business number?',
    summary: 'Your business number stays the same.',
    answer: 'Yes, completely. Your business keeps its existing public phone number. Customers continue calling your published business number. ReplyFlow works seamlessly in the background - when calls go unanswered, they forward to ReplyFlow for automated text responses.',
    category: 'Setup',
    source: 'FAQ',
    keywords: ['keep number', 'existing number', 'business number', 'change number'],
    readingTime: 1,
    relatedQuestions: ['Why does the text come from a different number?', 'How do I set up call forwarding?', 'What is ReplyFlow?'],
  },
  {
    id: 'different-number-text',
    question: 'Why does the text come from a different number?',
    summary: 'ReplyFlow uses a dedicated messaging line.',
    answer: 'ReplyFlow provides a dedicated messaging line so conversations remain organized and customers can continue texting you after the missed call. Your existing business phone number remains unchanged. The ReplyFlow messaging number appears in customer text conversations, but your business number stays the same for all incoming calls.',
    category: 'Setup',
    source: 'FAQ',
    keywords: ['different number', 'why different number', 'text from different number'],
    readingTime: 1,
    relatedQuestions: ['Do I keep my existing business number?', 'How do I reply to a customer?', 'What is ReplyFlow?'],
  },
  {
    id: 'setup-time',
    question: 'How long does setup take?',
    summary: 'Typical setup time.',
    answer: 'Setup takes under 5 minutes. You select your carrier, dial the forwarding code on your business phone, and make a test call. That\'s it.',
    category: 'Setup',
    source: 'Homepage',
    keywords: ['setup time', 'how long to setup', 'installation time'],
    readingTime: 1,
    relatedQuestions: ['How do I set up call forwarding?', 'How do I test ReplyFlow?', 'Why didn\'t my test call work?'],
  },
  {
    id: 'tcpa-compliance',
    question: 'Is ReplyFlow TCPA compliant?',
    summary: 'Compliance overview.',
    answer: 'ReplyFlow supports compliant conversational messaging workflows. Messages are only sent after customers initiate contact by calling your business. Messages relate directly to the missed call interaction. Full opt-out support is included - STOP and HELP keywords are automatically processed.',
    category: 'Compliance',
    source: 'FAQ',
    keywords: ['tcpa', 'compliance', 'legal', 'marketing texts'],
    readingTime: 2,
    relatedQuestions: ['Can customers opt out?', 'What are ReplyFlow\'s guarantees and limitations?', 'How do I contact support?'],
  },
  {
    id: 'opt-out',
    question: 'Can customers opt out?',
    summary: 'Opt-out and STOP support.',
    answer: 'Yes, absolutely. ReplyFlow supports full compliance with opt-out requirements. Customers can reply "STOP" to immediately opt out of all future messages, or "HELP" to get support contact information. All opt-out requests are processed immediately.',
    category: 'Compliance',
    source: 'FAQ',
    keywords: ['opt out', 'stop', 'help', 'unsubscribe'],
    readingTime: 1,
    relatedQuestions: ['Is ReplyFlow TCPA compliant?', 'What are ReplyFlow\'s guarantees and limitations?', 'How do follow-ups work?'],
  },
  {
    id: 'cancel-forwarding',
    question: 'How do I disable call forwarding?',
    summary: 'Disable call forwarding codes.',
    answer: 'See the canonical "Disable call forwarding" article for the latest carrier-specific disable codes and verification steps.',
    category: 'Setup',
    source: 'FAQ',
    keywords: ['disable forwarding', 'turn off', 'stop forwarding', 'cancel forwarding'],
    readingTime: 1,
    relatedQuestions: ['How do I set up call forwarding?', 'How do I update call forwarding?', 'Call forwarding is not working'],
  },
  {
    id: 'metrics-zero',
    question: 'Why are my metrics zero?',
    summary: 'Dashboard metrics before first missed call.',
    answer: 'Your metrics will be zero until you receive your first missed call. Make sure call forwarding is set up correctly, then test with a call from a different phone. Metrics update in real-time after each missed call.',
    category: 'Dashboard',
    source: 'FAQ',
    keywords: ['metrics zero', 'why metrics zero', 'dashboard zero', 'no metrics'],
    readingTime: 1,
    relatedQuestions: ['How do I test ReplyFlow?', 'No lead appeared after my test call', 'Call forwarding is not working'],
  },
  {
    id: 'test-replyflow',
    question: 'Test your setup',
    summary: 'Verify forwarding and automated SMS by placing a real missed call from a different phone.',
    answer: `When you would use this
Use this after enabling forwarding to confirm end-to-end behavior.

Step-by-step instructions
1) From a different phone, call your business number.
2) Do not answer—let it ring until it forwards to ReplyFlow.
3) Within 1–2 minutes, you should receive an automated text.
4) Reply to the text to confirm two-way messaging.

Tips / Best Practices
- Always test from a second phone; calling from the forwarded phone will not forward.
- If SMS is delayed, wait up to 5 minutes and try once more.

Common problems
- No lead created or no SMS: see 'No lead after test' and 'SMS did not send'.

Related articles
- Forwarding basics
- Carrier Forwarding Codes
- Troubleshoot call forwarding`,
    category: 'Dashboard',
    source: 'FAQ',
    keywords: ['test replyflow', 'how to test', 'testing replyflow'],
    readingTime: 2,
    relatedQuestions: ['Why can\'t I call from my business phone to test?', 'How long until I receive the auto-reply text?', 'No lead appeared after my test call'],
  },
  {
    id: 'active-conversation',
    question: 'What does Active Conversation mean?',
    summary: 'Active conversation definition.',
    answer: 'An "Active Conversation" is a lead you\'ve exchanged messages with in the last 7 days. These leads are prioritized in your dashboard as they represent current customer relationships that may need attention.',
    category: 'Dashboard',
    source: 'FAQ',
    keywords: ['active conversation', 'what is active conversation', 'conversation status'],
    readingTime: 1,
    relatedQuestions: ['How do I reply to a customer?', 'What do lead statuses mean?', 'How do follow-ups work?'],
  },
  {
    id: 'lead-statuses',
    question: 'What do lead statuses mean?',
    summary: 'Lead status definitions.',
    answer: 'New: No messages sent yet. Active: Ongoing conversation with the customer. Replied: Customer has responded to your message. Ignored: You\'ve marked as not interested. Completed: Issue resolved or conversation ended. Statuses help you track lead progress. When a customer replies, the lead status automatically changes to "Replied."',
    category: 'Leads',
    source: 'FAQ',
    keywords: ['lead status', 'statuses', 'what do statuses mean', 'lead meaning'],
    readingTime: 2,
    relatedQuestions: ['How do I reply to a customer?', 'How do follow-ups work?', 'What does Active Conversation mean?'],
  },
  {
    id: 'reply-customer',
    question: 'How do I reply to a customer?',
    summary: 'Sending messages from the lead detail page.',
    answer: 'Go to the Leads page, click on a lead, and type your message in the composer at the bottom. Press Enter to send. You can also send photos by clicking the image icon. Messages are sent instantly.',
    category: 'Leads',
    source: 'FAQ',
    keywords: ['reply to customer', 'send message', 'how to reply'],
    readingTime: 1,
    relatedQuestions: ['Can I send a manual reply?', 'Can customers send photos?', 'What do lead statuses mean?'],
  },
  {
    id: 'follow-ups-work',
    question: 'How do follow-ups work?',
    summary: 'Automated follow-up sequences.',
    answer: 'ReplyFlow sends automated follow-up messages to customers who don\'t reply to the initial SMS. These are pre-configured messages designed to re-engage leads. Follow-ups are not a conversational AI chatbot - they are scheduled messages based on your settings. You configure follow-up sequences in Settings.',
    category: 'Leads',
    source: 'FAQ',
    keywords: ['follow-ups', 'automatic follow-up', 'how follow-ups work'],
    readingTime: 2,
    relatedQuestions: ['How do I pause follow-ups?', 'Follow-ups are not sending', 'Customer replied but automation still active'],
  },
  {
    id: 'ai-intake-meaning',
    question: 'What does this AI intake mean?',
    summary: 'AI intake fields explained.',
    answer: 'AI intake is information captured when a customer calls and leaves a voicemail. It includes the caller\'s name, reason for calling, urgency level, and preferred callback time. This helps you understand customer needs before you reply.',
    category: 'Lead Detail',
    source: 'FAQ',
    keywords: ['ai intake', 'ai summary', 'what does ai intake mean', 'ai summary meaning'],
    readingTime: 2,
    relatedQuestions: ['How does AI Voice work?', 'AI intake is incomplete or missing details', 'Can I send a manual reply?'],
  },
  {
    id: 'pause-followups',
    question: 'How do I pause follow-ups?',
    summary: 'Pausing follow-ups for a lead.',
    answer: 'Go to the lead detail page and click "Pause Follow-ups" in the Quick Actions section. This stops automatic follow-up messages for that specific lead. You can resume follow-ups at any time.',
    category: 'Lead Detail',
    source: 'FAQ',
    keywords: ['pause follow-ups', 'stop follow-ups', 'disable follow-ups'],
    readingTime: 1,
    relatedQuestions: ['How do follow-ups work?', 'Customer replied but automation still active', 'Can I send a manual reply?'],
  },
  {
    id: 'manual-reply',
    question: 'Can I send a manual reply?',
    summary: 'Sending custom messages from the lead page.',
    answer: 'Yes. In the lead detail page, type your message in the composer at the bottom and press Enter. Manual replies are sent instantly and override any automated follow-up schedules for that lead.',
    category: 'Lead Detail',
    source: 'FAQ',
    keywords: ['manual reply', 'send manual message', 'custom message'],
    readingTime: 1,
    relatedQuestions: ['How do I reply to a customer?', 'Can customers send photos?', 'How do I pause follow-ups?'],
  },
  {
    id: 'connect-google-calendar',
    question: 'How do I connect Google Calendar?',
    summary: 'Connecting Google Calendar.',
    answer: 'Go to Dashboard → Calendar and click "Connect Google Calendar." You\'ll be prompted to authorize ReplyFlow to access your calendar. Once connected, appointments from conversations will sync to your calendar.',
    category: 'Calendar',
    source: 'FAQ',
    keywords: ['connect google calendar', 'google calendar setup', 'calendar connection'],
    readingTime: 1,
    relatedQuestions: ['Why are events not showing?', 'Calendar not connected or not syncing', 'How does AI Voice work with Out of Office?'],
  },
  {
    id: 'events-not-showing',
    question: 'Why are events not showing?',
    summary: 'Calendar sync troubleshooting.',
    answer: 'Make sure Google Calendar is connected and authorized. Check that appointments have dates/times set in conversations. Events sync within 5 minutes of being created. Try refreshing the calendar page.',
    category: 'Calendar',
    source: 'FAQ',
    keywords: ['events not showing', 'calendar not syncing', 'no events'],
    readingTime: 2,
    relatedQuestions: ['How do I connect Google Calendar?', 'Calendar not connected or not syncing', 'How do I change business hours?'],
  },
  {
    id: 'change-business-hours',
    question: 'How do I change business hours?',
    summary: 'Updating business hours in settings.',
    answer: 'Go to Dashboard → Settings → Business Hours. Set your operating hours and time zone. This helps ReplyFlow know when to expect responses and can be used for scheduling follow-ups.',
    category: 'Settings',
    source: 'FAQ',
    keywords: ['business hours', 'change hours', 'update hours'],
    readingTime: 1,
    relatedQuestions: ['How do I connect Google Calendar?', 'How does AI Voice work with Out of Office?', 'How do I update call forwarding?'],
  },
  {
    id: 'out-of-office-ai',
    question: 'How does AI Voice work with Out of Office?',
    summary: 'AI Voice works 24/7 regardless of office hours.',
    answer: 'AI Voice is available 24/7 regardless of your business hours or Out of Office settings. When calls forward to ReplyFlow, AI will answer and collect information even if you\'re marked as Out of Office. The summary SMS will include an Out of Office notice if configured. This ensures you never miss lead information, even when unavailable.',
    category: 'Features',
    source: 'Product Guide',
    keywords: ['out of office', 'ooo', 'after hours', 'closed', 'ai after hours', 'ai ooo'],
    readingTime: 2,
    relatedQuestions: ['How do I change business hours?', 'How does AI Voice work?', 'How do I connect Google Calendar?'],
  },
  {
    id: 'ignored-contacts-ai',
    question: 'How does AI Voice handle ignored contacts?',
    summary: 'Ignored contacts stay separate from customer workflow.',
    answer: 'When a call from an ignored contact forwards to ReplyFlow, no customer is created, no AI intake occurs, and no automatic SMS is sent. The caller can leave a voicemail, which is saved separately in Personal Voicemail. This keeps personal callers separate from your customer workflow. You can manage ignored contacts in Settings.',
    category: 'Features',
    source: 'Product Guide',
    keywords: ['ignored contacts', 'block contacts', 'ai ignored', 'skip ai for ignored', 'personal voicemail'],
    readingTime: 2,
    relatedQuestions: ['How do I change business hours?', 'How does AI Voice work?', 'How do I update call forwarding?'],
  },
  {
    id: 'update-forwarding',
    question: 'How do I update call forwarding?',
    summary: 'Changing the ReplyFlow forwarding number.',
    answer: 'If you need to change the ReplyFlow number, first disable forwarding on your business phone using your carrier\'s disable code. Then dial the new forwarding code with the updated ReplyFlow number. Test with a call from a different phone.',
    category: 'Settings',
    source: 'FAQ',
    keywords: ['update forwarding', 'change forwarding', 'forwarding settings'],
    readingTime: 2,
    relatedQuestions: ['How do I set up call forwarding?', 'How do I disable call forwarding?', 'Call forwarding is not working'],
  },
  {
    id: 'set-up-forwarding',
    question: 'How do I set up call forwarding?',
    summary: 'General call forwarding setup.',
    answer: 'Select your carrier in the setup instructions. Dial the forwarding code followed by your ReplyFlow number on your business phone. For example, on Verizon dial *71 followed by the ReplyFlow number. You\'ll hear a confirmation tone when enabled.',
    category: 'Onboarding',
    source: 'Onboarding Guide',
    keywords: ['set up forwarding', 'forwarding setup', 'how to forward'],
    readingTime: 2,
    relatedQuestions: ['Which carrier instructions should I use?', 'Why can\'t I call from my business phone to test?', 'Call forwarding is not working'],
  },
  {
    id: 'carrier-instructions',
    question: 'Which carrier instructions should I use?',
    summary: 'Choosing the right carrier instructions.',
    answer: 'Use the instructions for your business phone carrier (Verizon, AT&T, T-Mobile, etc.). If you use a VoIP provider (RingCentral, Google Voice, etc.), use the VoIP instructions and set up forwarding through their web dashboard.',
    category: 'Onboarding',
    source: 'Onboarding Guide',
    keywords: ['carrier instructions', 'which carrier', 'carrier codes'],
    readingTime: 1,
    relatedQuestions: ['How do I set up call forwarding?', 'How do I forward calls on Verizon?', 'How do I forward calls with VoIP providers?'],
  },
  {
    id: 'test-call-failed',
    question: 'Why didn\'t my test call work?',
    summary: 'Common test call mistakes.',
    answer: 'Common issues: 1) You called from your business phone (call forwarding doesn\'t work from the same phone), 2) Forwarding not enabled correctly, 3) Wrong carrier code used. Always test from a different phone.',
    category: 'Onboarding',
    source: 'Onboarding Guide',
    keywords: ['test call failed', 'test not working', 'forwarding not working'],
    readingTime: 1,
    relatedQuestions: ['How do I test ReplyFlow?', 'Why can\'t I call from my business phone to test?', 'Call forwarding is not working'],
  },
  {
    id: 'no-lead-appeared',
    question: 'No lead appeared after my test call',
    summary: 'Troubleshooting missing leads.',
    answer: 'If no lead appeared: 1) Verify forwarding is active by calling from a different phone, 2) Check that the call actually forwarded to ReplyFlow (you should hear voicemail), 3) Allow 1-2 minutes for the lead to appear in your dashboard, 4) Check the Leads page to see if the lead was created. If the call didn\'t forward, re-check your carrier forwarding setup. Always test from a different phone - forwarding doesn\'t work from the same phone being forwarded.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['no lead', 'lead not showing', 'lead missing', 'call didn\'t show', 'call not in dashboard', 'where is my lead', 'lead not created'],
    readingTime: 2,
    relatedQuestions: ['How do I test ReplyFlow?', 'Call forwarding is not working', 'Why didn\'t my test call work?'],
  },
  {
    id: 'sms-not-sent',
    question: 'SMS did not send after missed call',
    summary: 'Troubleshooting SMS delivery after a missed call.',
    answer: 'If no SMS was sent: 1) Check that the lead exists in your dashboard, 2) Verify your ReplyFlow messaging number is active, 3) Some carriers may delay SMS delivery by 2-5 minutes, 4) Check if the customer\'s carrier is blocking short codes or automated messages, 5) Try sending a manual message from the lead detail page to test SMS functionality. If issues persist, contact support at support@replyflowhq.com.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['sms not sent', 'text not sent', 'message not delivered', 'sms failed', 'no text received', 'text didn\'t arrive', 'delivery failed', 'customer didn\'t get text', 'customer did not get text', 'did not get text', 'did not receive text'],
    readingTime: 2,
    relatedQuestions: ['How long until I receive the auto-reply text?', 'How do I reply to a customer?', 'How do I contact support?'],
  },
  {
    id: 'ai-intake-incomplete',
    question: 'AI intake is incomplete or missing details',
    summary: 'Why AI intake may miss information.',
    answer: 'AI intake depends on voicemail quality. If details are missing: 1) The caller may not have provided the information, 2) Voicemail may have been unclear or cut off, 3) Background noise can interfere with AI transcription. AI intake is designed to capture what\'s available from the voicemail - it cannot guarantee complete data capture from every call. You can manually add missing details to the lead.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['ai incomplete', 'ai missed details', 'ai not working', 'ai partial', 'intake incomplete', 'ai didn\'t capture', 'missing ai data'],
    readingTime: 2,
    relatedQuestions: ['What does this AI intake mean?', 'How does AI Voice work?', 'Caller hung up before voicemail'],
  },
  {
    id: 'caller-hung-up-early',
    question: 'Caller hung up before voicemail',
    summary: 'What happens when a caller hangs up early.',
    answer: 'If the caller hung up before voicemail, AI intake cannot capture information. However, ReplyFlow will still create a lead and send an automated text response. The lead will show the caller\'s phone number and call time, but AI intake details will be minimal or absent.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['caller hung up', 'caller hung up early', 'short call', 'no voicemail', 'caller didn\'t leave message', 'quick hangup'],
    readingTime: 1,
    relatedQuestions: ['AI intake is incomplete or missing details', 'How do I reply to a customer?', 'What does this AI intake mean?'],
  },
  {
    id: 'partial-intake',
    question: 'AI intake has partial information',
    summary: 'Partial intake is normal.',
    answer: 'Partial intake is normal when the voicemail doesn\'t contain all information. AI captures what it can from the voicemail. You can manually add missing details to the lead. ReplyFlow is designed to assist with intake, not guarantee complete data capture from every call.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['partial intake', 'some details missing', 'incomplete data', 'partial ai', 'missing information'],
    readingTime: 1,
    relatedQuestions: ['AI intake is incomplete or missing details', 'What does this AI intake mean?', 'How do I reply to a customer?'],
  },
  {
    id: 'duplicate-lead',
    question: 'Duplicate lead or duplicate SMS',
    summary: 'Duplicate leads and SMS troubleshooting.',
    answer: 'ReplyFlow uses phone number matching to prevent duplicate leads. If you see duplicates: 1) Check if the caller used different phone numbers, 2) Verify the leads are actually the same customer, 3) Duplicate SMS may occur if the system retries delivery. Contact support if you see persistent duplicates.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['duplicate lead', 'same lead twice', 'duplicate entry', 'lead appeared twice'],
    readingTime: 2,
    relatedQuestions: ['What do lead statuses mean?', 'How do I reply to a customer?', 'How do I contact support?'],
  },
  {
    id: 'follow-ups-not-sending',
    question: 'Follow-ups are not sending',
    summary: 'Troubleshooting follow-up delivery.',
    answer: 'If follow-ups aren\'t sending: 1) Check that follow-ups are enabled in Settings, 2) Verify the lead status allows follow-ups (ignored/completed leads may not receive follow-ups), 3) Check that the customer hasn\'t opted out by replying STOP, 4) Review the follow-up schedule configuration. You can also manually send follow-ups from the lead detail page.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['follow-ups not sending', 'follow-up failed', 'no follow-up', 'follow-up not working', 'automation not sending'],
    readingTime: 2,
    relatedQuestions: ['How do follow-ups work?', 'How do I pause follow-ups?', 'Customer replied but automation still active'],
  },
  {
    id: 'customer-replied-automation-active',
    question: 'Customer replied but automation still active',
    summary: 'Automation should stop after a customer reply.',
    answer: 'When a customer replies, ReplyFlow marks the lead as "Replied" and should pause automated follow-ups. If automation continues: 1) Check the lead status is "Replied", 2) Manually pause follow-ups from the lead detail page using "Pause Follow-ups", 3) Review your follow-up settings to ensure replies are handled correctly.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['customer replied', 'automation still active', 'customer responded', 'automation didn\'t stop', 'follow-up after reply'],
    readingTime: 2,
    relatedQuestions: ['How do I pause follow-ups?', 'How do follow-ups work?', 'Can I send a manual reply?'],
  },
  {
    id: 'calendar-not-connected',
    question: 'Calendar not connected or not syncing',
    summary: 'Troubleshooting Google Calendar connection.',
    answer: 'If calendar isn\'t connected: 1) Go to Dashboard → Calendar and click "Connect Google Calendar", 2) Ensure you authorize the connection when prompted, 3) Check that you\'re not blocking pop-ups, 4) Verify your Google account has calendar access. If connected but not syncing: Check that conversations have appointment dates/times set. Events sync within 5 minutes. If issues persist, contact support at support@replyflowhq.com.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['calendar not connected', 'calendar sync failed', 'calendar not working', 'google calendar error', 'calendar connection issue'],
    readingTime: 2,
    relatedQuestions: ['How do I connect Google Calendar?', 'Why are events not showing?', 'How do I contact support?'],
  },
  {
    id: 'forwarding-not-working',
    question: 'Call forwarding is not working',
    summary: 'Troubleshooting call forwarding.',
    answer: 'If calls aren\'t forwarding: 1) Verify you used the correct carrier code, 2) Confirm you dialed the code on your business phone (not a different phone), 3) Test by calling from a different phone, 4) Check with your carrier that forwarding is enabled on your line, 5) For VoIP providers, check the web dashboard settings. Always test from a different phone. Carrier-specific codes: Verizon (*73 disable, *71+number enable), AT&T (#004# disable, *004*number# enable), T-Mobile (#61# disable, **61*number# enable).',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['forwarding not working', 'forwarding broken', 'calls not forwarding', 'forwarding setup failed'],
    readingTime: 2,
    relatedQuestions: ['How do I set up call forwarding?', 'Why didn\'t my test call work?', 'How do I disable call forwarding?'],
  },
  {
    id: 'disable-forwarding',
    question: 'How do I disable call forwarding?',
    summary: 'Disable forwarding codes.',
    answer: `When you would use this
Use this to turn off conditional forwarding (for offboarding, testing, or changes).

Step-by-step instructions
1) From your business phone, dial your carrier's disable code:
   - Verizon: *73
   - AT&T: #004#
   - T‑Mobile: #61#
   - Comcast/Xfinity: *73
   - VoIP (RingCentral/Grasshopper/Google Voice/etc.): turn off in the provider web portal.
2) Call your business number to confirm it rings normally and does not forward.

Tips / Best Practices
- Keep your disable code handy for future changes.
- If you changed your forwarding number, disable first, then re-enable with the new ReplyFlow number.

Common problems
- Code dialed from a different phone: disable must be dialed from the business line.

Related articles
- Carrier Forwarding Codes
- Troubleshoot call forwarding`,
    category: 'Setup',
    source: 'FAQ',
    keywords: ['disable forwarding', 'turn off forwarding', 'stop forwarding', 'cancel forwarding', 'how to disable'],
    readingTime: 1,
    relatedQuestions: ['How do I set up call forwarding?', 'How do I update call forwarding?', 'Call forwarding is not working'],
  },
  {
    id: 'replyflow-limitations',
    question: 'What can and can\'t ReplyFlow do?',
    summary: 'ReplyFlow capabilities and limitations.',
    answer: 'ReplyFlow answers calls when you don\'t answer using AI Voice, collects caller information, sends automated SMS responses, and manages follow-up sequences. ReplyFlow does NOT control your carrier forwarding settings directly, cannot guarantee SMS delivery if carriers block messages, cannot prevent all missed calls, and is not an emergency service. You control forwarding through your carrier. AI Voice may fall back to voicemail if unavailable.',
    category: 'Features',
    source: 'Product Guide',
    keywords: ['limitations', 'what replyflow can\'t do', 'what replyflow does', 'replyflow capabilities', 'cannot do', 'not control'],
    readingTime: 2,
    relatedQuestions: ['What is ReplyFlow?', 'What are ReplyFlow\'s guarantees and limitations?', 'How does AI Voice work?'],
  },
  {
    id: 'live-calls',
    question: 'Does ReplyFlow answer live calls?',
    summary: 'AI Voice answers missed calls.',
    answer: 'Yes, AI Voice answers calls when you don\'t answer. When a call forwards to ReplyFlow, AI Voice answers the call and conducts a live conversation to collect caller information. This is not voicemail - it\'s a real-time AI conversation. If AI Voice is unavailable, calls fall back to voicemail with AI transcription.',
    category: 'Features',
    source: 'Product Guide',
    keywords: ['live calls', 'answer live calls', 'does it answer calls', 'real-time calls', 'answer phone'],
    readingTime: 2,
    relatedQuestions: ['How does AI Voice work?', 'What is ReplyFlow?', 'What if AI Voice isn\'t available?'],
  },
  {
    id: 'billing-trial-details',
    question: 'How does billing and trial work?',
    summary: 'Billing and trial overview.',
    answer: 'ReplyFlow offers a 14-day free trial with no charge. After the trial ends, you\'ll be charged $59/month if you choose to continue. You can cancel anytime before the trial ends with no charge. Billing is handled through Stripe. View your subscription status in Dashboard → Settings → Subscription.',
    category: 'Billing',
    source: 'Billing Guide',
    keywords: ['billing details', 'trial details', 'how billing works', 'when charged', 'trial end', 'subscription details'],
    readingTime: 2,
    relatedQuestions: ['How much does ReplyFlow cost?', 'Will I be charged during the trial?', 'How do I cancel before the trial ends?'],
  },
  {
    id: 'contact-support',
    question: 'How do I contact support?',
    summary: 'Support contact information.',
    answer: 'For account-specific issues, SMS delivery failures, billing questions, or technical problems, email support at support@replyflowhq.com. Include your business name and a description of the issue. For general questions, use this help assistant to search our knowledge base.',
    category: 'Support',
    source: 'Support Guide',
    keywords: ['contact support', 'support email', 'help', 'get help', 'talk to support', 'support contact'],
    readingTime: 1,
    relatedQuestions: ['What is ReplyFlow?', 'Billing portal not accessible or not working', 'What are ReplyFlow\'s guarantees and limitations?'],
  },
  {
    id: 'billing-portal-issues',
    question: 'Billing portal not accessible or not working',
    summary: 'Stripe billing portal troubleshooting.',
    answer: 'If you can\'t access the billing portal: 1) Go to Dashboard → Settings → Subscription, 2) Click "Manage Subscription" to access Stripe, 3) Ensure you\'re logged into the correct Stripe account, 4) Try clearing your browser cache and cookies, 5) If the Stripe portal shows an error, it may be a temporary Stripe issue - try again later. For persistent billing portal issues, contact support at support@replyflowhq.com.',
    category: 'Troubleshooting',
    source: 'Support Guide',
    keywords: ['billing portal', 'stripe portal', 'can\'t access billing', 'subscription not showing', 'stripe error'],
    readingTime: 2,
    relatedQuestions: ['How do I contact support?', 'How does billing and trial work?', 'How do I cancel before the trial ends?'],
  },
  {
    id: 'guarantees-limits',
    question: 'What are ReplyFlow\'s guarantees and limitations?',
    summary: 'Legal and service limitations.',
    answer: 'ReplyFlow does NOT guarantee SMS delivery (carriers may block messages), does NOT provide legal or compliance guarantees (consult legal counsel for compliance), does NOT replace emergency services (do not use for emergencies), and does NOT guarantee AI Voice availability (may fall back to voicemail). ReplyFlow provides best-effort service for missed-call recovery and lead capture. For specific guarantees, contact support.',
    category: 'Support',
    source: 'Legal Guide',
    keywords: ['guarantee', 'delivery guarantee', 'sms guarantee', 'legal guarantee', 'compliance guarantee', 'emergency'],
    readingTime: 2,
    relatedQuestions: ['What can and can\'t ReplyFlow do?', 'How do I contact support?', 'Is ReplyFlow TCPA compliant?'],
  },
  {
    id: 'how-replyflow-works',
    question: 'How ReplyFlow works',
    summary: 'From missed call to Customer and beyond—end-to-end flow in minutes.',
    answer: `When you would use this
Understand the full journey from call to conversation, appointment, and payment.

Step-by-step instructions
1) A caller dials your existing business number.
2) If you don't answer, your carrier forwards the call to your ReplyFlow number.
3) AI Voice answers live (or voicemail fallback) and captures key details.
4) ReplyFlow sends an SMS to the caller and creates a Customer in your dashboard.
5) You reply in the Conversation, schedule an appointment, and optionally request payment.

Tips / Best Practices
- Enable forwarding and test once to unlock the full flow.
- Connect Google Calendar to create appointments directly.
- Use Payment Requests to collect deposits or balances.

Common problems
- Forwarding not triggering; see troubleshooting.
- SMS delays; see 'SMS did not send'.

Related articles
- What is ReplyFlow?
- Setup checklist
- Test your setup`,
    category: 'Overview',
    source: 'Product Guide',
    keywords: ['how replyflow works', 'flow', 'missed call', 'overview'],
    readingTime: 3,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['What is ReplyFlow?', 'Setup checklist', 'Test your setup'],
  },
  {
    id: 'setup-checklist',
    question: 'Setup checklist',
    summary: 'The fastest path from signup to your first Customer.',
    answer: `When you would use this
Follow this to complete setup in minutes.

Step-by-step instructions
1) Enter your business name and phone in onboarding.
2) Enable conditional forwarding from your business phone to your ReplyFlow number.
3) Make a test call from a different phone and confirm SMS arrives.
4) (Optional) Connect Google Calendar.
5) (Optional) Send a Payment Request to a test Customer.

Tips / Best Practices
- Save enable/disable codes.
- Add personal contacts to keep non-customer calls separate.

Common problems
- Forwarding not working → see troubleshooting.
- No lead created → see 'No lead after test'.

Related articles
- Forwarding basics
- Test your setup
- Connect Google Calendar`,
    category: 'Getting Started',
    source: 'Onboarding Guide',
    keywords: ['checklist', 'getting started', 'setup steps'],
    readingTime: 2,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['Forwarding basics', 'Test your setup', 'Connect Google Calendar'],
  },
  {
    id: 'carrier-forwarding-codes',
    question: 'Carrier Forwarding Codes',
    summary: 'Enable/disable conditional call forwarding by carrier in one place.',
    answer: `When you would use this
Use this to quickly find your carrier's enable/disable codes.

Step-by-step instructions
Enable forwarding (dial from your business phone):
- Verizon: *71 <ReplyFlowNumber>
- AT&T: *004*<ReplyFlowNumber>#
- T‑Mobile: **61*<ReplyFlowNumber>#
- Comcast/Xfinity: *72 <ReplyFlowNumber>
- VoIP (RingCentral/Grasshopper/Google Voice/Nextiva/8x8): set in your provider's web portal.

Disable forwarding:
- Verizon: *73
- AT&T: #004#
- T‑Mobile: #61#
- Comcast/Xfinity: *73
- VoIP: turn off in portal

Tips / Best Practices
- Codes must be dialed from the business line.
- After changes, test from a different phone.

Common problems
- Using unconditional codes on mobile lines may cause all calls to skip ringing. Prefer conditional (no answer) codes above.

Related articles
- Forwarding basics
- Disable call forwarding
- Troubleshoot call forwarding`,
    category: 'Call Forwarding',
    source: 'Onboarding Guide',
    keywords: ['codes', 'carrier', 'verizon', 'att', 't-mobile', 'comcast', 'conditional forwarding'],
    readingTime: 3,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['Forwarding basics', 'Disable call forwarding', 'Test your setup'],
  },
  {
    id: 'customers-vs-leads',
    question: 'Customers vs Leads',
    summary: 'How ReplyFlow organizes people who contact your business.',
    answer: `When you would use this
Understand what you see in the dashboard and how statuses work.

Step-by-step instructions
1) When a new call/text is captured, ReplyFlow creates a Customer record (often called a "lead" at first contact).
2) Conversations show the full message history with that Customer.
3) Statuses help you track progress (e.g., New, Active, Completed).

Tips / Best Practices
- Use statuses consistently to prioritize follow-up.
- Avoid manual duplicates—search by phone number first.

Common problems
- Duplicate entries: see 'Handle duplicates & repeat callers'.

Related articles
- Lead statuses and lifecycle
- Replying to customers
- Export customers and conversations`,
    category: 'Customers & Conversations',
    source: 'Product Guide',
    keywords: ['customers', 'leads', 'conversations', 'statuses'],
    readingTime: 2,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['What do lead statuses mean?', 'How do I reply to a customer?'],
  },
  {
    id: 'payment-requests-overview',
    question: 'Payment Requests overview',
    summary: 'What Payment Requests are and how they work from send to paid.',
    answer: `When you would use this
Collect deposits and balances with a branded link sent via SMS.

Step-by-step instructions
1) Choose a Customer.
2) Enter amount and (optional) description.
3) Send the link via SMS; the customer pays on a secure page.
4) Track status (pending/paid/cancelled/expired) in Payments.

Tips / Best Practices
- Include a clear description (e.g., "Deposit for lawn service 7/20").
- Follow up politely if pending after 24–48 hours.

Common problems
- Link expired or cancelled—create a new request.

Related articles
- Create and send a Payment Request
- Supported payment methods
- Manage Payment Requests`,
    category: 'Payments',
    source: 'Product Guide',
    keywords: ['payment requests', 'payments', 'collect payment', 'checkout link'],
    readingTime: 3,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['Create and send a Payment Request', 'Supported payment methods'],
  },
  {
    id: 'create-payment-request',
    question: 'Create and send a Payment Request',
    summary: 'Step-by-step to request a payment from a Customer.',
    answer: `When you would use this
Collect a deposit or balance due for a specific Customer/job.

Step-by-step instructions
1) Go to Payments → Request Payment.
2) Select a Customer (and optional Job).
3) Enter amount and description; choose provider.
4) Send the request. Copy/open the link if needed.

Tips / Best Practices
- Verify the phone number on the Customer profile.
- If using Venmo/PayPal, you may need to mark paid manually after confirmation.

Common problems
- Customer can't open link—send again or copy the link manually.

Related articles
- Payment Requests overview
- Supported payment methods
- Manage Payment Requests`,
    category: 'Payments',
    source: 'Product Guide',
    keywords: ['create payment request', 'send payment', 'request payment'],
    readingTime: 2,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['Payment Requests overview', 'Supported payment methods'],
  },
  {
    id: 'tap-to-pay-requirements',
    question: 'Tap to Pay requirements',
    summary: 'What you need to accept contactless payments with your phone.',
    answer: `When you would use this
Verify device and account readiness before enabling Tap to Pay.

Step-by-step instructions
1) Use a supported mobile device (see device list in app) with the ReplyFlow mobile app.
2) Connect Stripe in Settings → Payments and enable in-person payments.
3) Follow the in-app setup prompts before collecting a payment.

Tips / Best Practices
- Test with a small amount first.
- Ensure stable network connectivity during payments.

Common problems
- Stripe not connected—finish onboarding in Settings.

Related articles
- Set up Tap to Pay
- Collect a Tap to Pay payment
- Supported payment methods`,
    category: 'Tap to Pay',
    source: 'Product Guide',
    keywords: ['tap to pay', 'requirements', 'contactless', 'stripe'],
    readingTime: 2,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['Set up Tap to Pay', 'Collect a Tap to Pay payment'],
  },
  {
    id: 'manage-subscription',
    question: 'Manage subscription (Stripe)',
    summary: 'Update plan, cancel, change payment method, and access invoices.',
    answer: `When you would use this
Self-serve subscription management.

Step-by-step instructions
1) Go to Dashboard → Settings → Subscription.
2) Click Manage Subscription to open the Stripe portal.
3) From the portal you can:
   - Update payment method
   - View/download invoices and receipts
   - Change/cancel your subscription

Tips / Best Practices
- If the portal won’t open, try an incognito window or clear cookies.

Common problems
- Portal not accessible—see 'Billing portal troubleshooting'.

Related articles
- Pricing and trial
- Billing portal troubleshooting`,
    category: 'Billing & Subscription',
    source: 'Billing Guide',
    keywords: ['manage subscription', 'update payment method', 'invoices', 'cancel'],
    readingTime: 2,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['Pricing and trial', 'Billing portal troubleshooting'],
  },
  {
    id: 'billing-portal',
    question: 'Billing portal (how to use)',
    summary: 'Access your Stripe customer portal to manage billing.',
    answer: `When you would use this
Open your Stripe portal to manage payment details and invoices.

Step-by-step instructions
1) Dashboard → Settings → Subscription → Manage Subscription.
2) In the Stripe portal, choose the action you need (update card, receipts, cancel, etc.).

Tips / Best Practices
- Use a modern browser; allow pop-ups for the portal domain.

Common problems
- Portal not loading—see 'Billing portal troubleshooting'.

Related articles
- Manage subscription (Stripe)
- Pricing and trial`,
    category: 'Billing & Subscription',
    source: 'Billing Guide',
    keywords: ['billing portal', 'stripe portal', 'manage billing'],
    readingTime: 1,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['Manage subscription (Stripe)', 'Billing portal troubleshooting'],
  },
  {
    id: 'forwarding-basics',
    question: 'Forwarding basics',
    summary: 'Forward your existing business number to your ReplyFlow number using conditional call forwarding.',
    answer: `When you would use this
Understand what to forward and why before dialing any carrier codes.

Step-by-step instructions
1) Keep your existing public business number. Do not change what customers dial.
2) Enable conditional call forwarding from your business line to your ReplyFlow number (for no-answer).
3) Make a test call from a different phone to confirm it forwards correctly.

Tips / Best Practices
- Conditional forwarding ensures answered calls still reach you first.
- Save your enable/disable codes for quick changes.

Common problems
- Calls not forwarding: see 'Call forwarding is not working'.
- Testing from the same phone: forwarding won't trigger; use a different phone.

Related articles
- Carrier Forwarding Codes
- Disable call forwarding
- Test your setup`,
    category: 'Call Forwarding',
    source: 'Onboarding Guide',
    keywords: ['forwarding basics', 'which number', 'conditional forwarding', 'business number'],
    readingTime: 3,
    lastUpdated: '2026-07-24',
    relatedQuestions: ['Carrier Forwarding Codes', 'Disable call forwarding', 'Test your setup'],
  },
  {
    id: 'mobile-communication',
    question: 'Mobile communication preferences',
    summary: 'The ReplyFlow mobile app gives you the flexibility to choose whether customer communication uses your ReplyFlow Number or your own business phone.',
    answer: `When you would use this
The mobile app's communication preference feature is designed for contractors who are often in the field and need to communicate in the way that works best for each situation.

How it works
- Desktop: Customer communication is handled through your ReplyFlow Number for a consistent, fully tracked experience
- Mobile App: You can choose whether customer communication uses your ReplyFlow Number or your own business phone
- You can override your preference for individual calls, texts, and payment requests

Step-by-step instructions
1) Open the ReplyFlow mobile app
2) Go to Settings → Mobile Communication
3) Choose your preferred communication method (ReplyFlow Number or My Business Phone)
4) When communicating with a customer, you can override this preference for that specific interaction

Tips / Best Practices
- Use your ReplyFlow Number for full conversation tracking
- Use your business phone when you need to communicate from your personal number
- The mobile app gives you the flexibility to switch based on the situation

Common problems
- If you don't see the Mobile Communication option, make sure you're using the latest version of the mobile app

Related articles
- Can I use my own business phone?
- Does ReplyFlow replace my business phone?
- Can I switch between the ReplyFlow Number and my business phone?`,
    category: 'Mobile App',
    source: 'Product Guide',
    keywords: ['mobile', 'communication', 'business phone', 'replyflow number', 'mobile app', 'flexibility', 'on the go'],
    readingTime: 2,
    lastUpdated: '2026-07-29',
    relatedQuestions: ['Can I use my own business phone?', 'Does ReplyFlow replace my business phone?', 'Can I switch between the ReplyFlow Number and my business phone?'],
  },
  {
    id: 'desktop-vs-mobile',
    question: 'What can I do on mobile vs desktop?',
    summary: 'ReplyFlow is designed around how service businesses actually work. Desktop is for managing your business, while the mobile app is for running your day.',
    answer: `When you would use this
ReplyFlow is designed to support contractors throughout their entire workday, whether they're at the office or on the job site. Both platforms are equally important but optimized for different moments.

Desktop: Your business command center
Use desktop when you need to:
- Review AI-captured leads from overnight
- Check your schedule and prepare your day
- Organize customers and manage jobs
- Track payments and view reports
- Plan tomorrow and follow up with customers

Mobile App: Your field companion
Use the mobile app when you're on the go to:
- Call and text customers using your ReplyFlow Number or your own business phone
- Accept Tap to Pay while meeting a customer
- Send payment requests before leaving the job site
- Always have today's appointments in your pocket
- Manage customers while away from your desk

Step-by-step instructions
1) Start your morning at your desktop: review leads, check schedule, plan your day
2) Use the mobile app throughout the day: communicate, get paid, manage jobs on site
3) Return to desktop in the evening: review completed jobs, organize tomorrow, follow up

Tips / Best Practices
- Desktop is best for organizing and planning your business
- Mobile is built for contractors, technicians, and real job sites
- Both platforms sync automatically so you always have up-to-date information
- You can work entirely from your phone, but desktop offers the best experience for business management

Common problems
- If you don't see the latest information, check your internet connection and pull to refresh on mobile

Related articles
- Mobile communication preferences
- Can I use my own business phone?
- When should I use the ReplyFlow mobile app?`,
    category: 'Platform',
    source: 'Product Guide',
    keywords: ['desktop', 'mobile', 'platform', 'when to use', 'mobile vs desktop', 'field work', 'office work'],
    readingTime: 3,
    lastUpdated: '2026-07-29',
    relatedQuestions: ['What can I do on mobile?', 'Why download the app?', 'Do I need the mobile app?'],
  },
]
