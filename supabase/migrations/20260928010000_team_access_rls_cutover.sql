-- ============================================================================
-- Team Access V1 — RLS Cutover
-- Rewrites business-data authorization from
--   "business owned by auth.uid()"  (businesses.user_id)
-- to
--   "business has a membership for auth.uid()"  (business_memberships)
--
-- Semantics preserved:
--   - Owner keeps identical access via their backfilled 'owner' membership.
--   - Members gain the same normal operational access.
--   - Service-role policies are untouched.
--   - User-scoped tables (push_devices, notification_delivery_attempts,
--     beta_feedback) are intentionally unchanged.
--   - Diagnostic/service tables (stripe_webhook_events, offboarding_tracking,
--     operational_alerts, ai_call_failures, admin_audit_logs, system_sms,
--     twilio_number_cleanup_runs, provisioning_recovery_runs,
--     call_pipeline_classifications, ai_summary_sms_claims) are unchanged.
--   - The stale owner_id policy on payment_requests is corrected here.
-- Idempotent: drop policy if exists + create.
-- ============================================================================

-- businesses
drop policy if exists "Users can view their own business" on public.businesses;
create policy "Users can view their own business"
  on public.businesses
  for select
  using (id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update their own business" on public.businesses;
create policy "Users can update their own business"
  on public.businesses
  for update
  using (id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- leads
drop policy if exists "Users can view leads for their businesses" on public.leads;
create policy "Users can view leads for their businesses"
  on public.leads
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert leads for their businesses" on public.leads;
create policy "Users can insert leads for their businesses"
  on public.leads
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update leads for their businesses" on public.leads;
create policy "Users can update leads for their businesses"
  on public.leads
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- conversations
drop policy if exists "Users can view conversations for their businesses" on public.conversations;
create policy "Users can view conversations for their businesses"
  on public.conversations
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert conversations for their businesses" on public.conversations;
create policy "Users can insert conversations for their businesses"
  on public.conversations
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update conversations for their businesses" on public.conversations;
create policy "Users can update conversations for their businesses"
  on public.conversations
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- messages
drop policy if exists "Users can view messages for their businesses" on public.messages;
create policy "Users can view messages for their businesses"
  on public.messages
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert messages for their businesses" on public.messages;
create policy "Users can insert messages for their businesses"
  on public.messages
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update messages for their businesses" on public.messages;
create policy "Users can update messages for their businesses"
  on public.messages
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- ai_call_records
drop policy if exists "Users can view AI call records for their businesses" on public.ai_call_records;
create policy "Users can view AI call records for their businesses"
  on public.ai_call_records
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert AI call records for their businesses" on public.ai_call_records;
create policy "Users can insert AI call records for their businesses"
  on public.ai_call_records
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update AI call records for their businesses" on public.ai_call_records;
create policy "Users can update AI call records for their businesses"
  on public.ai_call_records
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can delete AI call records for their businesses" on public.ai_call_records;
create policy "Users can delete AI call records for their businesses"
  on public.ai_call_records
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- ai_call_sessions
drop policy if exists "Users can view AI sessions for their businesses" on public.ai_call_sessions;
create policy "Users can view AI sessions for their businesses"
  on public.ai_call_sessions
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert AI sessions for their businesses" on public.ai_call_sessions;
create policy "Users can insert AI sessions for their businesses"
  on public.ai_call_sessions
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update AI sessions for their businesses" on public.ai_call_sessions;
create policy "Users can update AI sessions for their businesses"
  on public.ai_call_sessions
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can delete AI sessions for their businesses" on public.ai_call_sessions;
create policy "Users can delete AI sessions for their businesses"
  on public.ai_call_sessions
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- voicemail_recordings
drop policy if exists "Users can view voicemail recordings for their businesses" on public.voicemail_recordings;
create policy "Users can view voicemail recordings for their businesses"
  on public.voicemail_recordings
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert voicemail recordings for their businesses" on public.voicemail_recordings;
create policy "Users can insert voicemail recordings for their businesses"
  on public.voicemail_recordings
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update voicemail recordings for their businesses" on public.voicemail_recordings;
create policy "Users can update voicemail recordings for their businesses"
  on public.voicemail_recordings
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can delete voicemail recordings for their businesses" on public.voicemail_recordings;
create policy "Users can delete voicemail recordings for their businesses"
  on public.voicemail_recordings
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- notifications
drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
  on public.notifications
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can mark their own notifications as read" on public.notifications;
create policy "Users can mark their own notifications as read"
  on public.notifications
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can create notifications for their businesses" on public.notifications;
create policy "Users can create notifications for their businesses"
  on public.notifications
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- calendar_integrations
drop policy if exists "Users can view their own calendar integrations" on public.calendar_integrations;
create policy "Users can view their own calendar integrations"
  on public.calendar_integrations
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert their own calendar integrations" on public.calendar_integrations;
create policy "Users can insert their own calendar integrations"
  on public.calendar_integrations
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update their own calendar integrations" on public.calendar_integrations;
create policy "Users can update their own calendar integrations"
  on public.calendar_integrations
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can delete their own calendar integrations" on public.calendar_integrations;
create policy "Users can delete their own calendar integrations"
  on public.calendar_integrations
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- tasks
drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
  on public.tasks
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own"
  on public.tasks
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
  on public.tasks
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own"
  on public.tasks
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- jobs
drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own"
  on public.jobs
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own"
  on public.jobs
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "jobs_update_own" on public.jobs;
create policy "jobs_update_own"
  on public.jobs
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_delete_own"
  on public.jobs
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- job_time_entries
drop policy if exists "job_time_entries_select_own" on public.job_time_entries;
create policy "job_time_entries_select_own"
  on public.job_time_entries
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "job_time_entries_insert_own" on public.job_time_entries;
create policy "job_time_entries_insert_own"
  on public.job_time_entries
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "job_time_entries_update_own" on public.job_time_entries;
create policy "job_time_entries_update_own"
  on public.job_time_entries
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "job_time_entries_delete_own" on public.job_time_entries;
create policy "job_time_entries_delete_own"
  on public.job_time_entries
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- billing_documents
drop policy if exists "billing_documents_select_own" on public.billing_documents;
create policy "billing_documents_select_own"
  on public.billing_documents
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "billing_documents_insert_own" on public.billing_documents;
create policy "billing_documents_insert_own"
  on public.billing_documents
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "billing_documents_update_own" on public.billing_documents;
create policy "billing_documents_update_own"
  on public.billing_documents
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "billing_documents_delete_own" on public.billing_documents;
create policy "billing_documents_delete_own"
  on public.billing_documents
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- billing_document_counters
drop policy if exists "billing_document_counters_select_own" on public.billing_document_counters;
create policy "billing_document_counters_select_own"
  on public.billing_document_counters
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- payment_receipts
drop policy if exists "Users can view receipts for their businesses" on public.payment_receipts;
create policy "Users can view receipts for their businesses"
  on public.payment_receipts
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can create receipts for their businesses" on public.payment_receipts;
create policy "Users can create receipts for their businesses"
  on public.payment_receipts
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- payment_requests
drop policy if exists "Users can view payment requests for their businesses" on public.payment_requests;
create policy "Users can view payment requests for their businesses"
  on public.payment_requests
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can create payment requests for their businesses" on public.payment_requests;
create policy "Users can create payment requests for their businesses"
  on public.payment_requests
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "System can update payment requests" on public.payment_requests;
create policy "System can update payment requests"
  on public.payment_requests
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- ignored_contacts
drop policy if exists "Users can view own ignored contacts" on public.ignored_contacts;
create policy "Users can view own ignored contacts"
  on public.ignored_contacts
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert own ignored contacts" on public.ignored_contacts;
create policy "Users can insert own ignored contacts"
  on public.ignored_contacts
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update own ignored contacts" on public.ignored_contacts;
create policy "Users can update own ignored contacts"
  on public.ignored_contacts
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can delete own ignored contacts" on public.ignored_contacts;
create policy "Users can delete own ignored contacts"
  on public.ignored_contacts
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- personal_voicemails
drop policy if exists "Users can view their own personal voicemails" on public.personal_voicemails;
create policy "Users can view their own personal voicemails"
  on public.personal_voicemails
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert their own personal voicemails" on public.personal_voicemails;
create policy "Users can insert their own personal voicemails"
  on public.personal_voicemails
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update their own personal voicemails" on public.personal_voicemails;
create policy "Users can update their own personal voicemails"
  on public.personal_voicemails
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can delete their own personal voicemails" on public.personal_voicemails;
create policy "Users can delete their own personal voicemails"
  on public.personal_voicemails
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- booking_settings
drop policy if exists "Users can view own booking settings" on public.booking_settings;
create policy "Users can view own booking settings"
  on public.booking_settings
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert own booking settings" on public.booking_settings;
create policy "Users can insert own booking settings"
  on public.booking_settings
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update own booking settings" on public.booking_settings;
create policy "Users can update own booking settings"
  on public.booking_settings
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- booking_hours
drop policy if exists "Users can view own booking hours" on public.booking_hours;
create policy "Users can view own booking hours"
  on public.booking_hours
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert own booking hours" on public.booking_hours;
create policy "Users can insert own booking hours"
  on public.booking_hours
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update own booking hours" on public.booking_hours;
create policy "Users can update own booking hours"
  on public.booking_hours
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can delete own booking hours" on public.booking_hours;
create policy "Users can delete own booking hours"
  on public.booking_hours
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- booking_exceptions
drop policy if exists "Users can view own booking exceptions" on public.booking_exceptions;
create policy "Users can view own booking exceptions"
  on public.booking_exceptions
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can insert own booking exceptions" on public.booking_exceptions;
create policy "Users can insert own booking exceptions"
  on public.booking_exceptions
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update own booking exceptions" on public.booking_exceptions;
create policy "Users can update own booking exceptions"
  on public.booking_exceptions
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can delete own booking exceptions" on public.booking_exceptions;
create policy "Users can delete own booking exceptions"
  on public.booking_exceptions
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- booking_requests
drop policy if exists "Users can view own booking requests" on public.booking_requests;
create policy "Users can view own booking requests"
  on public.booking_requests
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "Users can update own booking requests" on public.booking_requests;
create policy "Users can update own booking requests"
  on public.booking_requests
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- booking_request_events
drop policy if exists "Users can view own booking request events" on public.booking_request_events;
create policy "Users can view own booking request events"
  on public.booking_request_events
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));


-- message_media (access via messages -> leads -> business membership)
drop policy if exists "Users can view media for their business messages" on public.message_media;
create policy "Users can view media for their business messages"
  on public.message_media
  for select
  using (
    exists (
      select 1 from public.messages
      where messages.id = message_media.message_id
      and exists (
        select 1 from public.leads
        where leads.id = messages.lead_id
        and leads.business_id in (
          select business_id from public.business_memberships where user_id = auth.uid()
        )
      )
    )
  );
drop policy if exists "Users can insert media for their business messages" on public.message_media;
create policy "Users can insert media for their business messages"
  on public.message_media
  for insert
  with check (
    exists (
      select 1 from public.messages
      where messages.id = message_media.message_id
      and exists (
        select 1 from public.leads
        where leads.id = messages.lead_id
        and leads.business_id in (
          select business_id from public.business_memberships where user_id = auth.uid()
        )
      )
    )
  );
drop policy if exists "Users can update media for their business messages" on public.message_media;
create policy "Users can update media for their business messages"
  on public.message_media
  for update
  using (
    exists (
      select 1 from public.messages
      where messages.id = message_media.message_id
      and exists (
        select 1 from public.leads
        where leads.id = messages.lead_id
        and leads.business_id in (
          select business_id from public.business_memberships where user_id = auth.uid()
        )
      )
    )
  )
  with check (
    exists (
      select 1 from public.messages
      where messages.id = message_media.message_id
      and exists (
        select 1 from public.leads
        where leads.id = messages.lead_id
        and leads.business_id in (
          select business_id from public.business_memberships where user_id = auth.uid()
        )
      )
    )
  );

-- meeting_records (EXISTS-join form)
drop policy if exists meeting_records_select_policy on public.meeting_records;
create policy meeting_records_select_policy
  on public.meeting_records
  for select
  using (
    exists (
      select 1 from public.business_memberships bm
      where bm.business_id = meeting_records.business_id
        and bm.user_id = auth.uid()
    )
  );
drop policy if exists meeting_records_insert_policy on public.meeting_records;
create policy meeting_records_insert_policy
  on public.meeting_records
  for insert
  with check (
    exists (
      select 1 from public.business_memberships bm
      where bm.business_id = meeting_records.business_id
        and bm.user_id = auth.uid()
    )
  );
drop policy if exists meeting_records_update_policy on public.meeting_records;
create policy meeting_records_update_policy
  on public.meeting_records
  for update
  using (
    exists (
      select 1 from public.business_memberships bm
      where bm.business_id = meeting_records.business_id
        and bm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.business_memberships bm
      where bm.business_id = meeting_records.business_id
        and bm.user_id = auth.uid()
    )
  );

-- billing_document_items (access inherited through parent document's business)
drop policy if exists "billing_document_items_select_own" on public.billing_document_items;
create policy "billing_document_items_select_own"
  on public.billing_document_items
  for select
  using (
    document_id in (
      select bd.id from public.billing_documents bd
      where bd.business_id in (select business_id from public.business_memberships where user_id = auth.uid())
    )
  );
drop policy if exists "billing_document_items_insert_own" on public.billing_document_items;
create policy "billing_document_items_insert_own"
  on public.billing_document_items
  for insert
  with check (
    document_id in (
      select bd.id from public.billing_documents bd
      where bd.business_id in (select business_id from public.business_memberships where user_id = auth.uid())
    )
  );
drop policy if exists "billing_document_items_update_own" on public.billing_document_items;
create policy "billing_document_items_update_own"
  on public.billing_document_items
  for update
  using (
    document_id in (
      select bd.id from public.billing_documents bd
      where bd.business_id in (select business_id from public.business_memberships where user_id = auth.uid())
    )
  )
  with check (
    document_id in (
      select bd.id from public.billing_documents bd
      where bd.business_id in (select business_id from public.business_memberships where user_id = auth.uid())
    )
  );
drop policy if exists "billing_document_items_delete_own" on public.billing_document_items;
create policy "billing_document_items_delete_own"
  on public.billing_document_items
  for delete
  using (
    document_id in (
      select bd.id from public.billing_documents bd
      where bd.business_id in (select business_id from public.business_memberships where user_id = auth.uid())
    )
  );

-- storage.objects: business-logos write policies (public read policy unchanged)
drop policy if exists "business_logos_insert_own" on storage.objects;
create policy "business_logos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (
      select business_id::text from public.business_memberships where user_id = auth.uid()
    )
  );
drop policy if exists "business_logos_update_own" on storage.objects;
create policy "business_logos_update_own"
  on storage.objects for update
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (
      select business_id::text from public.business_memberships where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (
      select business_id::text from public.business_memberships where user_id = auth.uid()
    )
  );
drop policy if exists "business_logos_delete_own" on storage.objects;
create policy "business_logos_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] in (
      select business_id::text from public.business_memberships where user_id = auth.uid()
    )
  );

-- ============================================================================
-- Tables whose live policies were created outside migration history
-- (follow_ups, follow_up_jobs, call_events, twilio_numbers).
-- Membership policies are added additively; any pre-existing owner-scoped
-- policies remain as harmless duplicates (policies OR together). Best-effort
-- drops cover the conventional *_own names if they happen to exist.
-- ============================================================================
-- follow_ups
drop policy if exists "follow_ups_select_own" on public.follow_ups;
create policy "follow_ups_select_own"
  on public.follow_ups
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "follow_ups_insert_own" on public.follow_ups;
create policy "follow_ups_insert_own"
  on public.follow_ups
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "follow_ups_update_own" on public.follow_ups;
create policy "follow_ups_update_own"
  on public.follow_ups
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "follow_ups_delete_own" on public.follow_ups;
create policy "follow_ups_delete_own"
  on public.follow_ups
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- follow_up_jobs
drop policy if exists "follow_up_jobs_select_own" on public.follow_up_jobs;
create policy "follow_up_jobs_select_own"
  on public.follow_up_jobs
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "follow_up_jobs_insert_own" on public.follow_up_jobs;
create policy "follow_up_jobs_insert_own"
  on public.follow_up_jobs
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "follow_up_jobs_update_own" on public.follow_up_jobs;
create policy "follow_up_jobs_update_own"
  on public.follow_up_jobs
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "follow_up_jobs_delete_own" on public.follow_up_jobs;
create policy "follow_up_jobs_delete_own"
  on public.follow_up_jobs
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- call_events
drop policy if exists "call_events_select_own" on public.call_events;
create policy "call_events_select_own"
  on public.call_events
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "call_events_insert_own" on public.call_events;
create policy "call_events_insert_own"
  on public.call_events
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "call_events_update_own" on public.call_events;
create policy "call_events_update_own"
  on public.call_events
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "call_events_delete_own" on public.call_events;
create policy "call_events_delete_own"
  on public.call_events
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- twilio_numbers
drop policy if exists "twilio_numbers_select_own" on public.twilio_numbers;
create policy "twilio_numbers_select_own"
  on public.twilio_numbers
  for select
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "twilio_numbers_insert_own" on public.twilio_numbers;
create policy "twilio_numbers_insert_own"
  on public.twilio_numbers
  for insert
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "twilio_numbers_update_own" on public.twilio_numbers;
create policy "twilio_numbers_update_own"
  on public.twilio_numbers
  for update
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()))
  with check (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));
drop policy if exists "twilio_numbers_delete_own" on public.twilio_numbers;
create policy "twilio_numbers_delete_own"
  on public.twilio_numbers
  for delete
  using (business_id in (select business_id from public.business_memberships where user_id = auth.uid()));

-- ============================================================================
-- Owner-only column guard on businesses
--
-- Members gain row-level UPDATE on businesses for normal operational settings
-- (name, hours, automation, out-of-office, payment links, logo, etc.).
-- Ownership / telephony / Stripe / subscription / forwarding / address columns
-- remain owner-only. RLS cannot scope columns, so a BEFORE UPDATE trigger
-- rejects member writes that touch an owner-only column.
--
-- Exemptions:
--   - service_role writes (server routes, webhooks, cron) are unrestricted.
--   - the business's owner membership may change any column.
-- ============================================================================
create or replace function public.enforce_business_owner_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Server-side writes (service_role, anon key not carrying a user, triggers)
  -- are unrestricted. Only authenticated end-user writes are checked.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  -- The business owner may change any column on their own business.
  if exists (
    select 1 from public.business_memberships
    where business_id = new.id
      and user_id = auth.uid()
      and role = 'owner'
  ) then
    return new;
  end if;

  -- Member write: allowed only when no owner-only column changes.
  if new.id is distinct from old.id
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at
    -- telephony / provisioning lifecycle
    or new.business_phone_number is distinct from old.business_phone_number
    or new.business_phone_changed_at is distinct from old.business_phone_changed_at
    or new.business_phone_carrier is distinct from old.business_phone_carrier
    or new.phone_carrier is distinct from old.phone_carrier
    or new.carrier is distinct from old.carrier
    or new.forwarding_phone_number is distinct from old.forwarding_phone_number
    or new.twilio_phone_number is distinct from old.twilio_phone_number
    or new.twilio_phone_number_sid is distinct from old.twilio_phone_number_sid
    or new.twilio_messaging_service_sid is distinct from old.twilio_messaging_service_sid
    or new.twilio_subaccount_sid is distinct from old.twilio_subaccount_sid
    or new.twilio_auth_token is distinct from old.twilio_auth_token
    or new.assigned_twilio_number_id is distinct from old.assigned_twilio_number_id
    or new.twilio_release_at is distinct from old.twilio_release_at
    or new.twilio_release_grace_days is distinct from old.twilio_release_grace_days
    or new.twilio_release_reason is distinct from old.twilio_release_reason
    or new.twilio_release_status is distinct from old.twilio_release_status
    or new.twilio_released_at is distinct from old.twilio_released_at
    or new.provisioned_at is distinct from old.provisioned_at
    or new.provisioning_status is distinct from old.provisioning_status
    or new.provisioning_error is distinct from old.provisioning_error
    or new.provisioning_lock_id is distinct from old.provisioning_lock_id
    or new.last_provisioning_attempt_at is distinct from old.last_provisioning_attempt_at
    or new.sender_pool_attached_at is distinct from old.sender_pool_attached_at
    or new.messaging_status is distinct from old.messaging_status
    or new.sms_type is distinct from old.sms_type
    or new.a2p_campaign_sid is distinct from old.a2p_campaign_sid
    or new.a2p_status is distinct from old.a2p_status
    or new.campaign_registered_at is distinct from old.campaign_registered_at
    -- call forwarding lifecycle
    or new.call_forwarding_enabled is distinct from old.call_forwarding_enabled
    or new.call_forwarding_status is distinct from old.call_forwarding_status
    or new.forwarding_verified is distinct from old.forwarding_verified
    or new.forwarding_verified_at is distinct from old.forwarding_verified_at
    or new.forwarding_instructions_confirmed_at is distinct from old.forwarding_instructions_confirmed_at
    or new.test_call_received_at is distinct from old.test_call_received_at
    or new.test_sms_sent_at is distinct from old.test_sms_sent_at
    or new.phone_setup_completed_at is distinct from old.phone_setup_completed_at
    -- Stripe / billing lifecycle
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.stripe_connect_account_id is distinct from old.stripe_connect_account_id
    or new.stripe_connect_status is distinct from old.stripe_connect_status
    or new.stripe_terminal_location_id is distinct from old.stripe_terminal_location_id
    or new.stripe_details_submitted is distinct from old.stripe_details_submitted
    or new.stripe_charges_enabled is distinct from old.stripe_charges_enabled
    or new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled
    or new.subscription_status is distinct from old.subscription_status
    or new.subscription_price_id is distinct from old.subscription_price_id
    or new.trial_started_at is distinct from old.trial_started_at
    or new.trial_ends_at is distinct from old.trial_ends_at
    or new.current_period_end is distinct from old.current_period_end
    or new.cancel_at is distinct from old.cancel_at
    or new.cancel_at_period_end is distinct from old.cancel_at_period_end
    or new.checkout_completed_at is distinct from old.checkout_completed_at
    or new.manual_access_enabled is distinct from old.manual_access_enabled
    or new.manual_access_expires_at is distinct from old.manual_access_expires_at
    or new.manual_access_granted_at is distinct from old.manual_access_granted_at
    or new.manual_access_granted_by is distinct from old.manual_access_granted_by
    or new.manual_access_note is distinct from old.manual_access_note
    or new.manual_access_reason is distinct from old.manual_access_reason
    or new.is_protected_account is distinct from old.is_protected_account
    or new.protected_reason is distinct from old.protected_reason
    -- onboarding / address (address drives Stripe Terminal location sync)
    or new.onboarding_status is distinct from old.onboarding_status
    or new.onboarding_step is distinct from old.onboarding_step
    or new.business_address_line1 is distinct from old.business_address_line1
    or new.business_address_line2 is distinct from old.business_address_line2
    or new.business_address_city is distinct from old.business_address_city
    or new.business_address_state is distinct from old.business_address_state
    or new.business_address_postal_code is distinct from old.business_address_postal_code
    or new.business_address_country is distinct from old.business_address_country
  then
    raise exception 'owner_only_field: only the business owner can change this field'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists businesses_enforce_owner_fields on public.businesses;
create trigger businesses_enforce_owner_fields
  before update on public.businesses
  for each row
  execute function public.enforce_business_owner_fields();

