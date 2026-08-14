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
    question: 'Tap to Pay on iPhone requirements',
    summary: 'What you need to accept contactless payments using Apple\'s Tap to Pay on iPhone feature.',
    answer: `When you would use this
Verify device and account readiness before enabling Tap to Pay on iPhone.

Step-by-step instructions
1) Use a supported iPhone (iPhone XS or later with iOS 16.0 or later).
2) Connect Stripe in Settings → Payments and enable in-person payments.
3) Follow the in-app setup prompts before collecting a payment.

Tips / Best Practices
- Test with a small amount first.
- Ensure stable network connectivity during payments.
- Tap to Pay on iPhone is an Apple feature available on iPhone only.

Common problems
- Stripe not connected—finish onboarding in Settings.
- iPhone not supported—ensure iPhone XS or later with iOS 16.0+.

Related articles
- Set up Tap to Pay on iPhone
- Collect a Tap to Pay payment
- Supported payment methods`,
    category: 'Tap to Pay',
    source: 'Product Guide',
    keywords: ['tap to pay', 'tap to pay on iphone', 'requirements', 'contactless', 'stripe', 'apple tap to pay', 'iphone nfc'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Set up Tap to Pay on iPhone', 'Collect a Tap to Pay payment'],
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
- Can I use my own business phone?
- When should I use the ReplyFlow mobile app?`,
    category: 'Platform',
    source: 'Product Guide',
    keywords: ['desktop', 'mobile', 'platform', 'when to use', 'mobile vs desktop', 'field work', 'office work'],
    readingTime: 3,
    lastUpdated: '2026-07-29',
    relatedQuestions: ['What can I do on mobile?', 'Why download the app?', 'Do I need the mobile app?'],
  },
  {
    id: 'delete-account',
    question: 'How do I delete my ReplyFlow account?',
    summary: 'Account deletion process and data handling.',
    answer: `When you would use this
Permanently close your ReplyFlow account and remove all data.

Step-by-step instructions
1) Go to Dashboard → Settings → Subscription.
2) Click "Manage Subscription" to access the Stripe portal.
3) Cancel your subscription first (if active).
4) Contact support at support@replyflowhq.com to request account deletion.
5) Include your business name and confirmation that you want to permanently delete your account.

Important notes
- Account deletion is permanent and cannot be undone.
- All customer data, conversations, and settings will be removed.
- Your ReplyFlow phone number will be released.
- Disable call forwarding before deletion to stop calls from forwarding.
- Payment history is managed by Stripe and may be retained according to Stripe's policies.

If you just want to stop using ReplyFlow temporarily, cancel your subscription instead of deleting your account.`,
    category: 'Settings & Account',
    source: 'Account Guide',
    keywords: ['delete account', 'close account', 'remove account', 'permanently delete', 'cancel account'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Manage subscription (Stripe)', 'Billing portal (how to use)', 'How do I contact support?'],
  },
  {
    id: 'connect-stripe',
    question: 'How do I connect Stripe?',
    summary: 'Connect Stripe to accept payments through ReplyFlow.',
    answer: `When you would use this
Set up Stripe to send and receive payments.

Step-by-step instructions
1) Go to Dashboard → Settings → Payments.
2) Click "Connect Stripe".
3) Sign in to your Stripe account (or create one if you don't have one).
4) Authorize ReplyFlow to access your Stripe account.
5) Wait for Stripe verification (may take 1-2 business days).

Important notes
- You must have a Stripe account to accept payments.
- ReplyFlow uses Stripe Connect for secure payment processing.
- Your Stripe account must be verified before you can receive payments.
- Verification status is shown in Settings → Payments.
- If verification is pending, contact Stripe directly for updates.

If you don't have a Stripe account, you'll be prompted to create one during the connection process.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['connect stripe', 'stripe setup', 'stripe connection', 'payment setup', 'accept payments'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Stripe verification pending', 'Payment Requests overview', 'Tap to Pay requirements'],
  },
  {
    id: 'stripe-verification-pending',
    question: 'Stripe says verification pending',
    summary: 'What to do when Stripe verification is pending.',
    answer: `When you would use this
Understand and resolve Stripe verification status.

Step-by-step instructions
1) Check your verification status in Dashboard → Settings → Payments.
2) If pending, wait 1-2 business days for Stripe to complete verification.
3) Check your Stripe dashboard for any required documents or information.
4) Upload any requested documents to your Stripe account.
5) Contact Stripe support directly for verification issues.

Important notes
- Verification is handled by Stripe, not ReplyFlow.
- ReplyFlow cannot expedite Stripe verification.
- Common verification requirements: business information, tax ID, bank account, proof of identity.
- You can still use ReplyFlow for missed calls and SMS while verification is pending.
- Payment requests will not work until verification is complete.

If verification fails, follow Stripe's guidance to resolve the issue. ReplyFlow cannot override Stripe's verification decisions.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['stripe verification', 'verification pending', 'stripe pending', 'verification failed', 'stripe not verified'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['How do I connect Stripe?', 'Billing portal not accessible or not working', 'How do I contact support?'],
  },
  {
    id: 'setup-tap-to-pay',
    question: 'Set up Tap to Pay on iPhone',
    summary: 'Enable contactless payments using Apple\'s Tap to Pay on iPhone feature.',
    answer: `When you would use this
Accept in-person payments with your iPhone using Apple's Tap to Pay on iPhone feature.

Step-by-step instructions
1) Ensure you have a supported iPhone (iPhone XS or later with iOS 16.0 or later).
2) Go to Settings → Payments in the ReplyFlow mobile app.
3) Click "Connect Stripe" and complete Stripe connection.
4) Enable "In-Person Payments" in your Stripe account.
5) Follow the in-app setup prompts to configure Tap to Pay on iPhone.
6) Test with a small amount before accepting customer payments.

Important notes
- Tap to Pay on iPhone requires Stripe verification to be complete.
- Your iPhone must have NFC enabled.
- Ensure stable network connectivity during payments.
- Tap to Pay on iPhone is an Apple feature available on iPhone only.
- Android support is not available at this time.

If Tap to Pay on iPhone is not available, check your iOS version and Stripe verification status.`,
    category: 'Tap to Pay',
    source: 'Payments Guide',
    keywords: ['setup tap to pay', 'enable tap to pay', 'tap to pay on iphone', 'contactless payments', 'nfc payments', 'apple tap to pay'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Tap to Pay requirements', 'Collect a Tap to Pay payment', 'How do I connect Stripe?'],
  },
  {
    id: 'tap-to-pay-not-working',
    question: 'Tap to Pay on iPhone stopped working',
    summary: 'Troubleshoot Tap to Pay on iPhone issues.',
    answer: `When you would use this
Resolve Tap to Pay on iPhone failures and errors.

Common problems and solutions
1) Stripe verification incomplete: Complete Stripe verification in your Stripe account.
2) iOS version outdated: Update to iOS 16.0 or later.
3) NFC disabled: Enable NFC in iPhone Settings.
4) Network issue: Ensure stable internet connection.
5) App outdated: Update ReplyFlow mobile app to latest version.
6) Stripe account issue: Check Stripe dashboard for account status.

Step-by-step troubleshooting
1) Check Settings → Payments for verification status.
2) Verify iOS version in Settings → General → About.
3) Enable NFC in Settings → Privacy & Security → NFC.
4) Test with a different payment card.
5) Restart the ReplyFlow app and try again.
6) Contact support if issues persist.

Important notes
- Tap to Pay on iPhone requires active internet connection.
- Some cards may not support contactless payments.
- ReplyFlow cannot fix Stripe account issues.
- Tap to Pay on iPhone is iPhone only; Android is not supported.`,
    category: 'Tap to Pay',
    source: 'Payments Guide',
    keywords: ['tap to pay not working', 'tap to pay on iphone failed', 'contactless payment failed', 'nfc not working', 'apple tap to pay not working'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Set up Tap to Pay on iPhone', 'Tap to Pay requirements', 'How do I connect Stripe?'],
  },
  {
    id: 'create-appointment',
    question: 'How do I create an appointment?',
    summary: 'Create appointments from conversations.',
    answer: `When you would use this
Schedule appointments directly from customer conversations.

Step-by-step instructions
1) Ensure Google Calendar is connected in Dashboard → Calendar.
2) Open a customer conversation.
3) Click the appointment icon or "Schedule" button.
4) Enter the appointment date, time, and title.
5) Add any notes or details.
6) Save the appointment.

Important notes
- Appointments sync to your connected Google Calendar.
- The customer will not receive a calendar invite unless you send one separately.
- You can edit or delete appointments from the Calendar page.
- If Google Calendar is not connected, you cannot create appointments.
- Appointments appear in both ReplyFlow and Google Calendar.

If the appointment doesn't appear in Google Calendar, check that the calendar is connected and refresh the page.`,
    category: 'Calendar',
    source: 'Calendar Guide',
    keywords: ['create appointment', 'schedule appointment', 'add appointment', 'book appointment'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['How do I connect Google Calendar?', 'Why are events not showing?', 'Calendar not connected or not syncing'],
  },
  {
    id: 'push-notifications-setup',
    question: 'How do I enable push notifications?',
    summary: 'Enable push notifications on your mobile device.',
    answer: `When you would use this
Receive notifications for new messages and updates on your mobile device.

Step-by-step instructions (iOS)
1) Open iPhone Settings.
2) Go to Notifications.
3) Find ReplyFlow in the app list.
4) Enable "Allow Notifications".
5) Enable notification types you want (alerts, sounds, badges).
6) Return to ReplyFlow app.

Step-by-step instructions (Android)
1) Open Android Settings.
2) Go to Apps → ReplyFlow.
3) Tap "Notifications".
4) Enable notifications.
5) Select notification types you want.
6) Return to ReplyFlow app.

Important notes
- You must allow notifications when first prompted by the app.
- If you previously denied, go to device settings to re-enable.
- Notifications require internet connection.
- Do Not Disturb mode may suppress notifications.
- Check device battery settings if notifications stop arriving.

If you're not receiving notifications, check device settings, ensure the app has permission, and verify you're not in Do Not Disturb mode.`,
    category: 'Notifications',
    source: 'Notifications Guide',
    keywords: ['push notifications', 'enable notifications', 'notification setup', 'notification permissions', 'turn on notifications'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Push notification missing', 'Permission denied', 'Why notification may not arrive'],
  },
  {
    id: 'push-notification-missing',
    question: 'Push notification missing',
    summary: 'Troubleshoot missing push notifications.',
    answer: `When you would use this
Resolve issues with notifications not arriving.

Common causes and solutions
1) Notifications disabled: Enable in device settings (see "Enable push notifications").
2) Permission denied: Go to device settings and grant notification permission.
3) Do Not Disturb: Turn off Do Not Disturb mode.
4) App backgrounded: Ensure app can run in background.
5) Network issue: Check internet connection.
6) Battery optimization: Disable battery optimization for ReplyFlow.
7) App outdated: Update to latest version.

Step-by-step troubleshooting
1) Check device notification settings for ReplyFlow.
2) Verify notification permission is granted.
3) Turn off Do Not Disturb mode.
4) Check internet connection.
5) Update ReplyFlow app to latest version.
6) Restart your device.
7) Contact support if issues persist.

Important notes
- Notifications require active internet connection.
- Some Android devices restrict background apps; check battery settings.
- iOS may restrict notifications if app is force-closed.
- Notification delays can occur due to carrier or device limitations.

If notifications still don't arrive after troubleshooting, contact support at support@replyflowhq.com.`,
    category: 'Notifications',
    source: 'Notifications Guide',
    keywords: ['notification missing', 'no notification', 'notification not arriving', 'notification not working', 'push notification failed'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['How do I enable push notifications?', 'Permission denied', 'Why notification may not arrive'],
  },
  {
    id: 'create-account',
    question: 'How do I create a ReplyFlow account?',
    summary: 'Sign up for ReplyFlow and get started.',
    answer: `When you would use this
Create a new ReplyFlow account to start using the service.

Step-by-step instructions
1) Go to the ReplyFlow website and click "Sign Up".
2) Enter your email address and create a password.
3) Verify your email address by clicking the link in the confirmation email.
4) Complete your business profile (business name, address, phone number).
5) Follow the setup checklist to configure call forwarding and Google Calendar.
6) Start your free trial or choose a subscription plan.

Important notes
- You must verify your email before accessing your account.
- Business information is required for call forwarding and SMS.
- A trial period is available to test the service before subscribing.
- Call forwarding must be configured to receive missed call text messages.

If you don't receive the verification email, check your spam folder or request a new verification.`,
    category: 'Getting Started',
    source: 'Account Guide',
    keywords: ['create account', 'sign up', 'register', 'new account', 'get started'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Setup checklist', 'How does ReplyFlow work?', 'What is ReplyFlow?'],
  },
  {
    id: 'delete-customer',
    question: 'How do I delete a customer?',
    summary: 'Remove customer records from your ReplyFlow account.',
    answer: `When you would use this
Permanently delete a customer record from your account.

Step-by-step instructions
1) Go to Dashboard → Leads.
2) Find and click on the customer you want to delete.
3) Look for a delete or remove option in the customer details.
4) Confirm the deletion when prompted.

Important notes
- Customer deletion is permanent and cannot be undone.
- Deleting a customer removes their conversations, payments, and appointment history.
- This is different from deleting your entire ReplyFlow account.
- If you just want to remove a customer from your active view, you can ignore them instead.

If you don't see a delete option, contact support at support@replyflowhq.com for assistance.`,
    category: 'Customers & Conversations',
    source: 'Account Guide',
    keywords: ['delete customer', 'remove customer', 'delete lead', 'remove lead'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['How do I delete my account?', 'Customers vs Leads', 'Opt-out behavior'],
  },
  {
    id: 'refund-guidance',
    question: 'How do I process a refund?',
    summary: 'Refund policy and where to process refunds.',
    answer: `When you would use this
Understand how refunds work and where to process them.

Important information
- ReplyFlow does not process refunds directly.
- Refunds are managed entirely through your Stripe account.
- ReplyFlow is a payment facilitator using Stripe Connect.

Step-by-step instructions
1) Log in to your Stripe dashboard.
2) Navigate to the payment you want to refund.
3) Click the refund button and follow Stripe's instructions.
4) The refund will be processed by Stripe according to their policies.

Important notes
- Refund availability and timing are determined by Stripe, not ReplyFlow.
- ReplyFlow support cannot process refunds on your behalf.
- Contact Stripe support for refund-related issues.
- Payment history in ReplyFlow will reflect the refund status after Stripe processes it.

If you need help with a specific refund, contact Stripe support directly.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['refund', 'process refund', 'return payment', 'stripe refund'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Payment Requests overview', 'Manage subscription (Stripe)', 'How do I connect Stripe?'],
  },
  {
    id: 'password-management',
    question: 'How do I change my password?',
    summary: 'Password reset flow and account access recovery.',
    answer: `When you would use this
Reset your password if you've forgotten it or want to update it.

Important note
ReplyFlow does not have an in-app password change option while you're signed in. You must use the password reset flow.

Step-by-step instructions
1) Go to the sign-in page (/auth?mode=signin).
2) Click "Forgot password?" below the password field.
3) Enter your email address and submit.
4) Check your email for a password reset link from ReplyFlow/Supabase.
5) Click the reset link in the email.
6) Enter your new password (must be at least 8 characters).
7) Confirm your new password and submit.

Important notes
- The reset link expires after a period of time.
- If the link expires, request a new reset link.
- After resetting, you'll be signed out and redirected to sign in.
- Sign in with your new password.
- If you can't access your email, contact support at support@replyflowhq.com.

Password requirements
- Must be at least 8 characters long
- Must be different from your current password

Admin reset
For administrators: Passwords can be reset for other users through the admin support tools.
Contact support if you need assistance with admin password reset.`,
    category: 'Settings & Account',
    source: 'Account Guide',
    keywords: ['change password', 'reset password', 'forgot password', 'password reset', 'update password'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Data privacy', 'How do I delete my account?', 'How do I contact support?'],
  },
  {
    id: 'data-privacy',
    question: 'What data does ReplyFlow store?',
    summary: 'Information about data storage, external providers, and privacy.',
    answer: `When you would use this
Understand what information ReplyFlow stores and where it's stored.

Data stored by ReplyFlow
- Customer conversations (SMS messages, call details)
- Customer contact information (name, phone, email, address)
- Appointment and calendar information
- Payment request records
- Business settings and configurations
- Account and subscription information

External providers
ReplyFlow uses several external services to provide its features:

- **Supabase**: Database and authentication (stores customer data, user accounts, settings)
- **Twilio**: SMS services (sends and receives text messages)
- **Stripe**: Payment processing (handles customer payments, subscription billing)
- **Google**: Calendar integration (stores appointment data in Google Calendar)
- **OpenAI**: AI Voice services (processes call audio, generates responses)

Data location
- Your data is stored in ReplyFlow's databases hosted on Supabase.
- Calendar data is also stored in your connected Google Calendar.
- Payment data is stored and processed by Stripe.
- SMS message data is stored by Twilio.

Data retention and deletion
- Deleting a customer removes their data from ReplyFlow's database.
- Deleting your ReplyFlow account removes all your data from ReplyFlow's database.
- Payment history is managed by Stripe and may be retained according to Stripe's policies.
- External providers (Google, Twilio, Stripe, OpenAI) have their own data retention policies.

Important notes
- ReplyFlow does not provide legal advice or compliance guarantees.
- For specific data privacy questions or GDPR requests, contact support at support@replyflowhq.com.
- Review the privacy policy and terms of service for detailed information.`,
    category: 'Settings & Account',
    source: 'Privacy Guide',
    keywords: ['data privacy', 'data storage', 'privacy', 'gdpr', 'data retention', 'what data is stored'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['How do I delete my account?', 'How do I delete a customer?', 'Password management'],
  },
  {
    id: 'schedule-overview',
    question: 'What are the Schedule tabs?',
    summary: 'Overview of the Schedule page tabs: Agenda, Calendar, and Map.',
    answer: `When you would use this
Understand the three tabs in the Schedule page and what each shows.

Schedule tabs
The Schedule page has three tabs:

1) Agenda (default)
- Shows tasks and jobs
- Tasks are to-do items you create
- Jobs are scheduled appointments with customers
- Filter by status: All, Active, Overdue, Future, Completed
- Create new tasks and jobs from this tab

2) Calendar
- Shows a monthly calendar grid
- Displays appointments from your Google Calendar
- Shows ReplyFlow jobs as calendar events
- Create new appointments from this tab
- Click on events to view details

3) Map
- Shows your scheduled jobs and customers on a map
- Displays markers for job locations
- Requires valid service addresses to show markers
- Helps visualize your daily route
- Click markers to view job details

Important notes
- Agenda is the canonical location for Tasks
- Jobs appear in both Agenda and Calendar tabs
- Jobs with valid addresses appear on the Map tab
- All tabs show the same underlying data
- Your tab selection is saved when you navigate

What to check if data is missing
- Agenda: Check that tasks and jobs are created
- Calendar: Check that Google Calendar is connected
- Map: Check that jobs have valid service addresses`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['schedule tabs', 'agenda', 'calendar', 'map', 'schedule overview'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['How do I create a task?', 'How do I create a job?', 'Google Calendar connection'],
  },
  {
    id: 'create-task',
    question: 'How do I create a task?',
    summary: 'Creating and managing tasks in the Agenda tab.',
    answer: `When you would use this
Create a to-do item or follow-up task for yourself or your team.

Step-by-step instructions
1) Go to the Schedule page (/dashboard/calendar).
2) Click the Agenda tab (default).
3) Click the "New Task" button.
4) Enter the task title.
5) Add optional notes.
6) Set a due date and time (optional).
7) Link to a customer or job (optional).
8) Click "Create Task".

Task fields
- Title: Required. What the task is about.
- Notes: Optional. Additional details.
- Due date: Optional. When the task is due.
- Due time: Optional. What time the task is due.
- Customer: Optional. Link to a specific customer.
- Job: Optional. Link to a specific job.

Task status
Tasks can have these statuses:
- Active: Not completed and not overdue
- Overdue: Past the due date/time
- Future: Scheduled for a future date
- Completed: Marked as done

Editing and deleting tasks
- Click a task to view details.
- Click the edit icon to modify the task.
- Click the delete icon to remove the task.

Where tasks appear
- Tasks appear in the Agenda tab of the Schedule page.
- Tasks linked to a job appear in that job's details.
- Completed tasks show a checkmark.

Important notes
- Tasks are internal to-do items, not customer-facing.
- Tasks do not send SMS messages to customers.
- Tasks are not shown on the Calendar or Map tabs.`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['create task', 'new task', 'task management', 'to-do', 'follow-up'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Schedule overview', 'How do I create a job?', 'Intake Complete vs Job Completed'],
  },
  {
    id: 'create-job',
    question: 'How do I create a job?',
    summary: 'Creating and managing jobs for customer appointments.',
    answer: `When you would use this
Schedule an appointment or service visit with a customer.

Step-by-step instructions
From the Schedule page:
1) Go to the Schedule page (/dashboard/calendar).
2) Click the Agenda or Calendar tab.
3) Click "New Job" or "New Appointment."
4) Select a customer or create a new one.
5) Enter the job title.
6) Set the date and time.
7) Enter the service address.
8) Add optional notes.
9) Click "Create Job."

From a customer page:
1) Go to the customer's details page.
2) Click "Schedule Job" or "Create Appointment."
3) Fill in the job details.
4) Click "Create Job."

Job fields
- Customer: Required. The customer for this job.
- Title: Required. What the job is for.
- Date and time: Required. When the job is scheduled.
- Service address: Required. Where the work will be done.
- Notes: Optional. Additional details about the job.
- Google Calendar event: Optional. Link to a calendar event.

Job status
Jobs can have these statuses:
- Scheduled: Upcoming appointment
- In progress: Currently being worked on
- Completed: Work is finished
- Canceled: Appointment was canceled

Where jobs appear
- Jobs appear in the Agenda tab of the Schedule page.
- Jobs appear as events on the Calendar tab.
- Jobs with valid addresses appear as markers on the Map tab.
- Jobs appear in the customer's details page.

Editing and deleting jobs
- Click a job to view details.
- Click edit to modify the job.
- Click delete to remove the job.

Important notes
- Jobs are customer-facing appointments.
- Jobs can be linked to Google Calendar events.
- Jobs must have a valid service address to appear on the Map.
- Canceling a job does not automatically refund any payment.`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['create job', 'new job', 'schedule appointment', 'book appointment'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Schedule overview', 'How do I create a task?', 'Intake Complete vs Job Completed'],
  },
  {
    id: 'intake-complete-vs-job-completed',
    question: 'What is the difference between Intake Complete and Job Completed?',
    summary: 'Understanding the distinction between AI intake status and job completion.',
    answer: `When you would use this
Understand why "Intake Complete" does not mean the customer's work was done.

Intake Complete
- Means the AI has finished gathering information from the customer.
- The customer's phone call has ended.
- All available information has been collected.
- The customer may or may not have a scheduled appointment.
- Does NOT mean the work is done.

Job Completed
- Means you have finished the work for the customer.
- The appointment or service visit is complete.
- The job status is set to "Completed."
- This is the actual completion of work.

Why the distinction matters
- Intake Complete happens during the phone call.
- Job Completed happens after you do the work.
- A customer can have Intake Complete without a job scheduled.
- A job can be scheduled before intake is complete.

Common scenarios

Scenario 1: Intake Complete, no job
- Customer called, information gathered.
- No appointment was scheduled.
- You need to create a job to schedule the work.

Scenario 2: Job scheduled, intake not complete
- You created a job before the customer called.
- Customer calls later, intake completes.
- Job remains scheduled for the appointment time.

Scenario 3: Intake Complete, job scheduled, work not done
- Customer called, information gathered.
- Appointment is scheduled for next week.
- Work is not done until the appointment time.
- Job is not Completed until you finish the work.

Important notes
- Never tell a customer their job is done just because intake is complete.
- Always check the job status to confirm work completion.
- Intake Complete is about information gathering, not work completion.`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['intake complete', 'job completed', 'intake vs job', 'completion status'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['How do I create a job?', 'How do I create a task?', 'What does AI intake mean?'],
  },
  {
    id: 'customer-details-overview',
    question: 'What information is in a customer record?',
    summary: 'Overview of customer details page sections and available information.',
    answer: `When you would use this
Understand what information is available in a customer's details page.

Customer details sections
The customer details page has these sections:

1) Conversation
- SMS message history with the customer
- Photos and media shared by the customer
- Reply to the customer via SMS
- Send MMS photos

2) AI Intake Details
- Information gathered by the AI from the phone call
- Service address
- Additional details
- Request title (what the customer needs)

3) Jobs
- Scheduled appointments for this customer
- Job status (Scheduled, In Progress, Completed, Canceled)
- Create new jobs from this section
- View job details

4) Payments
- Payment requests sent to this customer
- Payment status (Pending, Paid, Failed, Canceled)
- Create new payment requests
- View payment details

5) Internal Notes
- Private notes for your team
- Not visible to the customer
- Add and edit notes

Customer information
- Name
- Phone number
- Status (Needs Reply, Active, Completed, Ignored)
- Created date

What you can do from a customer page
- Send SMS messages
- Schedule jobs
- Request payments
- Add internal notes
- Change customer status
- Delete the customer

Important notes
- Internal notes are private and not visible to customers.
- SMS messages are visible to customers.
- Payment history is managed through Stripe.
- Deleting a customer removes all their data.`,
    category: 'Customers & Conversations',
    source: 'Customer Guide',
    keywords: ['customer details', 'customer record', 'customer information', 'customer page'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['How do I edit a customer?', 'Internal notes', 'How do I delete a customer?'],
  },
  {
    id: 'edit-customer',
    question: 'How do I edit customer information?',
    summary: 'Editing customer name, phone, and other details.',
    answer: `When you would use this
Update a customer's name, phone number, or other information.

Important note
ReplyFlow does not have a dedicated "edit customer" form. Customer information is updated through:

1) SMS corrections
- If a customer sends a correction via SMS, ReplyFlow can update their information.
- The customer can text you with updated address or details.
- This is the primary way customer information is corrected.

2) AI Intake
- If the customer calls again, the AI can update their information.
- New information from the call updates the customer record.

What can be updated
- Service address
- Additional details
- Contact information (via corrections)

What cannot be edited directly
- Customer name (through the UI)
- Phone number (through the UI)
- Status (through the status dropdown)

If you need to correct customer name or phone number
- Contact support at support@replyflowhq.com.
- Explain the correction needed.
- Support can update the information for you.

Changing customer status
- Use the status dropdown on the customer details page.
- Options: Needs Reply, Active, Completed, Ignored.
- Status changes are saved immediately.

Important notes
- Direct editing of customer name and phone is not available in the UI.
- SMS corrections are the primary way for customers to update their information.
- Status changes do not require contacting support.`,
    category: 'Customers & Conversations',
    source: 'Customer Guide',
    keywords: ['edit customer', 'update customer', 'change customer name', 'change customer phone', 'customer corrections'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Customer details overview', 'Customer corrections', 'How do I delete a customer?'],
  },
  {
    id: 'internal-notes',
    question: 'How do I add internal notes to a customer?',
    summary: 'Adding private notes for your team that are not visible to customers.',
    answer: `When you would use this
Add private notes about a customer for yourself or your team.

Step-by-step instructions
1) Go to the customer's details page.
2) Scroll to the "Internal Notes" section.
3) Click in the notes text area.
4) Type your note.
5) Click "Save Note" or press Enter.

What to use internal notes for
- Reminders about the customer
- Special instructions for the job
- Follow-up items
- Team communication about the customer
- Context for future interactions

Important properties
- Internal notes are private.
- Customers cannot see internal notes.
- Notes are visible to all team members with access to the account.
- Notes are timestamped with the author.

Editing and deleting notes
- Click on a note to edit it.
- Click the delete icon to remove a note.
- Changes are saved immediately.

Where internal notes appear
- In the Internal Notes section of the customer details page.
- Notes are not included in SMS messages.
- Notes are not shown to customers.

Best practices
- Be specific and concise.
- Include dates and deadlines when relevant.
- Avoid sensitive information that shouldn't be in the system.
- Use notes for context, not for customer communication.

Important notes
- Internal notes are for internal use only.
- Do not put information in notes that you want the customer to see.
- Use SMS messages for customer-facing communication.`,
    category: 'Customers & Conversations',
    source: 'Customer Guide',
    keywords: ['internal notes', 'private notes', 'team notes', 'customer notes'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Customer details overview', 'How do I edit a customer?', 'How do I reply to a customer?'],
  },
  {
    id: 'payment-history',
    question: 'How do I view payment history?',
    summary: 'Viewing payment history for customers and your account.',
    answer: `When you would use this
View past payments, refunds, and payment status.

Customer payment history
To view a specific customer's payment history:
1) Go to the customer's details page.
2) Scroll to the "Payments" section.
3) View all payment requests for that customer.
4) Click on a payment to see details.

Account payment history
To view your ReplyFlow account's payment history:
1) Go to Settings.
2) Click "Billing Portal" or "Manage Subscription."
3) This opens the Stripe billing portal.
4) View your subscription payment history in Stripe.

What payment history shows
- Payment request date and time
- Payment amount
- Payment status (Pending, Paid, Failed, Canceled)
- Payment method (if applicable)
- Customer information

Payment statuses
- Pending: Payment request sent, not yet paid
- Paid: Payment completed successfully
- Failed: Payment attempt failed
- Canceled: Payment request was canceled

Important notes
- Customer payment history is stored in ReplyFlow and Stripe.
- Subscription payment history is in Stripe only.
- ReplyFlow does not process refunds directly.
- For refunds, log in to your Stripe dashboard.

Tap to Pay on iPhone history
Tap to Pay transactions are processed through Stripe.
View Tap to Pay history in your Stripe dashboard.
ReplyFlow shows the payment status after Stripe processes it.

If you need detailed payment records
- Log in to your Stripe dashboard.
- Export payment history from Stripe.
- Contact ReplyFlow support for assistance.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['payment history', 'view payments', 'past payments', 'payment records'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Payment Requests overview', 'How do I cancel a payment request?', 'Manage subscription (Stripe)'],
  },
  {
    id: 'cancel-payment-request',
    question: 'How do I cancel a payment request?',
    summary: 'Canceling a pending payment request.',
    answer: `When you would use this
Cancel a payment request that hasn't been paid yet.

Step-by-step instructions
From a customer page:
1) Go to the customer's details page.
2) Scroll to the "Payments" section.
3) Click on the pending payment request.
4) Click "Cancel Payment."
5) Confirm the cancellation.

Important warnings
- Canceling a payment request does NOT refund a completed payment.
- Canceling only works for pending (unpaid) requests.
- Once a payment is paid, you must process a refund through Stripe.

When you can cancel
- Payment status is "Pending"
- Customer has not yet paid
- Payment link has not been used

When you cannot cancel
- Payment status is "Paid"
- Payment status is "Failed"
- Payment status is "Canceled"

What happens after cancellation
- The customer can no longer use the payment link.
- The payment request is marked as "Canceled."
- The customer is not automatically notified.
- You may want to inform the customer via SMS.

If you need to refund a paid payment
- Log in to your Stripe dashboard.
- Find the payment transaction.
- Click "Refund."
- Follow Stripe's refund process.

Important notes
- Canceling is for pending requests only.
- Refunds are processed through Stripe, not ReplyFlow.
- ReplyFlow support cannot cancel or refund payments on your behalf.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['cancel payment', 'cancel payment request', 'remove payment request'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Payment history', 'Refund guidance', 'Payment Requests overview'],
  },
  {
    id: 'payment-statuses',
    question: 'What do payment statuses mean?',
    summary: 'Understanding payment request statuses: Pending, Paid, Failed, Canceled.',
    answer: `When you would use this
Understand what each payment status means and what to do.

Payment statuses

Pending
- Payment request has been sent to the customer.
- Customer has not yet paid.
- Payment link is active and can be used.
- Action: Wait for customer to pay, or cancel if no longer needed.

Paid
- Customer has completed the payment.
- Payment was successful.
- Funds are in your Stripe account.
- Action: No action needed. If refund is needed, process through Stripe.

Failed
- Payment attempt failed.
- Customer tried to pay but the payment was declined.
- Possible reasons: Insufficient funds, card declined, bank error.
- Action: Contact customer to update payment method, or send a new payment request.

Canceled
- Payment request was canceled.
- Customer can no longer use the payment link.
- No payment was made.
- Action: Create a new payment request if still needed.

What affects payment status
- Customer's payment method (card, bank account)
- Card expiration or insufficient funds
- Bank security checks
- Network issues during payment
- Stripe account verification status

Checking payment status
1) Go to the customer's details page.
2) Scroll to the "Payments" section.
3) View the status next to each payment request.
4) Click on a payment for more details.

If a payment is stuck in Pending
- Check if the customer received the payment link.
- Ask the customer to try a different payment method.
- Cancel the request and send a new one.
- Check your Stripe account for any issues.

Important notes
- Payment status is determined by Stripe, not ReplyFlow.
- Failed payments do not automatically retry.
- Canceled payments cannot be reactivated.
- Refunds are processed through Stripe, not ReplyFlow.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['payment status', 'pending payment', 'failed payment', 'canceled payment', 'paid payment'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Payment history', 'How do I cancel a payment request?', 'Payment Requests overview'],
  },
  {
    id: 'google-meet',
    question: 'How do I create a Google Meet link?',
    summary: 'Creating and using Google Meet links for appointments.',
    answer: `When you would use this
Add a Google Meet video call link to an appointment.

Important note
ReplyFlow does not automatically create Google Meet links. You must create them in Google Calendar and they will sync to ReplyFlow.

How to add a Google Meet link
1) Go to the Schedule page (/dashboard/calendar).
2) Click the Calendar tab.
3) Create or edit an appointment.
4) Click "Add Google Meet" in the calendar event.
5) Google Calendar will generate a Meet link.
6) The Meet link will appear in ReplyFlow.

Where Google Meet links appear
- In the appointment details in ReplyFlow.
- In the calendar event in Google Calendar.
- In SMS messages if you include the link.

What Google Meet provides
- Video conferencing
- Screen sharing
- Recording (if enabled)
- Dial-in phone numbers

Important limitations
- ReplyFlow does not create Meet links automatically.
- Meet links must be created in Google Calendar.
- Meet links sync from Google Calendar to ReplyFlow.
- ReplyFlow does not sync Meet links back to Google Calendar.

If the Meet link is not showing
- Check that Google Calendar is connected.
- Refresh the page to sync calendar data.
- Check that the appointment is linked to a Google Calendar event.
- Verify the Meet link exists in Google Calendar.

Best practices
- Create the Meet link in Google Calendar before the appointment.
- Include the Meet link in SMS reminders to the customer.
- Test the Meet link before the appointment.
- Have a backup plan if Meet fails.

Important notes
- Google Meet is a Google service, not a ReplyFlow feature.
- ReplyFlow displays Meet links from Google Calendar.
- For Meet issues, check Google Calendar or Google Meet support.`,
    category: 'Schedule & Jobs',
    source: 'Calendar Guide',
    keywords: ['google meet', 'video call', 'meet link', 'video conference'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Connect Google Calendar', 'Create appointment', 'Events not showing'],
  },
  {
    id: 'calendar-permissions',
    question: 'What permissions does Google Calendar need?',
    summary: 'Understanding required Google Calendar permissions.',
    answer: `When you would use this
Understand what permissions ReplyFlow needs for Google Calendar.

Required permissions
When you connect Google Calendar, ReplyFlow requests:

1) Read access to your calendars
- View your calendar events
- Sync appointments to ReplyFlow
- Display events in the Schedule page

2) Write access to your calendars
- Create appointments from ReplyFlow
- Update appointment details
- Link jobs to calendar events

3) Event access
- Read event details (title, time, location)
- Write event details when creating/updating

What ReplyFlow does NOT access
- Your personal Gmail emails
- Your contacts
- Your Google Drive files
- Other Google services
- Private events marked as private

Why permissions are needed
- To display your calendar in ReplyFlow
- To create appointments from ReplyFlow
- To keep appointments in sync
- To link jobs to calendar events

Permission denial
If you deny permissions:
- Google Calendar will not connect.
- You will not see calendar events in ReplyFlow.
- You cannot create appointments from ReplyFlow.
- You can try connecting again anytime.

Revoking permissions
If you revoke permissions later:
- ReplyFlow will lose access to your calendar.
- Existing events will remain in Google Calendar.
- ReplyFlow will not sync new changes.
- Reconnect to restore access.

Reconnecting
1) Go to the Schedule page.
2) Click "Connect Google Calendar."
3) Grant the requested permissions.
4) Calendar will sync automatically.

Important notes
- Permissions are required for calendar integration to work.
- ReplyFlow only accesses calendar data, not emails or contacts.
- You can revoke permissions at any time in Google Account settings.
- Reconnecting requires granting permissions again.

For security concerns
- ReplyFlow uses OAuth for secure access.
- You control access through Google Account settings.
- ReplyFlow does not store your Google password.`,
    category: 'Schedule & Jobs',
    source: 'Calendar Guide',
    keywords: ['calendar permissions', 'google permissions', 'oauth', 'calendar access'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Connect Google Calendar', 'Calendar not connected', 'Data privacy'],
  },
  {
    id: 'calendar-disconnect',
    question: 'How do I disconnect Google Calendar?',
    summary: 'Disconnecting and reconnecting Google Calendar.',
    answer: `When you would use this
Disconnect Google Calendar or reconnect after issues.

Disconnecting Google Calendar
To disconnect from ReplyFlow:
1) Go to your Google Account settings.
2) Navigate to "Security" or "Third-party apps."
3) Find ReplyFlow in the connected apps list.
4) Click "Remove access" or "Revoke access."
5) ReplyFlow will no longer have access to your calendar.

Important notes about disconnecting
- Existing events remain in Google Calendar.
- ReplyFlow will stop syncing new changes.
- You will not see calendar events in ReplyFlow.
- Jobs linked to calendar events remain in ReplyFlow.

Reconnecting Google Calendar
If you disconnected or have sync issues:
1) Go to the Schedule page (/dashboard/calendar).
2) Click "Connect Google Calendar."
3) Sign in to your Google account.
4) Grant the requested permissions.
5) Calendar will sync automatically.

When to disconnect
- You no longer want calendar integration.
- You're switching to a different Google account.
- Security concerns (you can always reconnect).

When to reconnect
- You disconnected by mistake.
- Sync issues or events not appearing.
- You want to restore calendar integration.
- After revoking and re-granting permissions.

What happens after reconnecting
- Calendar events will sync to ReplyFlow.
- Existing jobs remain unchanged.
- New appointments can be created.
- Two-way sync resumes.

Troubleshooting reconnection
If reconnection fails:
- Check that you're using the correct Google account.
- Clear browser cache and try again.
- Check that ReplyFlow is not blocked by your browser.
- Try in an incognito/private window.
- Contact support if issues persist.

Important notes
- Disconnecting does not delete your calendar events.
- Reconnecting requires granting permissions again.
- ReplyFlow does not store your Google password.
- Use OAuth for secure access.`,
    category: 'Schedule & Jobs',
    source: 'Calendar Guide',
    keywords: ['disconnect calendar', 'reconnect calendar', 'calendar sync issues', 'remove calendar access'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Connect Google Calendar', 'Calendar not connected', 'Calendar permissions'],
  },
  {
    id: 'business-hours-vs-after-hours',
    question: 'What is the difference between Business Hours, After Hours, and Out of Office?',
    summary: 'Understanding the different automated messaging settings and when they apply.',
    answer: `When you would use this
Understand which automated message setting applies in different situations.

Business Hours
- Your regular operating hours.
- Set in Settings under Business Hours.
- During business hours, normal AI responses apply.
- Customers calling during business hours get standard AI intake.
- Example: 9 AM - 5 PM, Monday - Friday.

After Hours
- Time outside your business hours.
- Automatically triggered when it's not business hours.
- Customers calling after hours get an after-hours message.
- Message explains you're closed and will follow up.
- No appointment scheduling after hours (unless configured).

Out of Office
- Manual override for temporary unavailability.
- Set when you're away for vacation, sick day, etc.
- Takes precedence over business hours and after hours.
- All callers get the out-of-office message.
- You specify the return date.
- Turns off automatically after the return date.

Which setting takes precedence?
1) Out of Office (highest priority)
2) After Hours
3) Business Hours (lowest priority)

Example scenarios

Scenario 1: During business hours, Out of Office ON
- Out of Office applies.
- Customer gets out-of-office message.

Scenario 2: During business hours, Out of Office OFF
- Business Hours applies.
- Customer gets normal AI intake.

Scenario 3: After hours, Out of Office OFF
- After Hours applies.
- Customer gets after-hours message.

Scenario 4: After hours, Out of Office ON
- Out of Office applies.
- Customer gets out-of-office message.

Important notes
- Out of Office is for temporary unavailability.
- After Hours is for regular non-business hours.
- Business Hours are your regular operating hours.
- Settings are checked in real-time for each call.
- Time zone is based on your business settings.

How to configure
1) Go to Settings.
2) Set Business Hours.
3) Configure After Hours message (if different from default).
4) Use Out of Office for temporary unavailability.`,
    category: 'Settings & Account',
    source: 'Settings Guide',
    keywords: ['business hours', 'after hours', 'out of office', 'auto reply', 'automated messaging'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Change business hours', 'Out of office mode', 'Why did my automatic reply send?'],
  },
  {
    id: 'personal-contacts-overview',
    question: 'What are Personal Contacts?',
    summary: 'Understanding Personal Contacts and how they differ from customers.',
    answer: `When you would use this
Understand how Personal Contacts bypass AI intake for known personal callers.

What Personal Contacts are
Personal Contacts are phone numbers you add to ReplyFlow to bypass AI intake.
When a Personal Contact calls, they are not treated as a customer.
They can reach you directly or get a different greeting.

Personal Contacts vs Customers
- Personal Contacts: Bypass AI intake, for known personal callers
- Customers: Go through AI intake, for business calls

When to use Personal Contacts
- Family members
- Personal friends
- Your own phone number (for testing)
- Team members who shouldn't go through AI
- Anyone who should bypass business intake

How Personal Contacts work
1) Add a phone number to Personal Contacts.
2) When that number calls, ReplyFlow recognizes it.
3) The call bypasses AI customer intake.
4) The caller gets a different experience (depending on configuration).

Adding Personal Contacts
1) Go to Settings.
2) Navigate to Personal Contacts.
3) Click "Add Contact."
4) Enter the phone number.
5) Add a name (optional).
6) Save the contact.

Removing Personal Contacts
1) Go to Settings.
2) Navigate to Personal Contacts.
3) Find the contact to remove.
4) Click delete or remove.
5) Confirm the removal.

What happens after removal
- The number is no longer recognized as a Personal Contact.
- Future calls will go through normal AI intake.
- The caller will be treated as a new customer.

Important notes
- Personal Contacts do not import from your phone's address book.
- You must add them manually in ReplyFlow.
- Phone numbers are normalized (format standardized).
- Duplicate numbers are not allowed.
- Personal Contacts are account-specific (not shared across businesses).

Limitations
- No automatic import from phone contacts.
- Must be added manually one at a time.
- Limited number of contacts (check your plan limits).
- Personal Contacts do not receive SMS messages from ReplyFlow.`,
    category: 'Settings & Account',
    source: 'Settings Guide',
    keywords: ['personal contacts', 'personal callers', 'bypass ai', 'family members', 'personal phone'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Ignored contacts AI', 'How do family members bypass the AI?', 'Settings overview'],
  },
  {
    id: 'stripe-return-behavior',
    question: 'What happens after I return from Stripe?',
    summary: 'Understanding behavior when returning to ReplyFlow after Stripe flows.',
    answer: `When you would use this
Understand what happens when you return from Stripe checkout, onboarding, or billing portal.

Stripe Connect Onboarding
After completing Stripe Connect onboarding:
1) You are redirected back to ReplyFlow.
2) ReplyFlow checks your Stripe account status.
3) If verification is pending, you'll see "Verification Pending."
4) If verified, you can start accepting payments.
5) Status may take a few minutes to update.
6) Refresh the page if status appears stale.

Stripe Checkout (Subscription)
After completing subscription checkout:
1) You are redirected to the /billing/success page.
2) Your subscription is activated.
3) You can access all features.
4) If payment failed, you'll see an error message.
5) Contact support if payment issues persist.

Stripe Billing Portal
After visiting the billing portal:
1) You return to ReplyFlow when done.
2) Changes in Stripe sync to ReplyFlow.
3) Subscription status updates automatically.
4) Refresh the page if status appears stale.
5) Some changes may take a few minutes to sync.

Platform-specific behavior

Web (desktop/mobile browser)
- Automatic redirect back to ReplyFlow.
- New tab or same tab depending on Stripe configuration.
- Status syncs automatically.

iOS (iPhone/iPad app)
- Automatic redirect back to the app.
- Opens in Safari or in-app browser.
- Status syncs automatically.
- If redirect fails, return to the app manually.

Android app
- Automatic redirect back to the app.
- Opens in Chrome or in-app browser.
- Status syncs automatically.
- If redirect fails, return to the app manually.

What to do if status appears stale
1) Refresh the ReplyFlow page.
2) Wait 1-2 minutes for Stripe to process.
3) Check your Stripe dashboard for the actual status.
4) If still incorrect, log out and log back in.
5) Contact support if issues persist.

Important notes
- Stripe controls the redirect timing.
- Network issues can delay the redirect.
- Status sync may take a few minutes.
- ReplyFlow polls Stripe for status updates.
- Always check Stripe dashboard for authoritative status.

If you get "lost" in Stripe
- Use your browser's back button.
- Close the Stripe tab and return to ReplyFlow.
- Navigate to Settings > Manage Subscription.
- Click "Billing Portal" to return to Stripe.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['stripe return', 'stripe redirect', 'stripe checkout', 'billing portal return', 'stripe onboarding'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Connect Stripe', 'Stripe verification pending', 'Manage subscription (Stripe)'],
  },
  {
    id: 'notification-center',
    question: 'How do I use the Notification Center?',
    summary: 'Viewing, managing, and marking notifications as read.',
    answer: `When you would use this
View and manage notifications from ReplyFlow.

Accessing Notification Center
1) Go to the Notifications page (/dashboard/notifications).
2) View all notifications in reverse chronological order (newest first).
3) Notification count shows on the bell icon in the dashboard.

Notification types
- Payment notifications
- Job notifications
- Customer notifications
- System notifications
- SMS delivery notifications

Marking notifications as read
- Click on a notification to mark it as read.
- Click "Mark all as read" to mark all notifications as read.
- Unread count decreases as you mark notifications read.
- Notifications stay in the list after being read.

Notification information
Each notification shows:
- Notification type and title
- Message content
- Timestamp
- Read/unread status
- Link to related item (if applicable)

Important notes
- Notifications are account-specific.
- Notifications persist until deleted.
- Deleting a notification removes it from the list.
- Unread count reflects only unread notifications.
- Notifications refresh automatically when new ones arrive.

Troubleshooting
If notifications are not appearing:
- Check that push notifications are enabled in device settings.
- Check your notification preferences.
- Refresh the page to fetch latest notifications.
- Contact support if issues persist.`,
    category: 'Notifications',
    source: 'Notifications Guide',
    keywords: ['notification center', 'notifications', 'mark read', 'mark all read', 'notification preferences'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Push notifications', 'Permission prompts', 'Why notification may not arrive'],
  },
  {
    id: 'venmo-paypal',
    question: 'Does ReplyFlow support Venmo or PayPal?',
    summary: 'Venmo and PayPal are supported as username/handoff payment methods.',
    answer: `When you would use this
Understand how Venmo and PayPal work in ReplyFlow.

Supported payment methods
ReplyFlow supports multiple payment providers:
- Stripe (credit cards, Apple Pay, Google Pay, Tap to Pay on iPhone)
- Venmo (username handoff)
- PayPal (payment link handoff)

How Venmo works
1) Configure your Venmo username in Settings.
2) When creating a payment request, select Venmo as the provider.
3) ReplyFlow sends your Venmo username to the customer.
4) Customer opens Venmo app and sends payment to your username.
5) ReplyFlow does not process Venmo payments directly.
6. You must manually mark the payment as paid in ReplyFlow.

How PayPal works
1) Configure your PayPal payment link in Settings.
2) When creating a payment request, select PayPal as the provider.
3) ReplyFlow sends your PayPal payment link to the customer.
4) Customer opens the link and pays via PayPal.
5) ReplyFlow does not process PayPal payments directly.
6) You must manually mark the payment as paid in ReplyFlow.

Stripe vs Venmo/PayPal
- Stripe: Automatic payment processing, real-time status updates
- Venmo/PayPal: Manual payment tracking, you mark payments as paid

Configuring Venmo
1) Go to Settings.
2) Find the Venmo section.
3) Enter your Venmo username (e.g., "joesplumbing").
4) Save settings.

Configuring PayPal
1) Go to Settings.
2) Find the PayPal section.
3) Enter your PayPal payment link.
4) Save settings.

Important notes
- Venmo and PayPal are handoff methods, not direct processing.
- You must manually mark Venmo/PayPal payments as paid.
- Stripe provides automatic payment processing and status updates.
- Venmo/PayPal are good for customers who prefer those apps.
- All payment methods can be offered to customers.

If a customer asks about Venmo or PayPal
Explain that both are supported as payment options.
Direct them to use their preferred method.
For automatic processing, use Stripe.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['venmo', 'paypal', 'payment methods', 'cash app', 'zelle', 'peer to peer'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Payment Requests overview', 'Tap to Pay on iPhone', 'Connect Stripe', 'Marking payments paid'],
  },
  {
    id: 'schedule-map-detailed',
    question: 'How does the Schedule Map work?',
    summary: 'Detailed behavior of the Schedule Map, including markers, addresses, and what appears when selecting a marker.',
    answer: `When you would use this
Understand how the Schedule Map displays locations and what to check when markers are missing.

Accessing Schedule Map
1) Go to the Schedule page (/dashboard/calendar).
2) Click the Map tab.

What creates map markers
Map markers are created from:
- Jobs with service addresses
- Calendar events with locations
- Business location (if configured)
- Tasks do NOT create map markers

Address selection for markers
- Jobs: Use service_address, or fall back to customer address from lead metadata
- Calendar events: Use event location field
- Business: Use configured business address from Settings

Geocoding behavior
- Addresses are geocoded to latitude/longitude coordinates
- Geocoding uses ReplyFlow's geocode API (not Google Maps directly)
- Failed geocoding results in no marker for that item
- Geocoding is cached to avoid repeated API calls

Which markers appear
- Jobs on the selected date
- Calendar events on the selected date
- Business location (if configured)
- Tasks never appear as markers (they have no location)

Marker selection behavior
When you click a marker:
- Map centers on the selected marker
- Marker is highlighted
- Item details appear in the list below the map
- You can edit the job or appointment from the list

What appears after selecting a marker
Below/beside the map, you see:
- Item type (Job, Appointment, Task)
- Title
- Customer name (for jobs)
- Address (if available)
- Scheduled date/time
- Status
- Edit button
- Add location button (if no address)

Empty states
- If no items have addresses: Map shows business location only
- If no business address: Map shows markers for jobs/events only
- If no markers at all: Map shows empty state

Missing or invalid addresses
- Jobs without service_address fall back to customer address
- If both missing: No marker appears
- "Add location" button appears in the item list
- Click to add a service address

Business location behavior
- Business location geocoded from Settings
- Appears as "Business" marker
- Used as default camera center on first visit
- If business address missing: Map centers on available markers

Desktop vs mobile behavior
- Desktop: Map and list appear side-by-side
- Mobile: Map above, list below, compact view
- Same marker behavior on all platforms

Refresh and caching
- Markers refresh when date changes
- Geocoding cached for performance
- Business geocoding cached until address changes
- Calendar event geocoding cached per event

Stale marker data
- Markers reflect current database state
- Changes to addresses require date change or page refresh
- Geocoding cache updates when addresses change

What to check when a marker is missing
1) Verify the job or event has an address
2) Check that the address is valid
3) Ensure the item is on the selected date
4) Refresh the page if data seems stale
5) Check browser console for geocoding errors

Known limitations
- Tasks do not appear on the map (they have no location)
- Geocoding failures result in no marker
- Map jitter/smoothness is a separate known issue
- Map uses actual business and customer locations, not defaults`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['schedule map', 'map markers', 'geocoding', 'map behavior', 'missing markers'],
    readingTime: 3,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Schedule overview', 'Create job', 'Business address'],
  },
  {
    id: 'notification-categories',
    question: 'What types of notifications does ReplyFlow send?',
    summary: 'All notification types and which trigger push notifications versus in-app only.',
    answer: `When you would use this
Understand the different notification types and how they are delivered.

All notification types
ReplyFlow sends notifications for these events:

Push notifications (high priority - always sent)
- new_lead - New customer created
- customer_reply - Customer sends an SMS
- ai_intake_completed - AI call finished gathering information
- payment_completed - Customer successfully paid
- personal_voicemail - Personal voicemail received
- voicemail_received - Business voicemail received
- missed_call - Missed call detected

Push notifications (medium priority - sent unless disabled)
- forwarding_disconnected - Call forwarding disconnected
- sms_failed - SMS failed to send
- trial_ending - Trial period ending soon
- subscription_issue - Subscription payment failed

In-app only (no push notification)
- followup_completed - Follow-up job completed
- followup_sent - Follow-up SMS sent
- payment_requested - Payment request created
- calendar_connected - Google Calendar connected
- calendar_disconnected - Google Calendar disconnected
- appointment_created - Appointment created
- appointment_deleted - Appointment deleted

Push vs in-app
- Push notifications: Appear on device lock screen, require device permission
- In-app only: Appear in Notification Center only, no device notification

Notification Center
All notifications appear in the Notification Center (/dashboard/notifications), regardless of push priority.

Marking notifications read
- Individual notifications can be marked as read
- "Mark all as read" marks all notifications as read
- Unread count decreases as notifications are marked read

Notification link destinations
- new_lead: Customer details page
- customer_reply: Customer details page
- payment_completed: Customer details or payments page
- calendar_connected: Settings page
- appointment_created: Schedule page

Per-category preferences
Currently, ReplyFlow does not support per-category notification preferences.
All push-enabled notifications are sent together.
Device-level settings allow disabling all notifications.

Important notes
- Push notifications require device permission
- In-app notifications work without device permission
- High-priority notifications are always pushed
- Medium-priority notifications may be pushed
- In-app only notifications never push
- All notifications appear in Notification Center`,
    category: 'Notifications',
    source: 'Notifications Guide',
    keywords: ['notification types', 'notification categories', 'push notifications', 'in-app notifications'],
    readingTime: 3,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Notification Center', 'Push notifications', 'Device-specific notification settings'],
  },
  {
    id: 'tap-to-pay-android',
    question: 'Is Tap to Pay supported on Android?',
    summary: 'Tap to Pay platform support and limitations.',
    answer: `When you would use this
Understand which platforms support Tap to Pay.

Platform support
- iPhone: Tap to Pay on iPhone is supported.
- Android: Tap to Pay on Android is NOT supported.

Why Android is not supported
- Apple's Tap to Pay technology is iOS-only.
- Android has its own NFC payment systems (Google Pay).
- ReplyFlow currently only implements Apple's Tap to Pay.
- Android support would require separate implementation.

Android payment options
On Android devices, customers can:
- Use credit or debit cards through payment links
- Use Google Pay if implemented by Stripe (not through ReplyFlow)
- Pay via SMS payment links

iPhone payment options
On iPhone devices, customers can:
- Use Tap to Pay on iPhone for in-person payments
- Use credit or debit cards through payment links
- Use Apple Pay through payment links

Important notes
- Tap to Pay on iPhone requires an iPhone XS or later.
- Tap to Pay requires iOS 16.0 or later.
- Android users can still pay via card payment links.
- ReplyFlow may add Android support in the future.

If you need Android in-person payments
Customers on Android can:
- Pay via card payment links
- Use their device's browser to open payment links
- Pay with their card through Stripe's checkout

Important notes
- Tap to Pay on iPhone is iOS-only.
- Android support is not currently available.
- All other payment methods work on both platforms.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['tap to pay android', 'android tap to pay', 'google pay', 'nfc android'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Tap to Pay on iPhone', 'Tap to Pay requirements', 'Venmo/PayPal'],
  },
  {
    id: 'signing-out',
    question: 'How do I sign out?',
    summary: 'Signing out of ReplyFlow and session management.',
    answer: `When you would use this
Sign out of your ReplyFlow account.

Step-by-step instructions
1) Click your profile icon or name in the top-right corner.
2) Click "Sign out" from the dropdown menu.
3) You will be signed out and redirected to the sign-in page.

What happens when you sign out
- Your session is ended.
- You are redirected to the sign-in page.
- Any unsaved changes are lost.
- You'll need to sign in again to access your account.

Session management
- Sessions expire automatically after a period of inactivity.
- You can stay signed in across browser sessions.
- Signing out on one device does not sign you out on other devices.
- Each device maintains its own session.

Security notes
- Always sign out when using a shared or public device.
- Signing out prevents unauthorized access to your account.
- Your password is required to sign back in.
- Use a strong, unique password for your account.

If you cannot sign out
If the sign-out button doesn't work:
- Clear your browser cookies and cache.
- Close all browser windows and try again.
- Try signing out in an incognito/private window.
- Contact support if issues persist.

Important notes
- Sign out is available in the profile menu.
- You must be signed in to use ReplyFlow.
- Sessions expire automatically for security.
- Sign out ends your current session only.`,
    category: 'Settings & Account',
    source: 'Account Guide',
    keywords: ['sign out', 'logout', 'sign off', 'end session', 'sign out of account'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Password management', 'Data privacy', 'How do I delete my account?'],
  },
  {
    id: 'business-settings-overview',
    question: 'What settings are available?',
    summary: 'Overview of Settings sections and available configuration options.',
    answer: `When you would use this
Understand what settings you can configure in ReplyFlow.

Accessing Settings
1) Go to Settings (/dashboard/settings).
2) Navigate between sections using the tabs or scroll.

Settings sections

1) General
- Business name
- Business phone number
- Basic business information

2) Business Address
- Business address (street, city, state, zip, country)
- Used for Schedule Map business location
- Used for geocoding

3) Automation
- Business hours
- After-hours settings
- Out-of-office mode
- Follow-up settings
- Automatic reply configuration

4) Notifications
- Push notification preferences
- Notification categories
- Device-specific settings

5) Integrations
- Google Calendar connection
- Stripe connection
- Other third-party integrations

6) Payments
- Stripe Connect status
- Subscription management
- Billing portal access
- Payment request configuration

7) Contacts
- Personal Contacts
- Phone routing configuration
- Ignored contacts

8) Account
- Account information
- Subscription status
- Billing management
- Account deletion

Important notes
- Settings are saved automatically when you make changes.
- Some settings require reconnection (e.g., Google Calendar).
- Changes take effect immediately unless specified.
- Settings are account-specific.

Troubleshooting
If settings don't save:
- Refresh the page and try again.
- Check your internet connection.
- Contact support if issues persist.`,
    category: 'Settings & Account',
    source: 'Settings Guide',
    keywords: ['settings', 'business settings', 'configuration', 'settings overview'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Business hours', 'Out of office mode', 'Connect Google Calendar'],
  },
  {
    id: 'job-editing',
    question: 'How do I edit a job?',
    summary: 'Editing job details after creation.',
    answer: `When you would use this
Modify job information such as time, address, or notes after creating a job.

Step-by-step instructions
From the Schedule page:
1) Go to the Schedule page (/dashboard/calendar).
2) Click the Agenda or Calendar tab.
3) Click on the job you want to edit.
4) Click the edit icon or "Edit Job."
5. Modify the job details.
6) Click "Save Job."

From a customer page:
1) Go to the customer's details page.
2) Scroll to the Jobs section.
3) Click on the job you want to edit.
4) Click the edit icon or "Edit Job."
5) Modify the job details.
6) Click "Save Job."

Editable job fields
- Job title
- Scheduled date and time
- Service address
- Notes
- Job status (Scheduled, In Progress, Completed, Canceled)

What cannot be edited
- Customer (once assigned, cannot be changed)
- Created date
- Job ID

Job status changes
- Mark job as "In Progress" when you start work
- Mark job as "Completed" when work is finished
- Cancel job if the appointment is canceled

Important notes
- Changes are saved immediately.
- Customers are not automatically notified of changes.
- Job status changes are saved immediately.
- Google Calendar events may update if linked.

If you need to change the customer
- Cancel the existing job.
- Create a new job for the correct customer.`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['edit job', 'modify job', 'update job', 'change job details'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Create job', 'Job completed', 'Schedule overview'],
  },
  {
    id: 'receipt-availability',
    question: 'Are receipts available for payments?',
    summary: 'Payment receipt availability and how to access them.',
    answer: `When you would use this
Understand whether payment receipts are generated and how to access them.

Receipt availability
- ReplyFlow does not automatically generate or email receipts.
- Receipts are managed through Stripe.
- Customers receive payment confirmation from Stripe.
- You can access receipts through your Stripe dashboard.

How customers receive payment confirmation
When a customer pays:
- Stripe sends a payment confirmation email to the customer.
- The email includes payment details and receipt.
- The customer can download the receipt from the email.
- ReplyFlow does not send a separate receipt.

Accessing receipts as a business
1) Log in to your Stripe dashboard.
2) Navigate to the payment transaction.
3) Download or email the receipt to the customer.
4) Stripe provides receipt PDFs for all transactions.

Payment history in ReplyFlow
- ReplyFlow shows payment status (Pending, Paid, Failed, Canceled).
- ReplyFlow shows payment amount and date.
- ReplyFlow does not store receipt PDFs.
- Receipts are managed entirely by Stripe.

Important notes
- ReplyFlow does not generate receipts.
- Receipts are handled by Stripe.
- Customers receive Stripe's payment confirmation emails.
- Access full receipts through Stripe dashboard.

If a customer needs a receipt
- Direct them to check their email for Stripe's confirmation.
- Log in to Stripe and email the receipt to the customer.
- Contact Stripe support for receipt-related issues.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['receipt', 'payment receipt', 'invoice', 'confirmation email'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Payment history', 'Payment Requests overview', 'Connect Stripe'],
  },
  {
    id: 'failed-payments',
    question: 'What happens when a payment fails?',
    summary: 'Understanding payment failure causes and resolution.',
    answer: `When you would use this
Understand why payments fail and how to handle them.

Common payment failure causes
- Insufficient funds in customer's account
- Expired or invalid card
- Card declined by bank
- Network or connectivity issues
- Incorrect card details
- Bank security blocks

What the customer sees
- Payment link shows an error message.
- Stripe displays the specific decline reason.
- Customer is prompted to try a different payment method.
- Customer can retry payment with updated card information.

What you see in ReplyFlow
- Payment status shows "Failed."
- Payment request remains active (can be retried).
- Customer can click the payment link again.
- No automatic retry occurs.

What you should do
1) Contact the customer to inform them of the failed payment.
2) Ask them to check their card details.
3) Suggest they try a different payment method.
4) If the issue persists, create a new payment request.
5) For recurring issues, ask the customer to contact their bank.

Resolving failed payments
- Customer updates their card information and retries.
- Customer uses a different card or payment method.
- Customer contacts their bank to resolve the block.
- You create a new payment request with updated link.

Important notes
- Failed payments do not automatically retry.
- The payment link remains valid for retry.
- ReplyFlow does not store detailed failure reasons.
- Stripe provides detailed failure information in your dashboard.

If a customer cannot pay
- Suggest they contact their bank.
- Verify the payment link is working.
- Try creating a new payment request.
- Contact Stripe support if issues persist.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['failed payment', 'payment declined', 'card declined', 'payment failed'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Payment statuses', 'Payment history', 'Cancel payment request'],
  },
  {
    id: 'task-editing',
    question: 'How do I edit a task?',
    summary: 'Editing task details such as title, notes, or due date.',
    answer: `When you would use this
Modify task information after creating a task.

Step-by-step instructions
1) Go to the Schedule page (/dashboard/calendar).
2) Click the Agenda tab.
3) Find the task you want to edit.
4) Click the edit icon on the task.
5) Modify the task details.
6) Click "Save Task."

Editable task fields
- Task title
- Notes
- Due date
- Due time
- Customer (optional)
- Job (optional)

What cannot be edited
- Task ID
- Created date
- Completion timestamp (set automatically)

Task status
- Mark task as completed by clicking the checkbox.
- Completed tasks show a checkmark.
- Completed tasks remain in the list.
- Uncheck to mark task as incomplete.

Important notes
- Changes are saved immediately.
- Tasks are internal, not visible to customers.
- Tasks do not send SMS messages.
- Due dates help with task management.
- Tasks linked to jobs appear in job details.

If you need to delete a task
- Click the delete icon on the task.
- Confirm the deletion.
- The task is removed permanently.`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['edit task', 'modify task', 'update task', 'change task details'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Create task', 'Task completed', 'Schedule overview'],
  },
  {
    id: 'payment-cancellations',
    question: 'What happens when I cancel a payment request?',
    summary: 'Understanding payment request cancellation behavior.',
    answer: `When you would use this
Understand what happens when you cancel a pending payment request.

Cancellation behavior
- Canceling only works for pending (unpaid) requests.
- Canceling does NOT refund a completed payment.
- The payment link becomes invalid after cancellation.
- The customer cannot use the canceled link.
- No payment is processed.

When you can cancel
- Payment status is "Pending"
- Customer has not yet paid
- Payment link has not been used
- Request is less than 30 days old (Stripe limit)

When you cannot cancel
- Payment status is "Paid"
- Payment status is "Failed"
- Payment status is "Canceled"
- Request is older than 30 days (Stripe limit)

What the customer experiences
- If they click the link before cancellation: They can pay normally.
- If they click the link after cancellation: They see an error message.
- They are not automatically notified of cancellation.
- They may need to contact you for a new payment link.

If you need to refund a paid payment
- Log in to your Stripe dashboard.
- Find the payment transaction.
- Click "Refund."
- Follow Stripe's refund process.
- ReplyFlow cannot process refunds directly.

Important notes
- Canceling is for pending requests only.
- Refunds are processed through Stripe.
- Canceling does not automatically notify the customer.
- Create a new request if the customer still needs to pay.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['cancel payment', 'cancellation', 'cancel request', 'payment canceled'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Cancel payment request', 'Payment statuses', 'Refund guidance'],
  },
  {
    id: 'stripe-ownership',
    question: 'What is the difference between Stripe-owned and ReplyFlow-owned payments?',
    summary: 'Understanding payment ownership and account structure.',
    answer: `When you would use this
Understand the relationship between ReplyFlow and Stripe for payment processing.

Payment ownership
All customer payments are owned by your Stripe account, not ReplyFlow.

ReplyFlow's role
- ReplyFlow is a payment facilitator using Stripe Connect.
- ReplyFlow sends payment requests to customers.
- ReplyFlow displays payment status from Stripe.
- ReplyFlow does not hold or own customer funds.
- ReplyFlow does not process refunds directly.

Your Stripe account
- You own your Stripe Connect account.
- All customer payments go to your Stripe account.
- You control refunds through Stripe.
- You have full access to payment data in Stripe.
- Stripe fees are charged to your account.

Subscription billing
- ReplyFlow subscription payments go to ReplyFlow's Stripe account.
- This is separate from customer payments.
- Subscription billing is managed by ReplyFlow.
- Subscription refunds go through ReplyFlow support.

Customer payments
- Customer payment requests go to your Stripe account.
- Customer funds go to your Stripe account.
- You control customer refunds.
- ReplyFlow does not have access to customer funds.
- Payment history is in your Stripe dashboard.

Important distinction
- Subscription payments: Owned by ReplyFlow
- Customer payments: Owned by you (your Stripe account)
- ReplyFlow facilitates customer payments but does not own them

Important notes
- You own all customer payments through your Stripe account.
- ReplyFlow does not hold customer funds.
- Process customer refunds through your Stripe dashboard.
- Contact ReplyFlow support for subscription refunds.`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['stripe ownership', 'payment ownership', 'stripe connect', 'who owns payments'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Connect Stripe', 'Manage subscription', 'Refund guidance'],
  },
  {
    id: 'marking-payments-paid',
    question: 'How do I mark a payment as paid?',
    summary: 'Manually marking Venmo and PayPal payments as paid.',
    answer: `When you would use this
Manually mark a payment as paid when using Venmo or PayPal.

When to mark payments as paid
- Only for Venmo payments (Stripe processes automatically)
- Only for PayPal payments (Stripe processes automatically)
- After customer confirms they paid via Venmo/PayPal
- Do NOT mark Stripe payments as paid (automatic)

Step-by-step instructions
1) Go to the Payments page (/dashboard/payments).
2) Find the pending Venmo or PayPal payment.
3) Click the "Mark Paid" button (green checkmark icon).
4) Confirm the action in the dialog.
5) Payment status changes to "Paid".

Eligible payments
- Status must be "Pending"
- Provider must be "Venmo" or "PayPal"
- Cannot mark canceled payments as paid
- Cannot mark expired payments as paid
- Cannot mark already paid payments

What happens when you mark paid
- Payment status changes to "Paid"
- Customer status changes to "Paid"
- Timeline event is created
- Intelligence is updated
- No Stripe charge is created (manual tracking only)

Important distinction
- Stripe payments: Automatically marked paid via webhook
- Venmo/PayPal: Manually marked paid by you
- Marking paid does NOT create a Stripe transaction
- Marking paid does NOT send a receipt

Reversibility
- Marking paid is NOT reversible
- If marked incorrectly, contact support
- Do not mark payments paid unless confirmed

Important notes
- Only Venmo and PayPal payments can be manually marked paid
- Stripe payments are processed automatically
- Verify customer actually paid before marking
- Marking paid is for tracking only, not financial processing`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['mark paid', 'manual payment', 'venmo payment', 'paypal payment'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Venmo/PayPal', 'Payment statuses', 'Payment history'],
  },
  {
    id: 'business-vs-customer-locations',
    question: 'What is the difference between business and customer locations?',
    summary: 'Understanding business location, customer address, and service location.',
    answer: `When you would use this
Distinguish between different address types in ReplyFlow.

Business location
- Your business address configured in Settings
- Used for Schedule Map business marker
- Geocoded for map display
- Optional but recommended for map functionality
- Not used for customer communication

Customer address
- Customer's contact address from AI intake or manual entry
- Stored in customer record
- Used as fallback for job service address
- May be home address, work address, or other
- Used for geocoding job markers

Service address
- Specific location where work will be performed
- Set when creating a job
- Overrides customer address for map markers
- Required for map markers (or falls back to customer address)
- Used by Schedule Map for job markers

Appointment location
- Location from Google Calendar event
- Used for calendar event markers on map
- Synced from Google Calendar
- May be different from service address

Service location type
Three types affect AI intake routing:
- Onsite: You travel to customer location
- Customer comes to business: Customer comes to your business
- Remote: Work is done remotely (no location needed)

Which location does what
- Schedule Map: Uses service address (or customer address fallback) and business location
- Customer details: Shows customer address
- Job details: Shows service address
- Calendar events: Show appointment location

Address corrections
- Customer can correct their address via SMS
- Corrections update customer address
- Service address on jobs is not automatically updated
- Manual update may be required

What happens when location is missing
- Job without service address: Falls back to customer address
- Job without either: No map marker appears
- Business without address: No business marker on map
- "Add location" button appears to add address

Important notes
- Business location is for map display only
- Customer address is for contact and fallback
- Service address is for actual work location
- Service location type affects AI intake, not map display`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['business location', 'customer address', 'service address', 'service location type'],
    readingTime: 3,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Schedule map detailed', 'Business address', 'Create job'],
  },
  {
    id: 'agenda-behavior',
    question: 'How does the Agenda tab work?',
    summary: 'Agenda tab behavior for viewing and managing tasks and jobs.',
    answer: `When you would use this
Understand how the Agenda tab displays tasks and jobs.

Accessing Agenda
1) Go to the Schedule page (/dashboard/calendar).
2) Click the Agenda tab (default tab).

What Agenda shows
- Tasks due on selected date
- Jobs scheduled on selected date
- Filtered by date selection
- Incomplete tasks only
- All job statuses

Date selection
- Use date picker to select a different date
- Previous/Next day buttons
- "Today" button to return to current date
- Agenda updates when date changes

Task display
- Tasks show title and due time
- Filter options: All, Active, Overdue, Future, Completed
- Checkbox to mark task complete
- Edit button to modify task
- Tasks are internal, not customer-facing

Job display
- Jobs show title, customer name, and time
- Job status indicator
- Edit button to modify job
- Jobs are customer-facing appointments

Creating tasks
1) Click "New Task" button.
2) Enter task details.
3) Save task.
4) Task appears in Agenda immediately.

Creating jobs
1) Click "New Job" button.
2) Enter job details.
3) Save job.
4) Job appears in Agenda immediately.

Empty states
- No tasks on date: "No tasks" message
- No jobs on date: No job items shown
- Add task/job buttons always available

Refresh behavior
- Agenda refreshes on date change
- Manual page refresh updates data
- New items appear immediately after creation
- Task completion updates immediately

Time formatting
- Tasks show due time (if set)
- Jobs show scheduled time
- Times in local timezone
- All-day tasks show date only

Mobile vs desktop
- Same behavior on all platforms
- Responsive layout adapts to screen size
- Touch-friendly on mobile

Important notes
- Agenda is the canonical home for Tasks
- No separate Tasks tab exists
- Tasks are internal, jobs are customer-facing
- Filter options help manage task lists`,
    category: 'Schedule & Jobs',
    source: 'Schedule Guide',
    keywords: ['agenda', 'agenda tab', 'tasks', 'jobs', 'schedule'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Create task', 'Create job', 'Schedule overview'],
  },
  {
    id: 'customer-payment-link-experience',
    question: 'What does the customer see when they receive a payment link?',
    summary: 'Customer experience for payment links from ReplyFlow.',
    answer: `When you would use this
Understand the customer's experience when receiving a payment link.

How payment links are created
1) You create a payment request in ReplyFlow.
2) Select payment provider (Stripe, Venmo, or PayPal).
3) Enter amount and description.
4) Send via SMS or copy link.

Stripe payment link experience
Customer receives:
- SMS with payment link
- Link opens Stripe checkout page
- Customer sees your business name
- Customer enters card details
- Payment processes immediately
- Customer sees success page
- Receipt sent to customer email

Venmo payment link experience
Customer receives:
- SMS with your Venmo username
- Customer opens Venmo app
- Customer searches for your username
- Customer sends payment to your username
- You receive notification in Venmo
- You must manually mark payment as paid in ReplyFlow

PayPal payment link experience
Customer receives:
- SMS with your PayPal payment link
- Customer clicks link
- Opens PayPal checkout
- Customer logs in to PayPal
- Customer pays
- You receive notification in PayPal
- You must manually mark payment as paid in ReplyFlow

What customer sees for each provider
- Stripe: Professional checkout with business branding
- Venmo: Your username, they pay in Venmo app
- PayPal: Your payment link, they pay on PayPal site

Authentication requirements
- Stripe: No customer account required
- Venmo: Customer must have Venmo account
- PayPal: Customer must have PayPal account (or guest checkout)

Mobile browser behavior
- All links work in mobile browsers
- Stripe checkout optimized for mobile
- Venmo/PayPal redirect to their apps if installed
- Fallback to mobile browser if apps not installed

Expired or invalid links
- Stripe links expire after 30 days
- Venmo username does not expire
- PayPal link may expire based on PayPal settings
- Invalid links show error message

Abandoned payments
- Stripe: Abandoned checkout leaves request as pending
- Venmo/PayPal: No automatic tracking, you must verify
- Can send reminder SMS for pending requests

ReplyFlow status updates
- Stripe: Automatic status update via webhook
- Venmo/PayPal: Manual status update by you
- Status changes from Pending to Paid

Customer timeline/history
- Payment request appears in customer timeline
- Payment completion appears in timeline
- All payment history visible in customer details

Important notes
- Stripe provides automatic processing
- Venmo/PayPal require manual tracking
- Customer experience varies by provider
- All providers are secure and PCI-compliant`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['payment link', 'customer experience', 'stripe checkout', 'venmo', 'paypal'],
    readingTime: 3,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Payment Requests overview', 'Venmo/PayPal', 'Marking payments paid'],
  },
  {
    id: 'device-specific-notification-settings',
    question: 'How do notification settings differ between iOS and Android?',
    summary: 'Platform-specific notification behavior and permission handling.',
    answer: `When you would use this
Understand how notifications work on iOS versus Android.

Native permission request
- iOS: System prompt appears on first notification
- Android: System prompt appears on first notification
- Both require user approval to send push notifications

Permission status detection
- ReplyFlow detects if permissions are granted
- Denied permissions show troubleshooting guidance
- Permanently denied permissions require manual device settings change

Opening device settings
- iOS: ReplyFlow can deep-link to iOS Settings app
- Android: ReplyFlow can deep-link to Android Settings
- User must manually enable notifications there
- ReplyFlow cannot enable permissions automatically

Denied versus permanently denied
- Denied: User said "Don't Allow" once
- Permanently denied: User selected "Don't Ask Again"
- Both require manual settings change to re-enable

Capacitor Preferences behavior
- ReplyFlow uses Capacitor for native notifications
- Preferences stored in native app settings
- Sync between app and device settings
- Changes take effect immediately

Prompt cooldown/session logic
- iOS: System limits how often permission prompt appears
- Android: System limits how often permission prompt appears
- ReplyFlow respects system limits
- Cannot bypass system permission prompts

Push token registration
- Token registered with push service (APNs for iOS, FCM for Android)
- Token required to send notifications to device
- Token refreshed periodically by system
- ReplyFlow stores token for sending notifications

In-app preference switches
- ReplyFlow does not currently have per-category preferences
- All push-enabled notifications are sent together
- Device-level settings control all notifications
- In-app toggle for enabling/disabling all notifications

Child preference disabling
- Not currently implemented
- Cannot disable specific notification types
- All or nothing approach currently

Native versus browser limitations
- Native apps: Full push notification support
- Web browsers: Limited notification support
- Web notifications require browser permission
- Web notifications work differently than native

What happens after reinstall
- Permission prompt appears again
- Push token is re-registered
- Previous notification history preserved
- Settings remain intact

What happens after signing into another account
- Notifications go to new account
- Previous account stops receiving notifications
- Device can only be signed into one account at a time

Why notifications might still fail
- Device in Do Not Disturb mode
- App killed in background
- Network connectivity issues
- Push service outage (rare)
- Battery optimization killing background processes

Important notes
- ReplyFlow cannot override device permission settings
- System controls final permission status
- Deep-link to device settings when permanently denied
- All platforms have similar permission flows`,
    category: 'Notifications',
    source: 'Notifications Guide',
    keywords: ['ios notifications', 'android notifications', 'device permissions', 'notification settings'],
    readingTime: 3,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Push notifications', 'Permission prompts', 'Notification categories'],
  },
  {
    id: 'sending-source-settings',
    question: 'What are sending source settings?',
    summary: 'Phone number configuration for outgoing messages.',
    answer: `When you would use this
Understand how outgoing messages are sent from ReplyFlow.

Current implementation
ReplyFlow uses your ReplyFlow-provided number for all outgoing messages.
- No separate "sending source" selection in current UI
- All SMS sent from your ReplyFlow Twilio number
- Voice calls use your ReplyFlow Twilio number
- Cannot use personal phone number for sending

ReplyFlow number behavior
- Number provisioned by ReplyFlow during setup
- Used for all SMS messages to customers
- Used for all AI Voice calls to customers
- Number appears as sender on customer's phone
- Cannot be changed to personal number

Business phone number
- Your original business phone (for call forwarding)
- Used for receiving incoming calls
- Forwarded to ReplyFlow number
- NOT used for sending messages
- Separate from ReplyFlow sending number

SMS versus voice behavior
- SMS: Always sent from ReplyFlow number
- Voice: Always from ReplyFlow number
- Both use Twilio infrastructure
- No option to use different numbers

Restrictions and validation
- Cannot change sending number
- Cannot use personal number for sending
- Must use ReplyFlow-provided number
- Number is tied to your account

Save behavior
- No separate sending source settings to save
- ReplyFlow number configured automatically
- Business phone configured in Settings
- Settings saved immediately

Provisioning dependencies
- ReplyFlow number provisioned during onboarding
- Twilio number assigned to your account
- Number activated before use
- Cannot use unprovisioned numbers

What customers see
- SMS from ReplyFlow number
- Calls from ReplyFlow number
- Cannot see your personal/business number
- ReplyFlow number is their contact point

Failure behavior
- If ReplyFlow number not provisioned: Cannot send messages
- If Twilio issue: Message delivery fails
- Error logged in ReplyFlow
- Troubleshooting guidance available

Tenant ownership checks
- Each account has unique ReplyFlow number
- Numbers not shared between accounts
- Cross-tenant isolation enforced
- Cannot use another account's number

Important notes
- ReplyFlow number is the only sending source
- No option to change sending source
- Business phone is for receiving only
- All outgoing communication from ReplyFlow number`,
    category: 'Settings & Account',
    source: 'Settings Guide',
    keywords: ['sending source', 'phone number', 'sms sending', 'outgoing messages'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Business settings', 'Call forwarding basics', 'Test ReplyFlow'],
  },
  {
    id: 'personal-communication-settings',
    question: 'What are Personal Contact settings?',
    summary: 'Personal Contacts for bypassing AI intake for known contacts.',
    answer: `When you would use this
Understand Personal Contacts and communication routing.

What Personal Contacts are
- Personal contacts bypass AI intake
- Known numbers you add manually
- Phone rings normally (no AI answers)
- You take the call directly
- Not imported from phone contacts

Adding Personal Contacts
1) Go to Settings.
2) Find Personal Contacts section.
3) Click "Add Contact."
4) Enter phone number.
5) Save contact.
6) Contact is immediately active.

Personal Contact behavior
- When Personal Contact calls: AI does not answer
- Phone rings normally
- You answer the call
- No SMS summary sent
- No job created automatically

Contact matching
- Phone numbers normalized for matching
- Duplicate numbers not allowed
- Exact match required
- Phone number is the key identifier

Add/edit/remove behavior
- Add: Enter phone number, save
- Edit: Change phone number
- Remove: Delete contact
- Changes take effect immediately
- No confirmation required for removal

What known contacts experience
- Normal phone ringing
- Direct call to you
- No AI intervention
- No automatic job creation
- You handle the call manually

What happens after removal
- Number becomes regular customer
- AI will answer next call
- Normal AI intake flow
- Jobs may be created automatically

Duplicate contacts
- System prevents duplicate phone numbers
- Error shown if duplicate entered
- Must remove existing before adding duplicate
- Phone number is unique identifier

Cross-tenant isolation
- Personal Contacts are account-specific
- Not shared between accounts
- Each account has its own list
- Cannot see another account's contacts

Phone-address-book importing
- NOT currently implemented
- Must add contacts manually
- No automatic import from phone
- Manual entry only

Personal vs business communication
- Personal Contacts: Bypass AI, direct to you
- Regular customers: AI answers, collects information
- Personal Contacts: Your choice how to handle
- Regular customers: Automated intake and job creation

Any personal profile settings
- No separate personal profile
- Personal Contacts is the only personal feature
- All other settings are business-wide
- No personal communication preferences

Important notes
- Personal Contacts bypass AI completely
- Must add manually, no import
- Phone numbers are unique identifiers
- Removal enables AI for that number`,
    category: 'Settings & Account',
    source: 'Settings Guide',
    keywords: ['personal contacts', 'bypass ai', 'known contacts', 'personal communication'],
    readingTime: 2,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Personal Contacts overview', 'How AI Voice works', 'Ignored contacts'],
  },
  {
    id: 'merchant-education',
    question: 'What is Tap to Pay on iPhone merchant education?',
    summary: 'Apple-required education flow for Tap to Pay on iPhone.',
    answer: `When you would use this
Understand the merchant education requirement for Tap to Pay on iPhone.

What merchant education is
Apple requires merchants to complete education before using Tap to Pay on iPhone.
This is an Apple requirement, not a ReplyFlow requirement.

When merchant education appears
- First time you attempt to use Tap to Pay
- Before processing your first payment
- Device-scoped completion (per iPhone)
- One-time requirement

First-time awareness UI
- ReplyFlow shows education modal
- Explains Tap to Pay requirements
- Links to Apple's merchant resources
- Must complete before proceeding

Native iOS education attempt
- ReplyFlow attempts to open Apple's education
- Opens Apple's merchant education page
- User completes education on Apple's site
- ReplyFlow detects completion

Fallback education
- If native education fails: ReplyFlow shows in-app education
- Covers same content as Apple's education
- User confirms completion
- ReplyFlow marks education as complete

Device-scoped completion
- Education completion stored per device
- Each iPhone requires separate completion
- Does not sync across devices
- Must complete on each device used

Business-scoped completion
- Education status tied to business account
- One completion per business per device
- Not shared across businesses
- Each business must complete separately

Education versioning
- Apple may update education requirements
- ReplyFlow tracks education version
- Re-education may be required if Apple updates
- Automatic detection of version changes

Education-required decision
- Payment held until education complete
- Cannot process Tap to Pay without education
- Clear error message if incomplete
- Must complete before payment

Cancel/dismiss behavior
- Can dismiss education modal
- Payment not processed if dismissed
- Can return to education later
- No penalty for dismissing

Retry behavior
- Can retry education anytime
- Modal appears again on next attempt
- No limit on retry attempts
- Completion persists once done

Reinstall behavior
- Education status may reset after reinstall
- May need to complete education again
- Device-scoped, so reinstall affects it
- Apple may require re-education

Returning user behavior
- Education not required if already completed
- Normal Tap to Pay flow
- No additional prompts
- Payment processes immediately

Settings path for reopening education
- Currently no Settings option to reopen education
- Education appears when needed
- Contact support if need to retake education
- May be added in future update

Platform limitations
- iPhone only (iOS 16.0+)
- Not available on Android
- Requires iPhone XS or later
- Requires NFC capability

Exact UI labels
- "Tap to Pay on iPhone"
- "Merchant Education Required"
- "Complete Education"
- "Learn More"

Important notes
- Apple requirement, not ReplyFlow
- One-time per device
- Must complete before first payment
- Does not guarantee Stripe account readiness
- Separate from Stripe verification`,
    category: 'Payments',
    source: 'Payments Guide',
    keywords: ['tap to pay education', 'merchant education', 'apple education', 'tap to pay requirements'],
    readingTime: 3,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Tap to Pay on iPhone', 'Tap to Pay requirements', 'Connect Stripe'],
  },
  {
    id: 'customer-timeline-history',
    question: 'What is the difference between Timeline and Request History?',
    summary: 'Understanding customer timeline events and request history entries.',
    answer: `When you would use this
Distinguish between Timeline events and Request History entries.

Timeline events
Timeline shows all activity for a customer:
- SMS messages (inbound and outbound)
- AI intake completion events
- Job events (created, status changes)
- Appointment events
- Payment events
- Internal notes
- Status changes
- Address corrections

Request History
Request History shows each AI intake call:
- Each entry is a separate request/intake
- Shows when customer called
- Shows intake status (Complete, Partial)
- Shows canonical request title
- Per-request information preserved
- Historical requests not overwritten

"Intake Complete" meaning
- AI finished gathering information
- Customer's phone call ended
- All available information collected
- Does NOT mean job or work is finished
- Does NOT mean customer has paid

"Partial Intake" meaning
- AI could not complete information gathering
- Customer hung up before completion
- Information incomplete
- May need follow-up call
- Request still saved in history

Address correction storage
- Corrections stored in customer record
- Address updated in customer data
- Correction event appears in timeline
- Visual placement of correction event may vary
- Address correction is separate from timeline display

Latest customer state
- Latest request title reflects most recent intake
- Historical requests retain their own titles
- Historical requests not overwritten
- Each request has its own canonical title
- Latest state used for current operations

Historical preservation
- All requests preserved in history
- No historical data deleted
- Timeline shows complete history
- Can view any past request
- Full audit trail available

Sorting and timestamps
- Timeline sorted chronologically (newest first)
- Each event has timestamp
- Request history sorted by call time
- Accurate time tracking
- Timezone-aware display

Refresh behavior
- Timeline refreshes on page load
- New events appear automatically
- Manual refresh updates data
- Real-time updates via subscriptions

Empty states
- New customer: No timeline events
- No calls yet: No Request History entries
- Add messages or receive calls to populate
- Clear UI indication when empty

Important notes
- Each Request History entry is its own intake
- Historical requests not overwritten by latest
- Intake Complete ≠ Job Completed
- Address correction stored separately from timeline
- Timeline shows complete customer history`,
    category: 'Customers and Conversations',
    source: 'Customer Guide',
    keywords: ['timeline', 'request history', 'intake complete', 'customer history'],
    readingTime: 3,
    lastUpdated: '2025-01-09',
    relatedQuestions: ['Customer details overview', 'AI intake meaning', 'Intake Complete vs Job Completed'],
  },
]
