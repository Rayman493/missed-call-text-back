/**
 * Integration-level state machine tests for transcription lifecycle
 * Tests the complete flow from transcription acceptance to prompt routing
 * including turnId tracking, timer clearing, and targeted reprompt selection
 */

// Mock state structure matching the production Simple Mode state
interface SimpleModeState {
  currentStage: string;
  currentTurnId: number;
  assistantSpeaking: boolean;
  intakeData: {
    customerName: string;
    serviceRequested: string;
    issueDescription: string;
    serviceAddress: string;
    desiredCompletionTime: string;
    callbackTime: string;
  };
  stageTimeout: NodeJS.Timeout | null;
  silentTimeout: NodeJS.Timeout | null;
  transcriptionWatchdogTimeout: NodeJS.Timeout | null;
  stageCaptures: Array<{ stage: string; fieldName: string; value: string; timestamp: number }>;
}

// Mock prompt structure
const prompts = {
  ask_name_reason: "Hi, thanks for calling. To get started, could you tell me your name and what you're calling about?",
  ask_name_reason_service_only: "Thanks. And what do you need help with?",
  ask_name_reason_name_only: "Thanks. And could you tell me your name?",
  ask_details: "Got it. Could you tell me a bit more about what's going on?",
  ask_location_or_context: "Understood. Where is this located?",
  ask_timing: "When would you like this taken care of?",
  ask_callback_time: "What's the best time to reach you?",
  complete: "Thanks for that information. We'll be in touch shortly. Have a great day!"
};

// Simulated transcription event handler (simplified from production)
class TranscriptionLifecycleSimulator {
  private state: SimpleModeState;
  private promptSendLog: Array<{ turnId: number; stage: string; promptKey: string; source: string }>;
  private timerClearLog: Array<{ timer: string; reason: string; turnId: number }>;

  constructor() {
    this.state = {
      currentStage: 'ask_name_reason',
      currentTurnId: 0,
      assistantSpeaking: false,
      intakeData: {
        customerName: '',
        serviceRequested: '',
        issueDescription: '',
        serviceAddress: '',
        desiredCompletionTime: '',
        callbackTime: ''
      },
      stageTimeout: setTimeout(() => {}, 10000), // Initialize with mock timeout
      silentTimeout: setTimeout(() => {}, 10000), // Initialize with mock timeout
      transcriptionWatchdogTimeout: setTimeout(() => {}, 10000), // Initialize with mock timeout
      stageCaptures: []
    };
    this.promptSendLog = [];
    this.timerClearLog = [];
  }

  // Simulate transcription acceptance with field parsing
  handleTranscriptionAccepted(transcript: string, turnId: number, forceFields?: { customerName?: string; serviceRequested?: string }): void {
    // Validate turnId matches current turn
    if (turnId < this.state.currentTurnId) {
      console.log(`[STALE CALLBACK] turnId ${turnId} < currentTurnId ${this.state.currentTurnId}`);
      return;
    }

    // Use forced fields if provided (for testing), otherwise parse
    let customerName = '';
    let serviceRequested = '';
    
    if (forceFields) {
      customerName = forceFields.customerName || '';
      serviceRequested = forceFields.serviceRequested || '';
    } else {
      const parsed = this.parseNameAndService(transcript);
      customerName = parsed.customerName;
      serviceRequested = parsed.serviceRequested;
    }
    
    // Merge with existing intake data (partial-field merge)
    if (customerName && !this.state.intakeData.customerName) {
      this.state.intakeData.customerName = customerName;
    }
    if (serviceRequested && !this.state.intakeData.serviceRequested) {
      this.state.intakeData.serviceRequested = serviceRequested;
    }

    // Record stage capture
    this.state.stageCaptures.push({
      stage: this.state.currentStage,
      fieldName: 'intake',
      value: transcript,
      timestamp: Date.now()
    });

    // Clear timers on valid transcription
    this.clearTimers('valid_transcription_accepted', turnId);

    // Store the turnId for this transcription event (before increment)
    const transcriptionTurnId = turnId;

    // Increment turnId to invalidate stale callbacks
    this.state.currentTurnId++;

    // CRITICAL FIX: Use the NEW turn ID for targeted reprompt authorization
    // The targeted reprompt is a response to the current accepted turn, so it must be
    // authorized for the NEXT listening turn (the incremented turn ID).
    // This prevents the stale callback guard from rejecting legitimate targeted reprompts.
    const authorizedTurnId = this.state.currentTurnId;

    // Route to appropriate prompt based on field validity (use authorized turnId)
    this.routePostTranscriptionPrompt(authorizedTurnId);
  }

  // Simplified name/service parsing
  private parseNameAndService(transcript: string): { customerName: string; serviceRequested: string } {
    const trimmed = transcript.trim();
    const lower = trimmed.toLowerCase();

    // Detect name patterns
    const namePatterns = [
      /^(?:hi|hello|hey)[,\s]+(?:this is|my name is|my name's|name is|i am|i'm)\s+(.+)$/i,
      /^(?:this is|my name is|my name's|name is|i am|i'm)\s+(.+)$/i,
      /^([a-z][a-z' -]{1,40}?)\s+here$/i,
    ];

    let customerName = '';
    for (const pattern of namePatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        customerName = match[1].trim();
        break;
      }
    }

    // Detect service patterns
    const servicePatterns = [
      /(?:i'm calling because|i am calling because|calling because)\s+(.+)/i,
      /(?:i'm calling about|i am calling about|calling about)\s+(.+)/i,
      /(?:i need|i want|i'd like|i would like)\s+(.+)/i,
      /(?:looking for|looking to|need someone to)\s+(.+)/i,
    ];

    let serviceRequested = '';
    for (const pattern of servicePatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        serviceRequested = match[1].trim();
        break;
      }
    }

    return { customerName, serviceRequested };
  }

  // Clear all timers
  private clearTimers(reason: string, turnId: number): void {
    if (this.state.stageTimeout) {
      this.timerClearLog.push({ timer: 'stageTimeout', reason, turnId });
      this.state.stageTimeout = null;
    }
    if (this.state.silentTimeout) {
      this.timerClearLog.push({ timer: 'silentTimeout', reason, turnId });
      this.state.silentTimeout = null;
    }
    if (this.state.transcriptionWatchdogTimeout) {
      this.timerClearLog.push({ timer: 'transcriptionWatchdogTimeout', reason, turnId });
      this.state.transcriptionWatchdogTimeout = null;
    }
  }

  // Route to appropriate prompt after transcription
  private routePostTranscriptionPrompt(turnId: number): void {
    const hasValidCustomerName = !!this.state.intakeData.customerName && this.state.intakeData.customerName.trim() !== '';
    const hasValidServiceRequested = !!this.state.intakeData.serviceRequested && this.state.intakeData.serviceRequested.trim() !== '';

    if (this.state.currentStage === 'ask_name_reason') {
      if (hasValidCustomerName && hasValidServiceRequested) {
        // Both fields valid - advance to next stage
        this.state.currentStage = 'ask_details';
        this.sendPrompt('ask_details', 'ask_details', 'normal_stage_advancement', turnId);
      } else if (hasValidCustomerName && !hasValidServiceRequested) {
        // Only name valid - targeted service reprompt
        this.sendPrompt('ask_name_reason', 'ask_name_reason_service_only', 'targeted_reprompt', turnId);
      } else if (!hasValidCustomerName && hasValidServiceRequested) {
        // Only service valid - targeted name reprompt
        this.sendPrompt('ask_name_reason', 'ask_name_reason_name_only', 'targeted_reprompt', turnId);
      } else {
        // Neither valid - full combined reprompt
        this.sendPrompt('ask_name_reason', 'ask_name_reason', 'full_reprompt', turnId);
      }
    } else {
      // Normal stage advancement for other stages
      const nextStage = this.getNextStage(this.state.currentStage);
      if (nextStage) {
        this.state.currentStage = nextStage;
        this.sendPrompt(nextStage, nextStage, 'normal_stage_advancement', turnId);
      }
    }
  }

  // Get next stage in sequence
  private getNextStage(currentStage: string): string | null {
    const stageSequence = ['ask_name_reason', 'ask_details', 'ask_location_or_context', 'ask_timing', 'ask_callback_time', 'complete'];
    const currentIndex = stageSequence.indexOf(currentStage);
    if (currentIndex >= 0 && currentIndex < stageSequence.length - 1) {
      return stageSequence[currentIndex + 1];
    }
    return null;
  }

  // Simulate prompt send
  private sendPrompt(stage: string, promptKey: string, source: string, turnId: number): void {
    this.promptSendLog.push({ turnId, stage, promptKey, source });
  }

  // Get test results
  getResults() {
    return {
      state: { ...this.state },
      promptSendLog: [...this.promptSendLog],
      timerClearLog: [...this.timerClearLog]
    };
  }

  // Reset for next test
  reset() {
    this.state = {
      currentStage: 'ask_name_reason',
      currentTurnId: 0,
      assistantSpeaking: false,
      intakeData: {
        customerName: '',
        serviceRequested: '',
        issueDescription: '',
        serviceAddress: '',
        desiredCompletionTime: '',
        callbackTime: ''
      },
      stageTimeout: setTimeout(() => {}, 10000), // Initialize with mock timeout
      silentTimeout: setTimeout(() => {}, 10000), // Initialize with mock timeout
      transcriptionWatchdogTimeout: setTimeout(() => {}, 10000), // Initialize with mock timeout
      stageCaptures: []
    };
    this.promptSendLog = [];
    this.timerClearLog = [];
  }
}

// Test cases
console.log('=== TRANSCRIPTION LIFECYCLE INTEGRATION TESTS ===\n');

let passed = 0;
let failed = 0;

const testCases = [
  {
    description: "Partial name only response → targeted service_only reprompt",
    transcript: "Rachel Adams",
    forceFields: { customerName: "Rachel Adams", serviceRequested: "" },
    expectedPromptKey: 'ask_name_reason_service_only',
    expectedSource: 'targeted_reprompt',
    expectedStage: 'ask_name_reason',
    expectedTurnId: 1  // After increment (FIX: was 0, now 1)
  },
  {
    description: "Partial service only response → targeted name_only reprompt",
    transcript: "I need help with a clogged drain",
    forceFields: { customerName: "", serviceRequested: "help with a clogged drain" },
    expectedPromptKey: 'ask_name_reason_name_only',
    expectedSource: 'targeted_reprompt',
    expectedStage: 'ask_name_reason',
    expectedTurnId: 1  // After increment (FIX: was 0, now 1)
  },
  {
    description: "Both fields valid → advance stage, no reprompt",
    transcript: "Rachel Adams, I need help with a clogged drain",
    forceFields: { customerName: "Rachel Adams", serviceRequested: "help with a clogged drain" },
    expectedPromptKey: 'ask_details',
    expectedSource: 'normal_stage_advancement',
    expectedStage: 'ask_details',
    expectedTurnId: 1  // After increment (FIX: was 0, now 1)
  },
  {
    description: "Neither field valid → full combined reprompt",
    transcript: "I'm not sure",
    forceFields: { customerName: "", serviceRequested: "" },
    expectedPromptKey: 'ask_name_reason',
    expectedSource: 'full_reprompt',
    expectedStage: 'ask_name_reason',
    expectedTurnId: 1  // After increment (FIX: was 0, now 1)
  },
  {
    description: "Repeated partial name responses → no full prompt repeated",
    transcripts: [
      { transcript: "Rachel Adams", forceFields: { customerName: "Rachel Adams", serviceRequested: "" } },
      { transcript: "I said Rachel Adams", forceFields: { customerName: "Rachel Adams", serviceRequested: "" } }
    ],
    expectedPromptKeys: ['ask_name_reason_service_only', 'ask_name_reason_service_only'],
    expectedSources: ['targeted_reprompt', 'targeted_reprompt'],
    expectedTurnIds: [1, 2]  // After each increment (FIX: was [0, 1], now [1, 2])
  }
];

const simulator = new TranscriptionLifecycleSimulator();

for (const testCase of testCases) {
  simulator.reset();
  
  if (testCase.transcripts) {
    // Multi-turn test
    for (let i = 0; i < testCase.transcripts.length; i++) {
      const turn = testCase.transcripts[i] as { transcript: string; forceFields: { customerName: string; serviceRequested: string } };
      simulator.handleTranscriptionAccepted(turn.transcript, simulator['state'].currentTurnId, turn.forceFields);
    }
    
    const results = simulator.getResults();
    const actualPromptKeys = results.promptSendLog.map(log => log.promptKey);
    const actualSources = results.promptSendLog.map(log => log.source);
    const actualTurnIds = results.promptSendLog.map(log => log.turnId);
    
    const promptKeysMatch = JSON.stringify(actualPromptKeys) === JSON.stringify(testCase.expectedPromptKeys);
    const sourcesMatch = JSON.stringify(actualSources) === JSON.stringify(testCase.expectedSources);
    const turnIdsMatch = JSON.stringify(actualTurnIds) === JSON.stringify(testCase.expectedTurnIds);
    
    if (promptKeysMatch && sourcesMatch && turnIdsMatch) {
      console.log(`✓ PASS: ${testCase.description}`);
      passed++;
    } else {
      console.log(`✗ FAIL: ${testCase.description}`);
      console.log(`  Expected promptKeys: ${JSON.stringify(testCase.expectedPromptKeys)}`);
      console.log(`  Actual promptKeys: ${JSON.stringify(actualPromptKeys)}`);
      console.log(`  Expected sources: ${JSON.stringify(testCase.expectedSources)}`);
      console.log(`  Actual sources: ${JSON.stringify(actualSources)}`);
      console.log(`  Expected turnIds: ${JSON.stringify(testCase.expectedTurnIds)}`);
      console.log(`  Actual turnIds: ${JSON.stringify(actualTurnIds)}`);
      failed++;
    }
  } else {
    // Single-turn test
    simulator.handleTranscriptionAccepted(testCase.transcript, 0, testCase.forceFields);
    
    const results = simulator.getResults();
    const lastPrompt = results.promptSendLog[results.promptSendLog.length - 1];
    
    const promptKeyMatch = lastPrompt?.promptKey === testCase.expectedPromptKey;
    const sourceMatch = lastPrompt?.source === testCase.expectedSource;
    const stageMatch = results.state.currentStage === testCase.expectedStage;
    const turnIdMatch = lastPrompt?.turnId === testCase.expectedTurnId;
    
    if (promptKeyMatch && sourceMatch && stageMatch && turnIdMatch) {
      console.log(`✓ PASS: ${testCase.description}`);
      passed++;
    } else {
      console.log(`✗ FAIL: ${testCase.description}`);
      console.log(`  Expected promptKey: ${testCase.expectedPromptKey}, Actual: ${lastPrompt?.promptKey}`);
      console.log(`  Expected source: ${testCase.expectedSource}, Actual: ${lastPrompt?.source}`);
      console.log(`  Expected stage: ${testCase.expectedStage}, Actual: ${results.state.currentStage}`);
      console.log(`  Expected turnId: ${testCase.expectedTurnId}, Actual: ${lastPrompt?.turnId}`);
      failed++;
    }
  }
}

// Additional test: Stale callback rejection
console.log('\n=== STALE CALLBACK REJECTION TEST ===\n');
simulator.reset();

// First valid transcription
simulator.handleTranscriptionAccepted("Rachel Adams", 0);
const firstResults = simulator.getResults();
const firstTurnId = firstResults.state.currentTurnId;

// Attempt to send prompt with stale turnId
simulator.handleTranscriptionAccepted("Adams", firstTurnId - 1);
const staleResults = simulator.getResults();

// Should have only one prompt send (the valid one)
if (staleResults.promptSendLog.length === 1) {
  console.log('✓ PASS: Stale callback rejected');
  passed++;
} else {
  console.log('✗ FAIL: Stale callback not rejected');
  console.log(`  Expected 1 prompt send, got ${staleResults.promptSendLog.length}`);
  failed++;
}

// Additional test: Targeted prompt delivery with fallback
console.log('\n=== TARGETED PROMPT DELIVERY TESTS ===\n');

// Test 1: Name-only targeted prompt delivery
simulator.reset();
simulator.handleTranscriptionAccepted("Rachel Adams", 0, { customerName: "Rachel Adams", serviceRequested: "" });
const nameOnlyResults = simulator.getResults();
const nameOnlyPrompt = nameOnlyResults.promptSendLog[nameOnlyResults.promptSendLog.length - 1];
if (nameOnlyPrompt?.promptKey === 'ask_name_reason_service_only' && nameOnlyPrompt?.source === 'targeted_reprompt') {
  console.log('✓ PASS: Name-only targeted prompt delivery');
  passed++;
} else {
  console.log('✗ FAIL: Name-only targeted prompt delivery');
  console.log(`  Expected promptKey: ask_name_reason_service_only, Actual: ${nameOnlyPrompt?.promptKey}`);
  console.log(`  Expected source: targeted_reprompt, Actual: ${nameOnlyPrompt?.source}`);
  failed++;
}

// Test 2: Service-only targeted prompt delivery
simulator.reset();
simulator.handleTranscriptionAccepted("I need help with a clogged drain", 0, { customerName: "", serviceRequested: "help with a clogged drain" });
const serviceOnlyResults = simulator.getResults();
const serviceOnlyPrompt = serviceOnlyResults.promptSendLog[serviceOnlyResults.promptSendLog.length - 1];
if (serviceOnlyPrompt?.promptKey === 'ask_name_reason_name_only' && serviceOnlyPrompt?.source === 'targeted_reprompt') {
  console.log('✓ PASS: Service-only targeted prompt delivery');
  passed++;
} else {
  console.log('✗ FAIL: Service-only targeted prompt delivery');
  console.log(`  Expected promptKey: ask_name_reason_name_only, Actual: ${serviceOnlyPrompt?.promptKey}`);
  console.log(`  Expected source: targeted_reprompt, Actual: ${serviceOnlyPrompt?.source}`);
  failed++;
}

// Test 3: Full combined answer (normal flow)
simulator.reset();
simulator.handleTranscriptionAccepted("Rachel Adams and I need help with a clogged drain", 0, { customerName: "Rachel Adams", serviceRequested: "help with a clogged drain" });
const combinedResults = simulator.getResults();
const combinedPrompt = combinedResults.promptSendLog[combinedResults.promptSendLog.length - 1];
if (combinedPrompt?.promptKey === 'ask_details' && combinedPrompt?.source === 'normal_stage_advancement' && combinedResults.state.currentStage === 'ask_details') {
  console.log('✓ PASS: Full combined answer normal flow');
  passed++;
} else {
  console.log('✗ FAIL: Full combined answer normal flow');
  console.log(`  Expected promptKey: ask_details, Actual: ${combinedPrompt?.promptKey}`);
  console.log(`  Expected source: normal_stage_advancement, Actual: ${combinedPrompt?.source}`);
  console.log(`  Expected stage: ask_details, Actual: ${combinedResults.state.currentStage}`);
  failed++;
}

// Test 4: Missing both fields (full reprompt)
simulator.reset();
simulator.handleTranscriptionAccepted("I'm not sure", 0, { customerName: "", serviceRequested: "" });
const missingBothResults = simulator.getResults();
const missingBothPrompt = missingBothResults.promptSendLog[missingBothResults.promptSendLog.length - 1];
if (missingBothPrompt?.promptKey === 'ask_name_reason' && missingBothPrompt?.source === 'full_reprompt') {
  console.log('✓ PASS: Missing both fields full reprompt');
  passed++;
} else {
  console.log('✗ FAIL: Missing both fields full reprompt');
  console.log(`  Expected promptKey: ask_name_reason, Actual: ${missingBothPrompt?.promptKey}`);
  console.log(`  Expected source: full_reprompt, Actual: ${missingBothPrompt?.source}`);
  failed++;
}

// Test 5: Repeated partial responses (no full prompt repeated)
simulator.reset();
simulator.handleTranscriptionAccepted("Rachel Adams", 0, { customerName: "Rachel Adams", serviceRequested: "" });
simulator.handleTranscriptionAccepted("I said Rachel Adams", 1, { customerName: "Rachel Adams", serviceRequested: "" });
const repeatedResults = simulator.getResults();
const repeatedPromptKeys = repeatedResults.promptSendLog.map(log => log.promptKey);
if (JSON.stringify(repeatedPromptKeys) === JSON.stringify(['ask_name_reason_service_only', 'ask_name_reason_service_only'])) {
  console.log('✓ PASS: Repeated partial responses no full prompt');
  passed++;
} else {
  console.log('✗ FAIL: Repeated partial responses no full prompt');
  console.log(`  Expected: ['ask_name_reason_service_only', 'ask_name_reason_service_only'], Actual: ${JSON.stringify(repeatedPromptKeys)}`);
  failed++;
}

// Test 6: Turn ID authorization for targeted reprompts
simulator.reset();
simulator.handleTranscriptionAccepted("Rachel Adams", 0, { customerName: "Rachel Adams", serviceRequested: "" });
const turnIdResults = simulator.getResults();
const turnIdPrompt = turnIdResults.promptSendLog[turnIdResults.promptSendLog.length - 1];
if (turnIdPrompt?.turnId === 1) { // After increment
  console.log('✓ PASS: Turn ID authorization for targeted reprompts');
  passed++;
} else {
  console.log('✗ FAIL: Turn ID authorization for targeted reprompts');
  console.log(`  Expected turnId: 1, Actual: ${turnIdPrompt?.turnId}`);
  failed++;
}

// Summary
console.log('\n=== TEST SUMMARY ===');
console.log(`Total: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

if (failed === 0) {
  console.log('\n✓ All integration tests passed!');
  process.exit(0);
} else {
  console.log('\n✗ Some integration tests failed.');
  process.exit(1);
}
