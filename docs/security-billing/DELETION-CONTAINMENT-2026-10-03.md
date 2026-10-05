# Temporary account deletion containment — October 3

Self-service account deletion is disabled for this release while coordination with in-flight uploads and billing remains unresolved. This supersedes the enabled deletion behavior described in the October 2 follow-up; it does not claim those concurrency concerns are solved.

The source-level `ACCOUNT_DELETION_ENABLED = false` switch is shared by the API and Settings. Unauthenticated requests still return 401. Authenticated requests, including repeated requests from stale clients, return 503 with `account_deletion_unavailable` before inventory, cancellation, Storage access, session deletion or Auth deletion. Settings displays temporary unavailability and hides deletion controls; subscription and billing management remain usable. Re-enabling requires a source change and verification, rather than a runtime environment change.

Validation on the isolated repair branch:

- Full offline application/browser suite: 83 passed, 0 failed; 28 opt-in database scenarios skipped. The new route fixture checks authentication, stale-client retries, the explicit error and zero cleanup calls. The new Chromium fixture renders the actual Settings page, verifies the honest unavailable message and absence of destructive controls, then opens the mocked billing portal without deletion calls, success messages or sign-out.
- Full TypeScript passed. ESLint: 0 errors and the same 13 existing warnings.
- Production build passed with an empty inherited environment, synthetic credentials and telemetry disabled. No local environment files or production credentials were loaded.
- Existing cleanup unit fixtures use a test-only module override to retain coverage of the dormant cleanup implementation. No live cleanup, deletion-race scenarios or independent security review ran.

The branch-specific Vercel deployment guard is unchanged. SQL is unchanged; atomic-cutover SHA256 remains `191ea84507bb2dca1e816f682ae85569a2b9f9607b3e957496e5a9cd521e5165`.

This source change only protects deployments containing it. The atomic cutover still must retire or block historical deployment URLs and drain incompatible server writers before production admission resumes. No production migration or deployment is part of this containment change.
