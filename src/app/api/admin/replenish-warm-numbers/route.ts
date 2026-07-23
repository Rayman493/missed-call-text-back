import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { isAdmin } from '@/lib/admin';
import { ensureWarmNumberMinimum, getWarmNumberStats } from '@/lib/warm-number-manager';

export const dynamic = 'force-dynamic';

/**
 * Admin endpoint to manually trigger warm number replenishment
 * Protected by Supabase auth + ADMIN_USER_IDS
 */
export async function POST(request: NextRequest) {
  try {
    // Get user from session
    const cookieStore = await cookies();
    console.log('[SUPABASE SSR SOURCE] admin-replenish-warm-numbers')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.log('[Admin Replenish] Starting manual warm number replenishment by user:', user.id);

    // Get stats before replenishment
    const statsBefore = await getWarmNumberStats();
    console.log('[Admin Replenish] Stats before:', statsBefore);

    // Trigger replenishment
    const result = await ensureWarmNumberMinimum();

    // Get stats after replenishment
    const statsAfter = await getWarmNumberStats();
    console.log('[Admin Replenish] Stats after:', statsAfter);

    return NextResponse.json({
      success: true,
      available_before: result.availableBefore,
      numbers_added: result.numbersAdded,
      available_after: result.availableAfter,
      stats_before: statsBefore,
      stats_after: statsAfter,
    });
  } catch (error: any) {
    console.error('[Admin Replenish] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to view current warm number stats (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin secret
    const adminSecret = request.headers.get('x-admin-secret');
    const expectedSecret = process.env.ADMIN_SECRET;

    if (!adminSecret || adminSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const stats = await getWarmNumberStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('[Admin Replenish GET] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
