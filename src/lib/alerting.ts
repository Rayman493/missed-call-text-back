/**
 * Operational Alerting System for ReplyFlow
 * Durable database-backed alerting for critical system failures
 */

import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

export interface AlertCondition {
  id: string
  name: string
  severity: 'critical' | 'degraded'
  check: () => Promise<boolean>
  description: string
}

export interface AlertState {
  lastAlertedAt?: string
  alertCount: number
  resolvedAt?: string
}

// Type for operational_alerts table (will be created by migration)
interface OperationalAlert {
  id: string
  condition_id: string
  severity: 'critical' | 'degraded'
  current_state: 'active' | 'resolved'
  first_triggered_at: string
  last_triggered_at: string
  last_alerted_at: string | null
  alert_count_for_period: number
  alert_count_period_start: string
  resolved_at: string | null
  latest_summary: string | null
  created_at: string
  updated_at: string
}

export class AlertManager {
  private resend: Resend | null = null
  private supabase: ReturnType<typeof createClient>

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY)
    }
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  /**
   * Atomically claim permission to send an alert
   * Uses PostgreSQL function to enforce cooldown and rate limits at database level
   * Returns true if this execution successfully claimed the alert and should send email
   */
  private async claimAlert(conditionId: string, severity: 'critical' | 'degraded'): Promise<boolean> {
    try {
      // Call the PostgreSQL RPC function
      const { data, error } = await (this.supabase as any).rpc('claim_operational_alert', {
        p_condition_id: conditionId,
        p_severity: severity,
      })

      if (error) {
        console.error('[AlertManager] Failed to claim alert:', error)
        return false
      }

      const result = data as { claimed: boolean; alert_count?: number; last_alerted_at?: string; error?: string }
      
      if (result.error) {
        console.error('[AlertManager] Alert claim error:', result.error)
        return false
      }

      return result.claimed === true
    } catch (error) {
      console.error('[AlertManager] Exception claiming alert:', error)
      return false
    }
  }

  /**
   * Update triggered timestamp without claiming alert (for ongoing failures)
   */
  private async updateTriggeredTime(conditionId: string, severity: 'critical' | 'degraded', summary: string) {
    try {
      // @ts-ignore - operational_alerts table not in generated types yet (will be added via migration)
      await (this.supabase as any)
        .from('operational_alerts')
        .update({
          current_state: 'active',
          severity,
          last_triggered_at: new Date().toISOString(),
          latest_summary: summary,
        })
        .eq('condition_id', conditionId)
    } catch (error) {
      console.error('[AlertManager] Failed to update triggered time:', error)
    }
  }

  /**
   * Mark a condition as resolved in database
   */
  async markResolved(conditionId: string) {
    try {
      // @ts-ignore - operational_alerts table not in generated types yet (will be added via migration)
      await (this.supabase as any)
        .from('operational_alerts')
        .update({
          current_state: 'resolved',
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('condition_id', conditionId)
    } catch (error) {
      console.error('[AlertManager] Failed to mark condition resolved:', error)
    }
  }

  /**
   * Send an alert email
   */
  private async sendAlertEmail(condition: AlertCondition, details: string) {
    if (!this.resend) {
      console.warn('[AlertManager] Resend not configured, skipping email alert')
      return
    }

    const alertEmail = process.env.FOUNDER_ALERT_EMAIL
    if (!alertEmail) {
      console.warn('[AlertManager] FOUNDER_ALERT_EMAIL not configured, skipping email alert')
      return
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL
    if (!fromEmail) {
      console.warn('[AlertManager] RESEND_FROM_EMAIL not configured, skipping email alert')
      return
    }

    try {
      await this.resend.emails.send({
        from: fromEmail,
        to: alertEmail,
        subject: `[${condition.severity.toUpperCase()}] ReplyFlow Alert: ${condition.name}`,
        html: `
          <h2>${condition.name}</h2>
          <p><strong>Severity:</strong> ${condition.severity.toUpperCase()}</p>
          <p><strong>Description:</strong> ${condition.description}</p>
          <p><strong>Details:</strong></p>
          <pre>${details}</pre>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          <hr>
          <p><small>This is an automated alert from ReplyFlow System Health monitoring.</small></p>
        `,
      })
      console.log(`[AlertManager] Alert email sent for condition: ${condition.id}`)
    } catch (error) {
      console.error('[AlertManager] Failed to send alert email:', error)
    }
  }

  /**
   * Check a condition and send alert if needed
   */
  async checkAndAlert(condition: AlertCondition, details: string = '') {
    try {
      const isFailing = await condition.check()

      if (isFailing) {
        // Try to atomically claim permission to send alert
        const claimed = await this.claimAlert(condition.id, condition.severity)
        
        if (claimed) {
          // This execution successfully claimed the alert - send email
          await this.sendAlertEmail(condition, details)
        } else {
          // Another execution already claimed or limits reached - just update triggered time
          await this.updateTriggeredTime(condition.id, condition.severity, details)
        }
      } else {
        // Condition is healthy, mark as resolved
        await this.markResolved(condition.id)
      }
    } catch (error) {
      console.error(`[AlertManager] Error checking condition ${condition.id}:`, error)
    }
  }

  /**
   * Get current alert states (for debugging)
   */
  async getAlertStates(): Promise<Record<string, AlertState>> {
    try {
      const { data, error } = await this.supabase
        .from('operational_alerts' as any)
        .select('condition_id, last_alerted_at, alert_count_for_period, resolved_at')

      if (error || !data) {
        return {}
      }

      const states: Record<string, AlertState> = {}
      for (const record of data) {
        states[(record as any).condition_id] = {
          lastAlertedAt: (record as any).last_alerted_at || undefined,
          alertCount: (record as any).alert_count_for_period || 0,
          resolvedAt: (record as any).resolved_at || undefined,
        }
      }
      return states
    } catch (error) {
      console.error('[AlertManager] Failed to get alert states:', error)
      return {}
    }
  }
}

// Singleton instance
export const alertManager = new AlertManager()
