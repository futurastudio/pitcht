/**
 * Outcome Email Helper
 *
 * Sends a "how did your interview go?" email 3 days after a Pitcht session.
 * Uses the same raw-fetch Resend pattern as notify-signup/route.ts.
 *
 * Honors RESEND_DRY_RUN=true: logs payload to console and returns without sending.
 */

export interface SendOutcomeEmailParams {
  userEmail: string;
  sessionId: string;
  sessionType: 'job-interview' | 'internship-interview' | 'presentation';
  token: string;
  recordedAt: Date;
}

function getSessionLabel(sessionType: SendOutcomeEmailParams['sessionType']): string {
  switch (sessionType) {
    case 'job-interview':
      return 'a job interview';
    case 'internship-interview':
      return 'your internship interview';
    case 'presentation':
      return 'a presentation';
  }
}

function getSubject(sessionType: SendOutcomeEmailParams['sessionType']): string {
  if (sessionType === 'presentation') {
    return 'How did your presentation go?';
  }
  return 'How did your interview go?';
}

function buildOutcomeEmailHtml(params: SendOutcomeEmailParams): string {
  const { token, sessionType } = params;
  const sessionLabel = getSessionLabel(sessionType);
  const baseUrl = `https://app.pitcht.us/outcome/${token}`;

  const offerUrl = `${baseUrl}?response=offer`;
  const nextRoundUrl = `${baseUrl}?response=next_round`;
  const rejectedUrl = `${baseUrl}?response=rejected`;
  const noResponseUrl = `${baseUrl}?response=no_response`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${getSubject(sessionType)}</title>
</head>
<body style="margin:0; padding:0; background:#0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;">
  <tr>
    <td align="center" style="padding: 40px 20px;">
      <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px; width:100%; background:#111111; border-radius:16px; border:1px solid #1a1a1a;">
        <tr>
          <td style="padding: 48px 40px 24px;">
            <h1 style="margin:0 0 16px; font-size:26px; font-weight:700; color:#ffffff; letter-spacing:-0.5px;">${getSubject(sessionType)}</h1>
            <p style="margin:0 0 20px; font-size:16px; line-height:1.6; color:#a1a1a1;">
              Three days ago you practiced ${sessionLabel} on Pitcht. How did the real one go?
            </p>
            <p style="margin:0 0 20px; font-size:16px; line-height:1.6; color:#a1a1a1;">
              One tap helps me build a coach that learns what actually works — not just what sounds good in practice.
            </p>
            <p style="margin:0 0 32px; font-size:16px; line-height:1.6; color:#a1a1a1;">
              Just hit the button that matches where you landed:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 32px;">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-bottom: 8px;">
                  <a href="${offerUrl}" style="display:inline-block; padding:12px 20px; background:#ffffff; color:#0a0a0a; text-decoration:none; border-radius:8px; font-weight:600; font-size:15px; margin:6px;">I got an offer</a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom: 8px;">
                  <a href="${nextRoundUrl}" style="display:inline-block; padding:12px 20px; background:#1f1f1f; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:15px; margin:6px; border:1px solid #2a2a2a;">Moved to next round</a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom: 8px;">
                  <a href="${rejectedUrl}" style="display:inline-block; padding:12px 20px; background:#1f1f1f; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:15px; margin:6px; border:1px solid #2a2a2a;">Got rejected</a>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom: 8px;">
                  <a href="${noResponseUrl}" style="display:inline-block; padding:12px 20px; background:#1f1f1f; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:15px; margin:6px; border:1px solid #2a2a2a;">Still waiting / no response</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 40px;">
            <p style="margin:0 0 4px; font-size:15px; line-height:1.6; color:#a1a1a1;">
              — Jose, Founder of Pitcht
            </p>
            <p style="margin:24px 0 0; font-size:12px; color:#666666; line-height:1.6;">
              You're getting this because you completed a Pitcht session 3 days ago. Reply STOP and I won't send these again.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function buildOutcomeEmailText(params: SendOutcomeEmailParams): string {
  const { token, sessionType } = params;
  const sessionLabel = getSessionLabel(sessionType);
  const baseUrl = `https://app.pitcht.us/outcome/${token}`;

  return `${getSubject(sessionType)}

Three days ago you practiced ${sessionLabel} on Pitcht. How did the real one go?

One tap helps me build a coach that learns what actually works — not just what sounds good in practice.

Just hit the link that matches where you landed:

I got an offer: ${baseUrl}?response=offer
Moved to next round: ${baseUrl}?response=next_round
Got rejected: ${baseUrl}?response=rejected
Still waiting / no response: ${baseUrl}?response=no_response

— Jose, Founder of Pitcht

---
You're getting this because you completed a Pitcht session 3 days ago. Reply STOP and I won't send these again.`.trim();
}

export async function sendOutcomeEmail(params: SendOutcomeEmailParams): Promise<{ id?: string; dryRun?: boolean }> {
  const { userEmail, sessionId, sessionType, token } = params;

  const subject = getSubject(sessionType);
  const baseUrl = `https://app.pitcht.us/outcome/${token}`;
  const links = {
    offer: `${baseUrl}?response=offer`,
    next_round: `${baseUrl}?response=next_round`,
    rejected: `${baseUrl}?response=rejected`,
    no_response: `${baseUrl}?response=no_response`,
  };

  // Dry-run mode: log and bail without hitting Resend
  if (process.env.RESEND_DRY_RUN === 'true') {
    console.log('[outcome-email] DRY RUN:', { to: userEmail, subject, token, links });
    return { dryRun: true };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('[outcome-email] RESEND_API_KEY environment variable is not set');
  }

  const payload = {
    from: 'Jose from Pitcht <contact@pitcht.us>',
    to: userEmail,
    subject,
    html: buildOutcomeEmailHtml(params),
    text: buildOutcomeEmailText(params),
    tags: [
      { name: 'type', value: 'outcome-ping' },
      { name: 'session_id', value: sessionId },
      { name: 'session_type', value: sessionType },
    ],
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[outcome-email] Resend responded with ${res.status}: ${text}`);
  }

  const data = await res.json() as { id: string };
  return { id: data.id };
}
