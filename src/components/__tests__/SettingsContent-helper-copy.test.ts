import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/SettingsContent.tsx', 'utf8')

describe('Out-of-office / after-hours helper copy', () => {
  it('uses conditional placeholder wording instead of implying values are always inserted', () => {
    expect(content).toContain('If your message includes placeholders like')
    expect(content).toContain("{'{{business_name}}'}")
    expect(content).toContain("{'{{return_date}}'}")
    expect(content).toContain("we'll fill them in automatically when the message is sent")
  })
})
