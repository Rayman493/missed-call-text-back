import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { phoneNumbersMatch } from '@/lib/phone-utils';

interface ContactImport {
  name: string | null;
  phoneNormalized: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get user from auth header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    const body = await request.json();
    const { contacts } = body;

    if (!contacts || !Array.isArray(contacts)) {
      return NextResponse.json({ error: 'Contacts array is required' }, { status: 400 });
    }

    const contactsToImport: ContactImport[] = contacts.filter((c: any) => c.selected && c.status === 'valid');

    if (contactsToImport.length === 0) {
      return NextResponse.json({ error: 'No valid contacts selected for import' }, { status: 400 });
    }

    // Get existing contacts for duplicate check
    const { data: existingContacts } = await supabase
      .from('ignored_contacts')
      .select('phone_number')
      .eq('business_id', business.id);

    const existingPhones = existingContacts?.map(c => c.phone_number) || [];

    // Filter out duplicates before inserting
    const contactsToInsert = contactsToImport.filter(contact => {
      return !existingPhones.some(existingPhone => 
        phoneNumbersMatch(contact.phoneNormalized, existingPhone)
      );
    });

    if (contactsToInsert.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: contactsToImport.length,
        total: contactsToImport.length
      });
    }

    // Insert contacts in batches
    const batchSize = 100;
    let importedCount = 0;

    for (let i = 0; i < contactsToInsert.length; i += batchSize) {
      const batch = contactsToInsert.slice(i, i + batchSize);
      
      const inserts = batch.map(contact => ({
        business_id: business.id,
        phone_number: contact.phoneNormalized,
        label: contact.name || null,
        reason: contact.name ? `Imported: ${contact.name}` : 'Imported contact'
      }));

      const { error: insertError } = await supabase
        .from('ignored_contacts')
        .insert(inserts);

      if (insertError) {
        console.error('Error inserting batch of ignored contacts:', insertError);
        // Continue with next batch even if one fails
      } else {
        importedCount += inserts.length;
      }
    }

    const skippedCount = contactsToImport.length - importedCount;

    return NextResponse.json({
      imported: importedCount,
      skipped: skippedCount,
      total: contactsToImport.length
    });
  } catch (error) {
    console.error('Error in POST /api/ignored-contacts/import/execute:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
