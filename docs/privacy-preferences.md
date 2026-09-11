# Privacy preferences

Version `2026-09-11.1` is defined in `lib/privacy.ts` and explained at `/privacy`.
The notice checkbox records acknowledgement, not blanket consent. Media consent
is optional and starts unchecked. Existing accounts have no inferred consent.

Signup records metadata once through an auth.users INSERT trigger, including
when email confirmation means there is no initial session. Subsequent metadata
updates and login do not replay consent. Account changes append events with
server-generated timestamps. No authenticated client may edit/delete history.

`privacy_preferences` exposes the latest event per user/kind with invoker RLS.
Only the owner and administrators can read events. Administrators cannot write
another user's consent. The protected players.is_admin flag cannot be assigned
or changed by client roles; service-role/database administration remains possible.

Organizers consult the expandable privacy panel on their tournament page. It
refreshes every 30 seconds and on focus. This is an in-platform display, not an
email notification. A refusal or withdrawal does not block registration.

## Deployment and checks

Schema: `supabase/sql/privacy_preferences.sql`, applied through Supabase migration
`privacy_preferences_and_consent_history` before publishing the frontend.

Database checks: `supabase/tests/privacy_preferences.sql`; all fixtures roll back.
Checks cover signup, no default consent, withdrawal, cross-user access, immutable
history/timestamps, anonymous access, administrator access, role escalation and
metadata replay. Browser checks: `tests/privacy-ui.cjs` with isolated API fixtures;
set PLAYWRIGHT_MODULE if Playwright is supplied outside the project. Start the
production build on port 3100. No real email/account is used by these checks.

TypeScript, new-file ESLint, production build and mobile layout were checked.
Existing Supabase advisor warnings concern old public functions' search paths,
existing SECURITY DEFINER execute grants and leaked-password protection; the
new privacy objects do not appear in those findings. These wider issues are
outside this change. The /privacy page describes these platform choices; it
does not replace the organizer's full institutional privacy documentation.
