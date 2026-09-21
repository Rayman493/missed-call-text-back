/**
 * REPLYFLOW — AI INTAKE HARDENING BATCH 2 reliability stress matrix.
 *
 * Table-driven deterministic tests over the production intake helpers.
 * Categories A-P per the batch spec: normal answers, filler, meta,
 * corrections (same-turn / cross-stage / multi-field), out-of-order
 * volunteering, negation, incident-history vs future timing, vague timing,
 * callback phrasing, refusals, fragments, repeats, field ownership.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidCustomerName,
  isValidServiceAddress,
  isValidServiceRequest,
  isValidCompletionTime,
  isValidCallbackTime,
  isMetaUtterance,
  isConversationalFragment,
  isNameRequirementSatisfied,
  resolveNextSimpleModeStage,
  IntakeData,
} from '../src/intake-validation';
import {
  enrichIntakeFromTranscript,
  extractExplicitNameCorrection,
  extractCompletionTimeCandidate,
  extractCallbackTimeCandidate,
  splitServiceAndDetails,
  normalizeVagueCompletion,
} from '../src/intake-skip-ahead';

const intake = (stage: string, over: Partial<IntakeData> = {}): IntakeData => ({ stage, ...over });

const enrich = (t: string, stage: string, over: Partial<IntakeData> = {}) => {
  const i = intake(stage, over);
  enrichIntakeFromTranscript(t, i, stage);
  return i;
};

/* ------------------------------------------------------------------ */
/* A. NORMAL ANSWERS                                                   */
/* ------------------------------------------------------------------ */
describe('A. normal answers', () => {
  it.each([
    'My name is Daniel Harris.',
    "I'm Daniel Harris.",
    'This is Daniel Harris.',
    'Hi, my name is Daniel Harris.',
  ])('extracts name from "%s"', (t) => {
    const i = enrich(t, 'ask_name_reason');
    expect(i.customerName).toBe('Daniel Harris');
  });

  it.each([
    ['I need my garage door repaired.', 'garage door'],
    ['My garage door spring broke.', 'garage door'],
    ["I'm calling about a leaking sink.", 'sink'],
  ])('extracts service from "%s"', (t) => {
    const i = enrich(t, 'ask_name_reason', { customerName: 'Daniel Harris' });
    expect((i.serviceRequested || '').toLowerCase()).toContain(t.includes('sink') ? 'sink' : 'garage');
    expect(i.serviceRequested).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* B. FILLER / HESITATION                                              */
/* ------------------------------------------------------------------ */
describe('B. filler and hesitation', () => {
  it.each([
    ['Uh, Daniel Harris.', 'Daniel Harris'],
    ["Yeah, my name's Daniel Harris.", 'Daniel Harris'],
    ['Um, hi, this is Daniel Harris.', 'Daniel Harris'],
  ])('strips filler from name "%s"', (t, expected) => {
    const i = enrich(t, 'ask_name_reason');
    expect(i.customerName).toBe(expected);
  });

  it('extracts service despite filler', () => {
    const i = enrich('Um, I need somebody to look at my furnace.', 'ask_name_reason', {
      customerName: 'Daniel Harris',
    });
    expect((i.serviceRequested || '').toLowerCase()).toContain('furnace');
  });

  it('extracts vague completion despite filler', () => {
    const i = enrich('Well, sometime later this week would be great.', 'ask_completion_time', {
      customerName: 'Alex Rivera', serviceRequested: 'furnace repair', serviceAddress: '1 Main St',
    });
    expect(i.desiredCompletionTime).toBeTruthy();
    expect(isValidCompletionTime(i.desiredCompletionTime || '')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* C. META CONVERSATION                                                */
/* ------------------------------------------------------------------ */
describe('C. meta conversation never mutates fields', () => {
  it.each([
    'Can you hear me?',
    'Hello?',
    'Are you still there?',
    'Sorry, what was that?',
    'Give me one second.',
    'Hold on a second.',
    'One sec.',
    'Hello, still there?',
  ])('"%s" mutates nothing at callback stage', (t) => {
    const i = enrich(t, 'ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'tomorrow',
    });
    expect(i.callbackTime).toBeUndefined();
    expect(i.desiredCompletionTime).toBe('tomorrow');
    expect(i.serviceRequested).toBe('plumber');
  });

  it.each(['Can you hear me?', 'Hello?', 'Are you still there?', 'Give me one second.'])(
    '"%s" is meta', (t) => {
      expect(isMetaUtterance(t)).toBe(true);
    }
  );
});

/* ------------------------------------------------------------------ */
/* D. EXPLICIT CORRECTIONS                                             */
/* ------------------------------------------------------------------ */
describe('D. explicit corrections - latest wins', () => {
  it('name correction "No, it\'s Daniel Harris"', () => {
    const i = enrich("No, it's Daniel Harris.", 'ask_name_reason', { customerName: 'Daniel' });
    expect(i.customerName).toBe('Daniel Harris');
  });

  it('address correction "Actually, it\'s 937 Pine Hollow Road"', () => {
    const i = enrich("Actually, it's 937 Pine Hollow Road.", 'ask_location', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '931 Pine Hollow Road',
    });
    expect(i.serviceAddress).toBe('937 Pine Hollow Road');
  });

  it('completion correction "Make that Friday"', () => {
    const i = enrich('Make that Friday.', 'ask_completion_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'tomorrow',
    });
    expect((i.desiredCompletionTime || '').toLowerCase()).toBe('friday');
  });

  it('callback correction "Call me after 3 instead"', () => {
    const i = enrich('Call me after 3 instead.', 'ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'tomorrow', callbackTime: 'morning',
    });
    expect((i.callbackTime || '').toLowerCase()).toContain('after 3');
  });

  it('name correction "I said Michael Turner"', () => {
    const i = enrich('I said Michael Turner.', 'ask_name_reason', { customerName: 'Michael' });
    expect(i.customerName).toBe('Michael Turner');
  });
});

/* ------------------------------------------------------------------ */
/* E. SAME-TURN CORRECTIONS                                            */
/* ------------------------------------------------------------------ */
describe('E. same-turn corrections - only final value persists', () => {
  it('"Tomorrow morning — actually, make that after 2"', () => {
    const i = enrich('Tomorrow morning — actually, make that after 2.', 'ask_completion_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
    });
    expect(i.desiredCompletionTime).toBe('after 2');
    expect(i.callbackTime).toBeUndefined();
  });

  it('"It\'s 931 Pine Hollow Road. Sorry, 937 Pine Hollow Road."', () => {
    const i = enrich("It's 931 Pine Hollow Road. Sorry, 937 Pine Hollow Road.", 'ask_location', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber',
    });
    expect(i.serviceAddress).toBe('937 Pine Hollow Road');
  });

  it('"My name is Jason — sorry, Jason Miller."', () => {
    const i = enrich('My name is Jason — sorry, Jason Miller.', 'ask_name_reason');
    expect(i.customerName).toBe('Jason Miller');
  });
});

/* ------------------------------------------------------------------ */
/* F. CROSS-STAGE CORRECTIONS                                          */
/* ------------------------------------------------------------------ */
describe('F. cross-stage corrections', () => {
  it('address correction during callback stage does not touch callback', () => {
    const i = enrich('Actually, the address is 937 Pine Hollow Road.', 'ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '931 Pine Hollow Road',
      desiredCompletionTime: 'friday',
    });
    expect(i.serviceAddress).toBe('937 Pine Hollow Road');
    expect(i.callbackTime).toBeUndefined();
  });

  it('callback correction during location stage keeps location unanswered when absent', () => {
    const i = enrich('Call me after 4 instead.', 'ask_location', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber',
    });
    expect((i.callbackTime || '').toLowerCase()).toContain('after 4');
    expect(i.serviceAddress).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* G. MULTI-FIELD NATURAL ANSWERS                                      */
/* ------------------------------------------------------------------ */
describe('G. multi-field natural answers', () => {
  it('full volunteer utterance populates all fields', () => {
    const i = enrich(
      "I'm Laura Bennett. I need someone to repair my water heater at 408 Cedar Ridge Lane. It's leaking around the bottom. Tomorrow would be great, and call me anytime after four.",
      'ask_name_reason'
    );
    expect(i.customerName).toBe('Laura Bennett');
    expect((i.serviceRequested || '').toLowerCase()).toContain('water heater');
    expect(i.serviceAddress).toBe('408 Cedar Ridge Lane');
    expect((i.desiredCompletionTime || '').toLowerCase()).toContain('tomorrow');
    expect((i.callbackTime || '').toLowerCase()).toContain('anytime');
    expect(i.issueDescription || '').toBeTruthy();
  });

  it('resolver skips satisfied stages after full volunteer', () => {
    const i = enrich(
      "I'm Laura Bennett. I need someone to repair my water heater at 408 Cedar Ridge Lane. It's leaking around the bottom. Tomorrow would be great, and call me anytime after four.",
      'ask_name_reason'
    );
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('complete');
  });
});

/* ------------------------------------------------------------------ */
/* H. OUT-OF-ORDER INFORMATION                                         */
/* ------------------------------------------------------------------ */
describe('H. out-of-order information', () => {
  it('location before service still captures service', () => {
    const i = enrich("I'm at 937 Pine Hollow Road and I need a plumber.", 'ask_name_reason', {
      customerName: 'Laura Bennett',
    });
    expect(i.serviceAddress).toBe('937 Pine Hollow Road');
    expect((i.serviceRequested || '').toLowerCase()).toContain('plumber');
  });

  it('callback volunteered during reason capture', () => {
    const i = enrich('I need a plumber, and call me after 5.', 'ask_name_reason', {
      customerName: 'Laura Bennett',
    });
    expect((i.serviceRequested || '').toLowerCase()).toContain('plumber');
    expect((i.callbackTime || '').toLowerCase()).toContain('after 5');
  });

  it('completion volunteered during location answer is captured without losing location', () => {
    const i = enrich('937 Pine Hollow Road, and I need it done Friday.', 'ask_location', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber',
    });
    expect(i.serviceAddress).toBe('937 Pine Hollow Road');
    expect((i.desiredCompletionTime || '').toLowerCase()).toContain('friday');
  });
});

/* ------------------------------------------------------------------ */
/* I. NEGATION / CONTRADICTION                                         */
/* ------------------------------------------------------------------ */
describe('I. negation and contradiction', () => {
  it('"It\'s not 931, it\'s 937, Pine Hollow Road" resolves to 937', () => {
    const i = enrich("It's not 931, it's 937, Pine Hollow Road.", 'ask_location', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '931 Pine Hollow Road',
    });
    expect(i.serviceAddress).toBeTruthy();
    expect(i.serviceAddress).toContain('937');
    expect(i.serviceAddress).not.toContain('931');
  });

  it('"Don\'t call me in the morning; call after 3" resolves to after 3', () => {
    const i = enrich("Don't call me in the morning; call after 3.", 'ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'friday', callbackTime: 'morning',
    });
    expect((i.callbackTime || '').toLowerCase()).toContain('after 3');
    expect(i.callbackTime).not.toBe('morning');
  });

  it('"I don\'t need it tomorrow, next week is fine" resolves to next week', () => {
    const i = enrich("I don't need it tomorrow, next week is fine.", 'ask_completion_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'tomorrow',
    });
    expect((i.desiredCompletionTime || '').toLowerCase()).toContain('next week');
    expect(i.desiredCompletionTime).not.toBe('tomorrow');
  });
});

/* ------------------------------------------------------------------ */
/* J. INCIDENT HISTORY VS FUTURE TIMING                                */
/* ------------------------------------------------------------------ */
describe('J. incident history is not future timing', () => {
  it.each([
    'It stopped working yesterday morning.',
    'The pipe started leaking Friday.',
    'The furnace shut off around 2 PM.',
    'The cables snapped this morning.',
    'It began leaking last night.',
  ])('"%s" does not set callback or completion', (t) => {
    const i = enrich(t, 'ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'furnace repair', serviceAddress: '1 Main St',
      desiredCompletionTime: 'tomorrow',
    });
    expect(i.callbackTime).toBeUndefined();
    expect(i.desiredCompletionTime).toBe('tomorrow');
  });
});

/* ------------------------------------------------------------------ */
/* K. VAGUE BUT VALID TIMING                                           */
/* ------------------------------------------------------------------ */
describe('K. vague but valid completion timing', () => {
  it.each([
    ['No rush.', 'No rush'],
    ["Whenever you're available.", 'Whenever available'],
    ['As soon as you can.', 'As soon as possible'],
    ['Whenever works.', 'Whenever'],
    ['Later this week.', 'Later this week'],
  ])('"%s" → "%s"', (t, expected) => {
    const i = enrich(t, 'ask_completion_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
    });
    expect(i.desiredCompletionTime).toBe(expected);
  });

  it('"Anytime this week." produces a valid semantic completion', () => {
    const i = enrich('Anytime this week.', 'ask_completion_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
    });
    expect(i.desiredCompletionTime).toBeTruthy();
    expect(isValidCompletionTime(i.desiredCompletionTime || '')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* L. CALLBACK VARIATIONS                                              */
/* ------------------------------------------------------------------ */
describe('L. callback variations', () => {
  const cb = (t: string) =>
    enrich(t, 'ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'friday',
    }).callbackTime;

  it.each([
    ['Anytime.', 'anytime'],
    ['After lunch.', 'after lunch'],
    ['After 4.', 'after 4'],
    ['Whenever is easiest.', 'anytime'],
    ['Morning is fine.', 'morning'],
    ['Not before noon.', 'not before noon'],
    ['Later in the afternoon.', 'afternoon'],
  ])('"%s" → "%s"', (t, expected) => {
    expect((cb(t) || '').toLowerCase()).toContain(expected);
  });

  it('"Anytime tomorrow." keeps both qualifiers', () => {
    const v = cb('Anytime tomorrow.');
    expect(v).toBeTruthy();
    expect(v!.toLowerCase()).toContain('anytime');
    expect(v!.toLowerCase()).toContain('tomorrow');
  });
});

/* ------------------------------------------------------------------ */
/* M. REFUSAL / UNKNOWN                                                */
/* ------------------------------------------------------------------ */
describe('M. refusal and unknown semantics', () => {
  it('name refusal sets flag and clears name', () => {
    const i = enrich("I'd rather not give my name.", 'ask_name_reason');
    expect(i.nameRefused).toBe(true);
    expect(i.customerName || '').toBe('');
    expect(i.serviceRequested).toBeUndefined();
  });

  it('"I don\'t know the address yet" is not stored as an address', () => {
    const i = enrich("I don't know the address yet.", 'ask_location', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber',
    });
    expect(i.serviceAddress || '').not.toContain("don't know");
    expect(i.serviceAddress).toBeUndefined();
  });

  it('"I\'m not sure when." does not satisfy completion', () => {
    const i = enrich("I'm not sure when.", 'ask_completion_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
    });
    expect(i.desiredCompletionTime).toBeUndefined();
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('ask_completion_time');
  });

  it('"Just call whenever." yields canonical callback', () => {
    const i = enrich('Just call whenever.', 'ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'friday',
    });
    expect((i.callbackTime || '').toLowerCase()).toBe('anytime');
  });
});

/* ------------------------------------------------------------------ */
/* O. REPEATED ANSWERS                                                 */
/* ------------------------------------------------------------------ */
describe('O. repeated answers do not duplicate', () => {
  it('repeating the callback answer keeps a single value', () => {
    const i = intake('ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'friday',
    });
    enrichIntakeFromTranscript('Call me after 3.', i, 'ask_callback_time');
    enrichIntakeFromTranscript('Call me after 3.', i, 'ask_callback_time');
    expect(i.callbackTime).toBe('after 3');
  });
});

/* ------------------------------------------------------------------ */
/* P. CORRECTION + NEW FIELD IN ONE TURN                               */
/* ------------------------------------------------------------------ */
describe('P. correction plus new field in one turn', () => {
  it('"Actually it\'s 937 Pine Hollow Road, and call me after 2."', () => {
    const i = enrich("Actually it's 937 Pine Hollow Road, and call me after 2.", 'ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '931 Pine Hollow Road',
      desiredCompletionTime: 'friday',
    });
    expect(i.serviceAddress).toBe('937 Pine Hollow Road');
    expect((i.callbackTime || '').toLowerCase()).toContain('after 2');
  });
});

/* ------------------------------------------------------------------ */
/* FIELD OWNERSHIP INVARIANT                                           */
/* ------------------------------------------------------------------ */
describe('field ownership invariant', () => {
  it.each([
    ['Use 500 Pine Street.', 'callbackTime'],
    ['Call me tomorrow afternoon.', 'serviceAddress'],
    ['The spring snapped this morning.', 'callbackTime'],
    ['Hello, still there?', 'desiredCompletionTime'],
    ['My name is Daniel Harris.', 'serviceRequested'],
  ])('"%s" must not land in %s', (t, forbiddenField) => {
    const i = enrich(t, 'ask_name_reason', { customerName: 'Existing Name' });
    expect(i[forbiddenField]).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* CORRECTION OWNERSHIP - multi-clause                                 */
/* ------------------------------------------------------------------ */
describe('correction ownership - multi-clause tail', () => {
  it('"Actually, use 937 Pine Hollow Road instead, and make that Friday, and call me after 3."', () => {
    const i = enrich(
      'Actually, use 937 Pine Hollow Road instead, and make that Friday, and call me after 3.',
      'ask_callback_time',
      {
        customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '931 Pine Hollow Road',
        desiredCompletionTime: 'tomorrow', callbackTime: 'morning',
      }
    );
    expect(i.serviceAddress).toBe('937 Pine Hollow Road');
    expect((i.desiredCompletionTime || '').toLowerCase()).toBe('friday');
    expect((i.callbackTime || '').toLowerCase()).toContain('after 3');
  });
});

/* ------------------------------------------------------------------ */
/* REASON / DETAILS SEMANTIC SPLIT                                     */
/* ------------------------------------------------------------------ */
describe('reason/details semantic split', () => {
  it('furnace: concise reason + preserved details', () => {
    const split = splitServiceAndDetails(
      "I need someone to repair my furnace. It's rattling and shuts off before the house warms up."
    );
    expect(split.reason.toLowerCase()).toContain('furnace');
    expect(split.details).toBeTruthy();
    expect(split.details!.toLowerCase()).toContain('rattling');
    expect(split.details!.toLowerCase()).toContain('shuts off');
  });

  it('sink: reason + damage details', () => {
    const split = splitServiceAndDetails(
      'My sink is leaking under the cabinet and it\'s starting to damage the wood.'
    );
    expect(split.reason.toLowerCase()).toContain('sink');
    expect(split.details || '').toBeTruthy();
  });

  it('bare service has no details', () => {
    const split = splitServiceAndDetails('I need a plumber.');
    expect(split.reason.toLowerCase()).toContain('plumber');
    expect(split.details).toBeNull();
  });

  it('garage door: details retain spring AND stuck-door facts', () => {
    const i = enrich(
      'I need someone to fix my broken garage door because the spring snapped and the door is stuck halfway.',
      'ask_name_reason',
      { customerName: 'Alex Rivera' }
    );
    expect((i.serviceRequested || '').toLowerCase()).toContain('garage door');
    const d = (i.issueDescription || '').toLowerCase();
    expect(d).toContain('spring');
    expect(d).toContain('stuck');
  });
});

/* ------------------------------------------------------------------ */
/* SERVICE CORRECTION                                                  */
/* ------------------------------------------------------------------ */
describe('service correction', () => {
  it('"Actually, it\'s not the toilet. The leak is under the kitchen sink."', () => {
    const i = enrich("Actually, it's not the toilet. The leak is under the kitchen sink.", 'ask_location', {
      customerName: 'Alex Rivera', serviceRequested: 'toilet repair',
    });
    expect((i.serviceRequested || '').toLowerCase()).not.toContain('toilet');
    expect((i.serviceRequested || '').toLowerCase()).toContain('sink');
  });
});

/* ------------------------------------------------------------------ */
/* SEMANTIC VALIDITY                                                   */
/* ------------------------------------------------------------------ */
describe('semantic validity - nonemptiness is not validity', () => {
  it.each(['hello', 'okay', 'yeah', 'one second', 'can you hear me', 'whatever'])(
    '"%s" does not satisfy completion', (t) => {
      expect(isValidCompletionTime(t)).toBe(false);
    }
  );

  it.each(['Anytime', 'No rush', 'Whenever available', 'Tomorrow', 'After 4', 'Downtown Pittsburgh', 'At my house'])(
    '"%s" remains a usable answer where the field allows it', (t) => {
      const usable =
        isValidCompletionTime(t) || isValidCallbackTime(t) || isValidServiceAddress(t);
      expect(usable).toBe(true);
    }
  );
});

/* ------------------------------------------------------------------ */
/* ADDRESS SAFETY                                                      */
/* ------------------------------------------------------------------ */
describe('address safety', () => {
  it.each([
    'Nine thirty-seven Pine Hollow Road',
    '937 Pine Hollow Road',
    '937 Pine Hollow Road in Bethel Park',
    '937 Pine Hollow Road, Bethel Park',
  ])('"%s" is a usable address at ask_location', (t) => {
    const i = enrich(t, 'ask_location', { customerName: 'Alex Rivera', serviceRequested: 'plumber' });
    expect(i.serviceAddress).toBeTruthy();
    expect(i.serviceAddress).toContain('Pine Hollow');
  });
});

/* ------------------------------------------------------------------ */
/* NAME SAFETY                                                         */
/* ------------------------------------------------------------------ */
describe('name safety', () => {
  it.each([
    "Siobhan O'Connor",
    'Jean-Luc Martin',
    'Jo Li',
    'Mary Ann Smith',
    'DeAndre Williams',
    'Test',
  ])('"%s" remains a valid name', (n) => {
    expect(isValidCustomerName(n)).toBe(true);
  });

  it.each([
    'Like old times',
    'Can you hear me',
    'One second',
    'Hold on',
    "That's fine",
  ])('"%s" is rejected as a name', (n) => {
    expect(isValidCustomerName(n)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* STAGE-LOCAL RECOVERY                                                */
/* ------------------------------------------------------------------ */
describe('stage-local recovery', () => {
  it('meta answer then valid answer at callback stage', () => {
    const i = intake('ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'friday',
    });
    enrichIntakeFromTranscript('Can you hear me?', i, 'ask_callback_time');
    expect(i.callbackTime).toBeUndefined();
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('ask_callback_time');
    enrichIntakeFromTranscript('Tomorrow after two.', i, 'ask_callback_time');
    expect(i.callbackTime).toBeTruthy();
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('complete');
  });
});

/* ------------------------------------------------------------------ */
/* LOOP / DEADLOCK                                                     */
/* ------------------------------------------------------------------ */
describe('loop and deadlock prevention', () => {
  it('invalid answer then valid answer reaches completion', () => {
    const i = intake('ask_completion_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
    });
    enrichIntakeFromTranscript('hello', i, 'ask_completion_time');
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('ask_completion_time');
    enrichIntakeFromTranscript('Tomorrow.', i, 'ask_completion_time');
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('ask_callback_time');
  });

  it('name refusal then refusal-consistent progression never re-asks name', () => {
    const i = intake('ask_name_reason');
    enrichIntakeFromTranscript("I'd rather not give my name.", i, 'ask_name_reason');
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('ask_request');
  });
});

/* ------------------------------------------------------------------ */
/* DETAILS OPTIONAL                                                    */
/* ------------------------------------------------------------------ */
describe('details remain optional', () => {
  it('completes with no issueDescription', () => {
    const i = intake('ask_callback_time', {
      customerName: 'Alex Rivera', serviceRequested: 'plumber', serviceAddress: '1 Main St',
      desiredCompletionTime: 'friday',
    });
    enrichIntakeFromTranscript('Call me after 3.', i, 'ask_callback_time');
    expect(resolveNextSimpleModeStage(i, 'onsite')).toBe('complete');
    expect(i.issueDescription).toBeUndefined();
  });
});
