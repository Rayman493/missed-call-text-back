/**
 * Centralized Admin Audit Logging
 *
 * This helper provides a consistent way to log all sensitive admin actions
 * to the admin_audit_logs table for auditability and compliance.
 *
 * Audit logging is non-blocking and never prevents the main operation from completing.
 */

import { createClient } from '@supabase/supabase-js';

export interface AdminAuditLogParams {
  actingAdminUserId: string;
  actingAdminEmail: string;
  action: string;
  targetBusinessId?: string;
  targetUserId?: string;
  resourceIdentifiers?: Record<string, string>;
  beforeState?: Record<string, any>;
  afterState?: Record<string, any>;
  metadata?: Record<string, any>;
  correlationId?: string;
}

/**
 * Log an admin action to the admin_audit_logs table.
 *
 * This function is designed to be non-blocking:
 * - Uses try/catch to prevent audit failures from blocking operations
 * - Returns void so callers don't need to await it (can fire-and-forget)
 * - Logs to console if database write fails
 *
 * @param params - Audit log parameters
 */
export async function logAdminAction(params: AdminAuditLogParams): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { error } = await supabase
      .from('admin_audit_logs')
      .insert({
        acting_admin_user_id: params.actingAdminUserId,
        acting_admin_email: params.actingAdminEmail,
        action: params.action,
        target_business_id: params.targetBusinessId || null,
        target_user_id: params.targetUserId || null,
        resource_identifiers: params.resourceIdentifiers || null,
        before_state: params.beforeState || null,
        after_state: params.afterState || null,
        metadata: params.metadata || null,
        correlation_id: params.correlationId || null,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[ADMIN AUDIT] Failed to log action:', {
        action: params.action,
        error: error.message,
        params,
      });
    } else {
      console.log('[ADMIN AUDIT] Action logged:', {
        action: params.action,
        actingAdminEmail: params.actingAdminEmail,
        targetBusinessId: params.targetBusinessId,
      });
    }
  } catch (error) {
    console.error('[ADMIN AUDIT] Exception while logging action:', {
      action: params.action,
      error: error instanceof Error ? error.message : String(error),
      params,
    });
  }
}

/**
 * Helper to extract user email from Supabase user object
 */
export function getUserEmail(user: { email?: string | null }): string {
  return user.email || 'unknown@example.com';
}