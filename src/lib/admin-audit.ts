import { supabaseAdmin } from './supabase/admin'

export interface AdminAuditLog {
  acting_admin_user_id: string
  acting_admin_email: string
  target_user_id: string
  target_email?: string
  action: string
  support_reason?: string
  old_email?: string
  new_email?: string
  success: boolean
  error_message?: string
}

/**
 * Log an admin action to the admin_audit_logs table
 * This is called by admin-only API endpoints
 */
export async function logAdminAction(auditLog: AdminAuditLog): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        acting_admin_user_id: auditLog.acting_admin_user_id,
        acting_admin_email: auditLog.acting_admin_email,
        target_user_id: auditLog.target_user_id,
        target_email: auditLog.target_email,
        action: auditLog.action,
        support_reason: auditLog.support_reason,
        old_email: auditLog.old_email,
        new_email: auditLog.new_email,
        success: auditLog.success,
        error_message: auditLog.error_message,
      })

    if (error) {
      console.error('[ADMIN AUDIT] Failed to log to database:', error)
      // Fall back to console logging if database fails
      console.log('[ADMIN AUDIT FALLBACK]', {
        ...auditLog,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    console.error('[ADMIN AUDIT] Unexpected error logging action:', error)
    // Fall back to console logging
    console.log('[ADMIN AUDIT FALLBACK]', {
      ...auditLog,
      timestamp: new Date().toISOString()
    })
  }
}