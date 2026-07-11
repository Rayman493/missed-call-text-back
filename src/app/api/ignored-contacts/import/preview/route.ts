import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { normalizePhoneNumber, phoneNumbersMatch } from '@/lib/phone-utils';

interface ContactPreview {
  name: string | null;
  phoneOriginal: string;
  phoneNormalized: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason: string;
  selected: boolean;
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
    const { type, content } = body;

    if (!type || !content) {
      return NextResponse.json({ error: 'Type and content are required' }, { status: 400 });
    }

    let contacts: ContactPreview[] = [];

    if (type === 'paste') {
      // Parse pasted content (one per line, optional "Name, Phone" format)
      const lines = content.split('\n').filter((line: string) => line.trim());
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Check if line has comma for "Name, Phone" format
        if (trimmed.includes(',')) {
          const parts = trimmed.split(',');
          if (parts.length >= 2) {
            const name = parts[0].trim();
            const phone = parts.slice(1).join(',').trim();
            contacts.push(parseContact(name, phone));
          }
        } else {
          // Just a phone number
          contacts.push(parseContact(null, trimmed));
        }
      }
    } else if (type === 'csv') {
      // Parse CSV content
      const lines = content.split('\n').filter((line: string) => line.trim());
      
      if (lines.length < 2) {
        return NextResponse.json({ error: 'CSV must have at least a header and one data row' }, { status: 400 });
      }

      // Parse header to find phone column
      const header = lines[0].split(',').map((h: string) => h.trim().toLowerCase());
      const phoneIndex = header.findIndex((h: string) => 
        h === 'phone' || h === 'phone_number' || h === 'mobile' || h === 'number' || h === 'telephone'
      );
      const nameIndex = header.findIndex((h: string) => 
        h === 'name' || h === 'first_name' || h === 'given_name' || h === 'label'
      );

      if (phoneIndex === -1) {
        return NextResponse.json({ error: 'CSV must contain a phone column (phone, phone_number, mobile, number, or telephone)' }, { status: 400 });
      }

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const phone = values[phoneIndex]?.trim() || '';
        const name = nameIndex !== -1 ? values[nameIndex]?.trim() || null : null;
        
        if (phone) {
          contacts.push(parseContact(name, phone));
        }
      }
    } else {
      return NextResponse.json({ error: 'Invalid type. Must be "paste" or "csv"' }, { status: 400 });
    }

    // Check for duplicates in database
    const validContacts = contacts.filter(c => c.status === 'valid');
    
    if (validContacts.length > 0) {
      const { data: existingContacts } = await supabase
        .from('ignored_contacts')
        .select('phone_number')
        .eq('business_id', business.id);

      const existingPhones = existingContacts?.map(c => c.phone_number) || [];

      // Mark duplicates using phoneNumbersMatch for better matching
      contacts = contacts.map(contact => {
        if (contact.status === 'valid') {
          const isDuplicate = existingPhones.some(existingPhone => 
            phoneNumbersMatch(contact.phoneNormalized, existingPhone)
          );
          if (isDuplicate) {
            return {
              ...contact,
              status: 'duplicate' as const,
              reason: 'Already in ignored contacts',
              selected: false
            };
          }
        }
        return contact;
      });
    }

    // Check for duplicate entries within the import itself
    const seenPhones = new Set<string>();
    contacts = contacts.map(contact => {
      if (contact.status === 'valid') {
        if (seenPhones.has(contact.phoneNormalized)) {
          return {
            ...contact,
            status: 'duplicate' as const,
            reason: 'Duplicate in import',
            selected: false
          };
        }
        seenPhones.add(contact.phoneNormalized);
      }
      return contact;
    });

    const validCount = contacts.filter(c => c.status === 'valid').length;
    const duplicateCount = contacts.filter(c => c.status === 'duplicate').length;
    const invalidCount = contacts.filter(c => c.status === 'invalid').length;

    return NextResponse.json({
      contacts,
      stats: {
        valid: validCount,
        duplicate: duplicateCount,
        invalid: invalidCount,
        total: contacts.length
      }
    });
  } catch (error) {
    console.error('Error in POST /api/ignored-contacts/import/preview:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function parseContact(name: string | null, phone: string): ContactPreview {
  const trimmedPhone = phone.trim();
  const normalized = normalizePhoneNumber(trimmedPhone);
  
  // Validate phone number (must be 10 digits for US, or reasonable international length)
  const isValid = normalized.length === 10 || (normalized.length >= 10 && normalized.length <= 15);
  
  return {
    name,
    phoneOriginal: trimmedPhone,
    phoneNormalized: normalized,
    status: isValid ? 'valid' : 'invalid',
    reason: isValid ? '' : 'Invalid phone number format',
    selected: isValid
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}
