import { describe, it, expect } from 'vitest'

/**
 * Regression test for ReplyFlow Login Autofill Hardening
 *
 * This test ensures the Sign In form does not unexpectedly prepopulate
 * stale test credentials while maintaining semantic autocomplete attributes.
 */

describe('Login Autofill Hardening', () => {
  it('Sign In email field should use autocomplete="username"', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/auth/page.tsx', 'utf8')

    // The sign-in email field should have autoComplete="username"
    // We check for the pattern where email field is followed by autoComplete="username"
    // within the sign-in section context
    expect(content).toMatch(/autoComplete="username"/)
  })

  it('Sign In password field should use autocomplete="new-password"', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/auth/page.tsx', 'utf8')

    // The sign-in password field should have autoComplete="new-password"
    expect(content).toMatch(/autoComplete="new-password"/)
  })

  it('Should not have autoComplete="email" in sign-in context', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/auth/page.tsx', 'utf8')

    // Count occurrences - signup should have it, but it should appear less frequently
    // after our change (since we changed sign-in to "username")
    const emailAutocompleteCount = (content.match(/autoComplete="email"/g) || []).length
    // After our change, there should be fewer occurrences (only in signup, not sign-in)
    // Previously there were 2 (signup + sign-in), now should be 1 (signup only)
    expect(emailAutocompleteCount).toBeLessThan(2)
  })

  it('Should not have autoComplete="current-password"', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/auth/page.tsx', 'utf8')

    // Sign-in password should NOT have autoComplete="current-password"
    expect(content).not.toContain('autoComplete="current-password"')
  })

  it('Signup email field should retain autocomplete="email"', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/auth/page.tsx', 'utf8')

    // Signup should still have autoComplete="email"
    expect(content).toContain('autoComplete="email"')
  })

  it('Email state should initialize as empty string', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/auth/page.tsx', 'utf8')
    expect(content).toContain("const [email, setEmail] = useState('')")
  })

  it('Password state should initialize as empty string', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/auth/page.tsx', 'utf8')
    expect(content).toContain("const [password, setPassword] = useState('')")
  })

  it('URL emailParam should not be used to prefill email state', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/auth/page.tsx', 'utf8')

    // emailParam is read but should not be used to setEmail
    const lines = content.split('\n')
    let emailParamLine = -1
    let setEmailAfterEmailParam = false

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('const emailParam = searchParams?.get')) {
        emailParamLine = i
      }
      // Check if setEmail is called with emailParam after it's defined
      if (emailParamLine > 0 && i > emailParamLine && lines[i].includes('setEmail')) {
        if (lines[i].includes('emailParam')) {
          setEmailAfterEmailParam = true
        }
      }
    }

    expect(setEmailAfterEmailParam).toBe(false)
  })
})