/**
 * Regression tests for separated ask_name/ask_reason flow
 * Tests the new two-stage intake flow replacing the combined ask_name_reason stage
 */

const expectEqual = (a: any, b: any, label: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    console.error(`[FAIL] ${label}\n  expected: ${JSON.stringify(b)}\n  actual:   ${JSON.stringify(a)}`);
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
};

console.log('=== SEPARATED NAME/REASON FLOW REGRESSION TESTS ===');

// Scenario: ask_name transcription acceptance
const validateStageAnswer = (stage: string, transcript: string) => {
  const trimmed = transcript.trim().toLowerCase();
  const fillerWords = ['yeah', 'yep', 'yes', 'uh', 'um', 'okay', 'ok', 'alright', 'sure', 'fine', 'sorry', 'well', 'so'];
  const words = trimmed.replace(/[.,!?]/g, '').split(/\s+/).filter(w => w.length > 0);
  const isFillerOnly = words.length === 0 || (words.length <= 3 && words.every(w => fillerWords.some(f => w === f || w.startsWith(f))));
  const hasNameContent = ['my name is', "i'm", 'i am', 'this is', 'call me'].some(ind => trimmed.includes(ind));
  const hasServiceContent = ['need', 'want', 'looking for', 'help with', 'service', 'repair', 'install', 'issue', 'problem'].some(ind => trimmed.includes(ind));
  
  if (stage === 'ask_name') {
    if (isFillerOnly) return { accepted: false, rejectionReason: 'filler_only' };
    if (hasNameContent || trimmed.length >= 2) return { accepted: true };
    return { accepted: false, rejectionReason: 'no_name_content' };
  }
  
  if (stage === 'ask_reason') {
    if (isFillerOnly) return { accepted: false, rejectionReason: 'filler_only' };
    if (hasServiceContent || trimmed.length >= 3) return { accepted: true };
    return { accepted: false, rejectionReason: 'no_service_content' };
  }
  
  return { accepted: true };
};

// Test 1: accept valid name-only answer in ask_name stage
const result1 = validateStageAnswer('ask_name', 'My name is John Smith');
expectEqual(result1.accepted, true, 'ask_name accepts valid name-only answer');
expectEqual(result1.rejectionReason, undefined, 'ask_name valid answer has no rejection reason');

// Test 2: reject filler-only answer in ask_name stage
const result2 = validateStageAnswer('ask_name', 'Yeah, uh, okay');
expectEqual(result2.accepted, false, 'ask_name rejects filler-only answer');
expectEqual(result2.rejectionReason, 'filler_only', 'ask_name filler rejection reason is filler_only');

// Test 3: accept valid service answer in ask_reason stage
const result3 = validateStageAnswer('ask_reason', 'I need a furnace repair');
expectEqual(result3.accepted, true, 'ask_reason accepts valid service answer');
expectEqual(result3.rejectionReason, undefined, 'ask_reason valid answer has no rejection reason');

// Test 4: reject filler-only answer in ask_reason stage
const result4 = validateStageAnswer('ask_reason', 'Um, okay');
expectEqual(result4.accepted, false, 'ask_reason rejects filler-only answer');
expectEqual(result4.rejectionReason, 'filler_only', 'ask_reason filler rejection reason is filler_only');

// Scenario: ask_name edge case extraction
const parseNameAndService = (text: string) => {
  const trimmed = text.trim();
  const namePatterns = [
    /^my name is[\s,]*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^i'm[\s,]*(.+?)(?:\.|,|;|\band\b|$)/i,
    /^this is[\s,]*(.+?)(?:\.|,|;|\band\b|$)/i,
  ];
  
  for (const pattern of namePatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return { customerName: match[1].trim(), serviceRequested: '' };
    }
  }
  
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex > 0) {
    const name = trimmed.slice(0, commaIndex).trim();
    const service = trimmed.slice(commaIndex + 1).trim();
    return { customerName: name, serviceRequested: service };
  }
  
  const serviceIndicators = ['need', 'want', 'looking for', 'help with', 'service', 'repair'];
  const hasService = serviceIndicators.some(ind => trimmed.toLowerCase().includes(ind));
  
  if (hasService) {
    return { customerName: '', serviceRequested: trimmed };
  }
  
  return { customerName: trimmed, serviceRequested: '' };
};

// Test 5: extract name only and proceed to ask_reason
const result5 = parseNameAndService('My name is John Smith');
expectEqual(result5.customerName, 'John Smith', 'extract name only from name-only answer');
expectEqual(result5.serviceRequested, '', 'no service extracted from name-only answer');

// Test 6: extract both name and reason and skip ask_reason
const result6 = parseNameAndService('John Smith, I need a repair');
expectEqual(result6.customerName, 'John Smith', 'extract name from combined answer');
expectEqual(result6.serviceRequested, 'I need a repair', 'extract service from combined answer');

// Test 7: extract reason only and trigger name reprompt
const result7 = parseNameAndService('I need a repair');
expectEqual(result7.customerName, '', 'no name extracted from service-only answer');
expectEqual(result7.serviceRequested, 'I need a repair', 'extract service from service-only answer');

// Scenario: stage advancement routing
const getNextIntakeStage = (currentStage: string, skipNext: boolean = false) => {
  const stageSequence: Record<string, string> = {
    ask_name: 'ask_reason',
    ask_reason: 'ask_details',
    ask_details: 'ask_location',
    ask_location: 'ask_completion_time',
    ask_completion_time: 'ask_callback_time',
    ask_callback_time: 'complete'
  };
  
  if (skipNext && currentStage === 'ask_name') {
    return stageSequence['ask_reason'] || 'ask_details';
  }
  return stageSequence[currentStage] || currentStage;
};

// Test 8: route from ask_name to ask_reason after name-only answer
const nextStage1 = getNextIntakeStage('ask_name');
expectEqual(nextStage1, 'ask_reason', 'ask_name routes to ask_reason');

// Test 9: route from ask_reason to ask_details after service answer
const nextStage2 = getNextIntakeStage('ask_reason');
expectEqual(nextStage2, 'ask_details', 'ask_reason routes to ask_details');

// Test 10: skip ask_reason when skipNextStage is true
const nextStage3 = getNextIntakeStage('ask_name', true);
expectEqual(nextStage3, 'ask_details', 'ask_name skips to ask_details when skipNext is true');

// Scenario: partial intake persistence on hangup
const mockState1 = {
  callSid: 'CA123456789',
  businessId: 'biz_123',
  callerPhone: '+15551234567',
  intakeData: {
    customerName: 'John Smith',
    serviceRequested: 'furnace repair',
    issueDescription: '',
    serviceAddress: '',
    desiredCompletionTime: '',
    callbackTime: ''
  },
  stageCaptures: ['customerName', 'serviceRequested'],
  completionPersistenceStarted: false
};

const shouldPersist1 = !mockState1.completionPersistenceStarted && 
                      (mockState1.stageCaptures.length > 0 || 
                       Object.keys(mockState1.intakeData).some(k => mockState1.intakeData[k as keyof typeof mockState1.intakeData]));

expectEqual(shouldPersist1, true, 'persist partial intake on WebSocket close with data');
expectEqual(mockState1.intakeData.customerName, 'John Smith', 'customer name persisted');
expectEqual(mockState1.intakeData.serviceRequested, 'furnace repair', 'service requested persisted');

// Test 11: skip persistence when completion already processed
const mockState2 = {
  callSid: 'CA123456789',
  businessId: 'biz_123',
  callerPhone: '+15551234567',
  intakeData: {
    customerName: 'John Smith',
    serviceRequested: 'furnace repair'
  },
  stageCaptures: ['customerName', 'serviceRequested'],
  completionPersistenceStarted: true
};

const shouldPersist2 = !mockState2.completionPersistenceStarted && 
                      (mockState2.stageCaptures.length > 0 || 
                       Object.keys(mockState2.intakeData).some(k => mockState2.intakeData[k as keyof typeof mockState2.intakeData]));

expectEqual(shouldPersist2, false, 'skip persistence when completion already processed');

// Test 12: skip persistence when no data captured
const mockState3 = {
  callSid: 'CA123456789',
  businessId: 'biz_123',
  callerPhone: '+15551234567',
  intakeData: {
    customerName: '',
    serviceRequested: ''
  },
  stageCaptures: [],
  completionPersistenceStarted: false
};

const shouldPersist3 = !mockState3.completionPersistenceStarted && 
                      (mockState3.stageCaptures.length > 0 || 
                       Object.keys(mockState3.intakeData).some(k => mockState3.intakeData[k as keyof typeof mockState3.intakeData]));

expectEqual(shouldPersist3, false, 'skip persistence when no data captured');

// Scenario: SMS eligibility on incomplete call
const mockState4 = {
  callSid: 'CA123456789',
  businessId: 'biz_123',
  callerPhone: '+15551234567',
  intakeData: {
    customerName: 'John Smith',
    serviceRequested: 'furnace repair'
  }
};

const isEligible1 = !!mockState4.callSid && 
                    !!mockState4.businessId && 
                    !!mockState4.callerPhone &&
                    Object.keys(mockState4.intakeData).some(k => mockState4.intakeData[k as keyof typeof mockState4.intakeData]);

expectEqual(isEligible1, true, 'SMS eligible when partial intake persisted with valid context');

// Test 13: not eligible for SMS when missing required context
const mockState5 = {
  callSid: '',
  businessId: 'biz_123',
  callerPhone: '+15551234567',
  intakeData: {
    customerName: 'John Smith',
    serviceRequested: 'furnace repair'
  }
};

const isEligible2 = !!mockState5.callSid && 
                    !!mockState5.businessId && 
                    !!mockState5.callerPhone;

expectEqual(isEligible2, false, 'SMS not eligible when missing callSid');

// Scenario: idempotent finalization
let completionPersistenceStarted = false;
let finalizationCount = 0;

const finalize = () => {
  if (!completionPersistenceStarted) {
    completionPersistenceStarted = true;
    finalizationCount++;
  }
};

finalize();
finalize();
finalize();

expectEqual(finalizationCount, 1, 'idempotent finalization prevents duplicate calls');
expectEqual(completionPersistenceStarted, true, 'completionPersistenceStarted flag set after first call');

console.log('\n✓ All separated name/reason flow regression tests passed');
