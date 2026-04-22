You are helping build a production-minded MVP for a missed-call text-back SaaS for local businesses.

Project requirements:
- Use Next.js 14 with TypeScript and Tailwind.
- Use the App Router.
- Keep the architecture simple and easy to deploy.
- Prefer server-side logic in API routes under app/api.
- Use Supabase for database access.
- Use Twilio webhooks for missed calls and incoming SMS.
- Do not add unnecessary abstractions, state libraries, or complex auth.
- Build only the MVP features needed for first paying customers.

MVP features:
1. Accept Twilio voice status webhook for missed calls.
2. Automatically send SMS to the caller after a missed call.
3. Accept Twilio incoming SMS webhook.
4. Store businesses, leads, messages, and call events in Supabase.
5. Show a simple dashboard listing leads and latest messages.
6. Include setup docs in README.md.
7. Use environment variables for all secrets.
8. Add basic validation and useful logs.
9. Make the UI clean, minimal, and mobile-friendly.
10. Keep code readable for a solo founder.

Coding preferences:
- Use server components by default unless client components are necessary.
- Use async/await.
- Use zod for request validation where useful.
- Use a small db helper layer.
- Create clear TypeScript types.
- Add comments only where they clarify non-obvious logic.
- When changing multiple files, explain what was changed and why.