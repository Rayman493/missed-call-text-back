import { describe, it, expect } from 'vitest'

describe('Payment SMS Formatting', () => {
  const businessName = 'Test Business'
  const amount = '100.00'
  const paymentUrl = 'https://example.com/pay/abc123'

  function formatPaymentSms(businessName: string, amount: string, description: string | undefined, paymentUrl: string): string {
    return `${businessName} has sent you a payment request of $${amount}.${description ? `

Reason: "${description}"` : ''}

Pay securely here:
${paymentUrl}

If you have questions, reply to this message.`
  }

  describe('Test 1: Normal reason', () => {
    it('should wrap normal reason in quotes', () => {
      const description = 'Grandmaster by 10PM'
      const sms = formatPaymentSms(businessName, amount, description, paymentUrl)

      expect(sms).toContain('Reason: "Grandmaster by 10PM"')
      expect(sms).toContain('$100.00')
      expect(sms).toContain(paymentUrl)
    })
  })

  describe('Test 2: Reason with punctuation', () => {
    it('should preserve punctuation in reason', () => {
      const description = '50% deposit - due before starting!'
      const sms = formatPaymentSms(businessName, amount, description, paymentUrl)

      expect(sms).toContain('Reason: "50% deposit - due before starting!"')
      expect(sms).toContain('%')
      expect(sms).toContain('-')
      expect(sms).toContain('!')
    })
  })

  describe('Test 3: Long customer-entered reason', () => {
    it('should preserve full reason without breaking formatting', () => {
      const description = 'This is a very long description that the customer entered to explain what the payment is for in great detail'
      const sms = formatPaymentSms(businessName, amount, description, paymentUrl)

      expect(sms).toContain('Reason: "This is a very long description that the customer entered to explain what the payment is for in great detail"')
      expect(sms).toContain(paymentUrl)
    })
  })

  describe('Test 4: Missing reason', () => {
    it('should handle missing reason gracefully without empty quotes', () => {
      const sms = formatPaymentSms(businessName, amount, undefined, paymentUrl)

      expect(sms).not.toContain('Reason:')
      expect(sms).not.toContain('""')
      expect(sms).toContain('$100.00')
      expect(sms).toContain(paymentUrl)
    })

    it('should handle empty string reason gracefully without empty quotes', () => {
      const sms = formatPaymentSms(businessName, amount, '', paymentUrl)

      expect(sms).not.toContain('Reason:')
      expect(sms).not.toContain('""')
      expect(sms).toContain('$100.00')
      expect(sms).toContain(paymentUrl)
    })
  })

  describe('Test 5: Payment link remains unchanged', () => {
    it('should preserve payment link exactly as provided', () => {
      const description = 'Service payment'
      const sms = formatPaymentSms(businessName, amount, description, paymentUrl)

      expect(sms).toContain(paymentUrl)
      expect(sms).toContain('Pay securely here:')
    })
  })

  describe('Test 6: Edge cases', () => {
    it('should handle reason with quotes', () => {
      const description = 'Service "as discussed"'
      const sms = formatPaymentSms(businessName, amount, description, paymentUrl)

      expect(sms).toContain('Reason: "Service "as discussed""')
    })

    it('should handle reason with newlines', () => {
      const description = 'Line 1\nLine 2'
      const sms = formatPaymentSms(businessName, amount, description, paymentUrl)

      expect(sms).toContain('Reason: "Line 1\nLine 2"')
    })

    it('should handle reason with special characters', () => {
      const description = 'Deposit for $500 service @ location'
      const sms = formatPaymentSms(businessName, amount, description, paymentUrl)

      expect(sms).toContain('Reason: "Deposit for $500 service @ location"')
    })
  })
})