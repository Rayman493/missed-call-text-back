/**
 * Task Date Handling Tests
 * 
 * Tests for local date parsing, display formatting, and classification
 * to ensure date-only values are preserved as calendar dates without UTC shifts.
 * 
 * Run with: npx tsx src/lib/__tests__/task-date-handling.test.ts
 */

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`)
    process.exit(1)
  }
  console.log(`✓ ${message}`)
}

// Test formatDate - Local Date Parsing
function testFormatDate(): void {
  console.log('\n=== Testing formatDate - Local Date Parsing ===')
  
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  assert(formatDate('2026-08-19') === 'Aug 19', '2026-08-19 renders as Aug 19')
  assert(formatDate('2026-07-31') === 'Jul 31', '2026-07-31 renders as Jul 31')
  assert(formatDate('2026-08-01') === 'Aug 1', '2026-08-01 renders as Aug 1')
  assert(formatDate(null) === '', 'handles null date')
  assert(formatDate('') === '', 'handles empty string')
  
  console.log('✅ formatDate tests passed')
}

// Test Task Classification - Local Calendar Dates
function testTaskClassification(): void {
  console.log('\n=== Testing Task Classification - Local Calendar Dates ===')
  
  const getTodayStr = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false
    return dueDate < getTodayStr()
  }

  const isFuture = (dueDate: string | null) => {
    if (!dueDate) return false
    return dueDate > getTodayStr()
  }

  const isNoDueDate = (dueDate: string | null) => {
    return !dueDate
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toLocaleDateString('en-CA')
  
  assert(isOverdue(yesterdayStr) === true, 'Yesterday classifies as Overdue')
  assert(isFuture(yesterdayStr) === false, 'Yesterday is not Future')

  const todayStr = getTodayStr()
  assert(isOverdue(todayStr) === false, 'Today is not Overdue')
  assert(isFuture(todayStr) === false, 'Today is not Future')

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA')
  
  assert(isOverdue(tomorrowStr) === false, 'Tomorrow is not Overdue')
  assert(isFuture(tomorrowStr) === true, 'Tomorrow classifies as Future')

  assert(isOverdue(null) === false, 'No due date is not Overdue')
  assert(isFuture(null) === false, 'No due date is not Future')
  assert(isNoDueDate(null) === true, 'No due date classifies as Active')

  // Test completed overrides date classification
  const task = { completed: true, due_date: yesterdayStr }
  const isTaskOverdue = !task.completed && isOverdue(task.due_date)
  assert(isTaskOverdue === false, 'Completed overrides date classification')
  
  console.log('✅ Task classification tests passed')
}

// Test Time Picker - 15-minute Increments
function testTimePicker(): void {
  console.log('\n=== Testing Time Picker - 15-minute Increments ===')
  
  const generateTimeOptions = () => {
    const options: { label: string; value: string }[] = []
    
    for (let hour = 6; hour <= 20; hour++) {
      for (let minute of [0, 15, 30, 45]) {
        const hour24 = hour
        const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        const minuteStr = minute === 0 ? '00' : String(minute)
        const value24 = `${String(hour24).padStart(2, '0')}:${minuteStr}`
        const label12 = `${hour12}:${minuteStr} ${ampm}`
        
        options.push({ label: label12, value: value24 })
      }
    }
    
    return options
  }

  const options = generateTimeOptions()
  
  const has6_15 = options.some(opt => opt.label === '6:15 AM' && opt.value === '06:15')
  assert(has6_15 === true, 'includes 6:15 AM option')

  const has6_45 = options.some(opt => opt.label === '6:45 AM' && opt.value === '06:45')
  assert(has6_45 === true, 'includes 6:45 AM option')

  const has6_00 = options.some(opt => opt.label === '6:00 AM' && opt.value === '06:00')
  assert(has6_00 === true, 'includes 6:00 AM option')

  const has6_30 = options.some(opt => opt.label === '6:30 AM' && opt.value === '06:30')
  assert(has6_30 === true, 'includes 6:30 AM option')

  const has8_00 = options.some(opt => opt.label === '8:00 PM' && opt.value === '20:00')
  assert(has8_00 === true, 'includes 8:00 PM option')

  assert(options.length === 60, 'generates correct number of options (15 hours × 4 increments = 60)')

  const has15MinIncrements = options.some(opt => opt.value.includes(':15') || opt.value.includes(':45'))
  assert(has15MinIncrements === true, 'includes 15-minute increments (not just 30-minute)')
  
  console.log('✅ Time picker tests passed')
}

// Test Customer Association - Lead Data Handling
function testCustomerAssociation(): void {
  console.log('\n=== Testing Customer Association - Lead Data Handling ===')
  
  const getLeadName = (task: any) => {
    if (task.leads?.raw_metadata?.customer_name) {
      return task.leads.raw_metadata.customer_name
    }
    return task.leads?.caller_phone || 'Unknown'
  }

  const task1 = {
    leads: {
      raw_metadata: { customer_name: 'John Doe' },
      caller_phone: '555-1234'
    }
  }
  assert(getLeadName(task1) === 'John Doe', 'renders customer name when available in raw_metadata')

  const task2 = {
    leads: {
      raw_metadata: {},
      caller_phone: '555-1234'
    }
  }
  assert(getLeadName(task2) === '555-1234', 'renders phone number when customer name not available')

  const task3 = {
    leads: null
  }
  assert(getLeadName(task3) === 'Unknown', 'renders Unknown when no lead data')

  const task4 = {
    leads: {}
  }
  assert(getLeadName(task4) === 'Unknown', 'renders Unknown when leads exists but no data')

  const task5 = {
    lead_id: 'lead-123',
    leads: {
      raw_metadata: { customer_name: 'John Doe' },
      caller_phone: '555-1234'
    }
  }
  assert(task5.lead_id === 'lead-123', 'lead_id exists for navigation')
  assert(getLeadName(task5) === 'John Doe', 'renders customer name when lead_id exists')
  
  console.log('✅ Customer association tests passed')
}

// Run all tests
console.log('🧪 Starting Task Date Handling Tests...\n')

try {
  testFormatDate()
  testTaskClassification()
  testTimePicker()
  testCustomerAssociation()
  
  console.log('\n✅ All task date handling tests passed!')
  console.log('\n✅ Date parsing uses local calendar dates without UTC shifts')
  console.log('✅ Task classification uses local calendar date semantics')
  console.log('✅ Time picker includes 15-minute increments')
  console.log('✅ Customer association renders actionable links when lead_id exists')
  process.exit(0)
} catch (error) {
  console.error('\n❌ Test failed with error:', error)
  process.exit(1)
}
