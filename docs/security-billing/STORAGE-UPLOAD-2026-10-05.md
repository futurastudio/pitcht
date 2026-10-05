# Free-plan recording uploads

The client previously accepted videos up to 200 MiB while Pitcht's Free Supabase plan supports at most 50 MiB per file. Storage restriction errors were replaced with generic retry/connection messages, so users could not tell why saving failed.

New uploads are capped at 52,428,800 bytes. Supabase's [Free upload documentation](https://supabase.com/docs/guides/storage/uploads/file-limits) calls this "50 MB"; its [dashboard implementation](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Storage/StorageSettings/StorageSettings.constants.ts) defines the ceiling as `50 * 1024 * 1024`. Videos continue to upload directly to Supabase, which enforces its global and bucket limits server-side. This patch does not proxy uploads or change hosted settings. A lower configured service limit remains authoritative and produces an actionable size-rejection message.

The client rejects one byte over the ceiling before any Storage request. Explicit Storage HTTP 402 and size rejections retain a specific recovery message rather than suggesting a network problem or a subscription upgrade. Restriction handling is confined to direct Supabase recording-persistence calls; Pitcht's own practice-quota and billing responses retain their existing behavior. Ambiguous failures still reconcile the same immutable object before reporting success, and a restriction encountered during reconciliation is also surfaced accurately.

The recording context preserves the captured bytes and passes the failure to the interview page. The page keeps that message beside the existing Retry saving and Download original controls, clears it on retry/discard, and does not advance or invoke transcription for an unsaved answer. Previously saved transcripts and feedback are unchanged. The existing 4 MiB transcription limit now uses the same constant on the client and API route.

Provider HTTP 402 responses from the recording save's direct Supabase session/reconciliation reads also display the restriction message. Ownership checks remain mandatory; a service restriction is no longer presented as a reason to sign in again. This does not add a global availability probe or alter authentication, session creation, billing, or existing saved-media playback.

Focused regressions exercise the video boundary, Storage error shapes, uncertain uploads, retained media/earlier feedback, rendered recovery controls and the direct transcription API byte boundary. Existing save-reconciliation, download-original and retry tests remain in the verification set.

Local verification: `npx tsc --noEmit` passed; lint completed with zero errors and 13 warnings; the full offline suite passed 92 tests, with 29 opt-in database/PostgREST checks skipped. Database test socket variables were explicitly unset, and no live provider/database write was used for verification. Existing isolated browser fixtures passed. SQL and migrations are unchanged.

No retention policy, deletion, media export, paid plan, migration, production configuration or deployment is included. This corrects client validation and failure messaging; it does not remove the provider's existing organization-wide storage restriction. Automatic deployment remains disabled for `codex/security-billing-repair`, and prior release gates remain in force.
