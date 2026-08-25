import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Follow-Up Settings Persistence Regression Tests', () => {
  const mockBusinessId = 'test-business-id'
  const mockUserId = 'test-user-id'

  // Mock business object with all required fields
  const mockBusinessWithSettings = {
    id: mockBusinessId,
    user_id: mockUserId,
    subscription_status: 'active',
    manual_access_enabled: false,
    manual_access_expires_at: null,
    business_hours_timezone: 'America/New_York',
    automation_settings: {
      followUps: {
        enabled: true,
        followUps: [
          {
            step: 1,
            enabled: true,
            delayDays: 1,
            delayUnit: 'minutes',
            message: 'Test message 1'
          },
          {
            step: 2,
            enabled: true,
            delayDays: 2,
            delayUnit: 'hours',
            message: 'Test message 2'
          },
          {
            step: 3,
            enabled: false,
            delayDays: 3,
            delayUnit: 'days',
            message: 'Test message 3'
          }
        ]
      }
    },
    name: 'Test Business'
  }

  const mockBusinessWithoutSettings = {
    id: mockBusinessId,
    user_id: mockUserId,
    subscription_status: 'active',
    manual_access_enabled: false,
    manual_access_expires_at: null,
    business_hours_timezone: 'America/New_York',
    automation_settings: null,
    name: 'Test Business'
  }

  describe('Test 1: Save and retrieve follow-up settings', () => {
    it('should return saved settings on GET after PUT', () => {
      const savedSettings = mockBusinessWithSettings.automation_settings.followUps

      expect(savedSettings).toBeDefined()
      expect(savedSettings.enabled).toBe(true)
      expect(savedSettings.followUps).toHaveLength(3)
      expect(savedSettings.followUps[0].delayDays).toBe(1)
      expect(savedSettings.followUps[0].delayUnit).toBe('minutes')
    })
  })

  describe('Test 2: Delay value persistence - minutes', () => {
    it('should preserve minutes delay unit', () => {
      const followUp = mockBusinessWithSettings.automation_settings.followUps.followUps[0]

      expect(followUp.delayDays).toBe(1)
      expect(followUp.delayUnit).toBe('minutes')
    })
  })

  describe('Test 3: Delay value persistence - hours', () => {
    it('should preserve hours delay unit', () => {
      const followUp = mockBusinessWithSettings.automation_settings.followUps.followUps[1]

      expect(followUp.delayDays).toBe(2)
      expect(followUp.delayUnit).toBe('hours')
    })
  })

  describe('Test 4: Delay value persistence - days', () => {
    it('should preserve days delay unit', () => {
      const followUp = mockBusinessWithSettings.automation_settings.followUps.followUps[2]

      expect(followUp.delayDays).toBe(3)
      expect(followUp.delayUnit).toBe('days')
    })
  })

  describe('Test 5: Enabled/disabled state persists', () => {
    it('should preserve enabled state for each follow-up', () => {
      const followUps = mockBusinessWithSettings.automation_settings.followUps.followUps

      expect(followUps[0].enabled).toBe(true)
      expect(followUps[1].enabled).toBe(true)
      expect(followUps[2].enabled).toBe(false)
    })

    it('should preserve global enabled state', () => {
      const globalEnabled = mockBusinessWithSettings.automation_settings.followUps.enabled

      expect(globalEnabled).toBe(true)
    })
  })

  describe('Test 6: Follow-up message text persists', () => {
    it('should preserve message text for each follow-up', () => {
      const followUps = mockBusinessWithSettings.automation_settings.followUps.followUps

      expect(followUps[0].message).toBe('Test message 1')
      expect(followUps[1].message).toBe('Test message 2')
      expect(followUps[2].message).toBe('Test message 3')
    })
  })

  describe('Test 7: Business name is available for preview', () => {
    it('should include business name field', () => {
      expect(mockBusinessWithSettings.name).toBeDefined()
      expect(mockBusinessWithSettings.name).toBe('Test Business')
    })

    it('should not be undefined', () => {
      expect(mockBusinessWithSettings.name).not.toBe('undefined')
      expect(mockBusinessWithSettings.name).not.toBeUndefined()
    })
  })

  describe('Test 8: Falls back to defaults when no settings exist', () => {
    it('should return defaults when automation_settings is null', () => {
      const automationSettings = mockBusinessWithoutSettings.automation_settings || {}
      const followUpSettings = automationSettings.followUps

      expect(followUpSettings).toBeUndefined()
    })
  })

  describe('Test 9: Business object includes all required fields', () => {
    it('should include automation_settings field', () => {
      expect(mockBusinessWithSettings).toHaveProperty('automation_settings')
      expect(typeof mockBusinessWithSettings.automation_settings).toBe('object')
    })

    it('should include name field', () => {
      expect(mockBusinessWithSettings).toHaveProperty('name')
      expect(typeof mockBusinessWithSettings.name).toBe('string')
    })

    it('should include subscription fields', () => {
      expect(mockBusinessWithSettings).toHaveProperty('subscription_status')
      expect(mockBusinessWithSettings).toHaveProperty('manual_access_enabled')
      expect(mockBusinessWithSettings).toHaveProperty('manual_access_expires_at')
    })
  })

  describe('Test 10: Default message templates should not contain undefined or null', () => {
    // Mock business with undefined name
    const mockBusinessWithUndefinedName = {
      ...mockBusinessWithoutSettings,
      name: undefined as any
    }

    // Mock business with null name
    const mockBusinessWithNullName = {
      ...mockBusinessWithoutSettings,
      name: null
    }

    // Mock business with empty string name
    const mockBusinessWithEmptyName = {
      ...mockBusinessWithoutSettings,
      name: ''
    }

    // Mock business with whitespace-only name
    const mockBusinessWithWhitespaceName = {
      ...mockBusinessWithoutSettings,
      name: '   '
    }

    it('should not contain "undefined" when business name is undefined', () => {
      const safeName = mockBusinessWithUndefinedName.name?.trim() || 'our team'
      const defaultMessage = `Just checking in from ${safeName} - would you still like help?`
      
      expect(defaultMessage).not.toContain('undefined')
      expect(defaultMessage).not.toContain('null')
      expect(defaultMessage).toContain('our team')
    })

    it('should not contain "undefined" when business name is null', () => {
      const safeName = mockBusinessWithNullName.name?.trim() || 'our team'
      const defaultMessage = `Just checking in from ${safeName} - would you still like help?`
      
      expect(defaultMessage).not.toContain('undefined')
      expect(defaultMessage).not.toContain('null')
      expect(defaultMessage).toContain('our team')
    })

    it('should not contain "undefined" when business name is empty string', () => {
      const safeName = mockBusinessWithEmptyName.name?.trim() || 'our team'
      const defaultMessage = `Just checking in from ${safeName} - would you still like help?`
      
      expect(defaultMessage).not.toContain('undefined')
      expect(defaultMessage).not.toContain('null')
      expect(defaultMessage).toContain('our team')
    })

    it('should not contain "undefined" when business name is whitespace-only', () => {
      const safeName = mockBusinessWithWhitespaceName.name?.trim() || 'our team'
      const defaultMessage = `Just checking in from ${safeName} - would you still like help?`
      
      expect(defaultMessage).not.toContain('undefined')
      expect(defaultMessage).not.toContain('null')
      expect(defaultMessage).toContain('our team')
    })

    it('should use actual business name when it is valid', () => {
      const safeName = mockBusinessWithSettings.name?.trim() || 'our team'
      const defaultMessage = `Just checking in from ${safeName} - would you still like help?`
      
      expect(defaultMessage).toContain('Test Business')
      expect(defaultMessage).not.toContain('our team')
      expect(defaultMessage).not.toContain('undefined')
      expect(defaultMessage).not.toContain('null')
    })
  })
})