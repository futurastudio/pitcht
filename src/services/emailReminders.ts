/**
 * Email Reminder Service
 * Sends automated trial expiration reminders
 *
 * Strategy:
 * - Day 3: "Halfway through your trial - keep practicing!"
 * - Day 6: "Last day tomorrow - upgrade to keep your progress"
 * - Day 7: "Trial ended - upgrade to Premium"
 *
 * Implementation options:
 * 1. Supabase Edge Function (cron job)
 * 2. Resend.com API (transactional emails)
 * 3. SendGrid/Mailgun
 */

import { supabase } from './supabase';

export interface TrialReminderEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Get users whose trial is ending soon
 * @param daysRemaining Number of days until trial ends
 */
export async function getUsersWithTrialEnding(daysRemaining: number): Promise<Record<string, unknown>[]> {
  try {
    // Calculate the target date (trial_end approximately X days from now)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysRemaining);
    targetDate.setHours(0, 0, 0, 0);

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // This query would need to be run server-side with service role
    // since we need to access auth.users metadata
    const { data, error } = await supabase.rpc('get_trial_ending_users', {
      days_remaining: daysRemaining
    });

    if (error) {
      console.error('Error fetching trial users:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getUsersWithTrialEnding:', error);
    return [];
  }
}

/**
 * Generate email content for trial reminders
 */
export function generateTrialReminderEmail(
  userEmail: string,
  daysRemaining: number,
  userName?: string
): TrialReminderEmail {
  const name = userName || 'there';

  if (daysRemaining === 4) {
    // Day 3 of trial
    return {
      to: userEmail,
      subject: "You're halfway through your Pitcht trial!",
      text: `Hi ${name},

You're 3 days into your 7-day Pitcht trial! How's your practice going?

You still have 4 days of unlimited practice sessions, AI feedback, and video analysis.

Keep practicing to see real improvement in your:
- Eye contact and presence
- Speech clarity and pacing
- Confidence and delivery

Login now: https://pitcht.com

Questions? Just reply to this email.

Best,
The Pitcht Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You're halfway through your trial! 🎯</h2>
          <p>Hi ${name},</p>
          <p>You're 3 days into your 7-day Pitcht trial! How's your practice going?</p>
          <p>You still have <strong>4 days</strong> of unlimited practice sessions, AI feedback, and video analysis.</p>
          <h3>Keep practicing to see real improvement in your:</h3>
          <ul>
            <li>Eye contact and presence</li>
            <li>Speech clarity and pacing</li>
            <li>Confidence and delivery</li>
          </ul>
          <p><a href="https://pitcht.com" style="display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Continue Practicing</a></p>
          <p style="color: #666; font-size: 14px;">Questions? Just reply to this email.</p>
        </div>
      `
    };
  } else if (daysRemaining === 1) {
    // Day 6 of trial - last day tomorrow
    return {
      to: userEmail,
      subject: "Your Pitcht trial ends tomorrow",
      text: `Hi ${name},

Your 7-day Pitcht trial ends tomorrow.

Don't lose access to:
✓ Unlimited practice sessions
✓ AI performance feedback
✓ Video & speech analysis
✓ Progress tracking

Upgrade to Premium for just $27/month and keep improving.

Upgrade now: https://pitcht.com/pricing

Your progress is saved and waiting for you!

Best,
The Pitcht Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your trial ends tomorrow ⏰</h2>
          <p>Hi ${name},</p>
          <p>Your 7-day Pitcht trial ends tomorrow.</p>
          <h3>Don't lose access to:</h3>
          <ul>
            <li>✓ Unlimited practice sessions</li>
            <li>✓ AI performance feedback</li>
            <li>✓ Video & speech analysis</li>
            <li>✓ Progress tracking</li>
          </ul>
          <p><strong>Upgrade to Premium for just $27/month</strong> and keep improving.</p>
          <p><a href="https://pitcht.com/pricing" style="display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Upgrade Now</a></p>
          <p style="color: #666; font-size: 14px;">Your progress is saved and waiting for you!</p>
        </div>
      `
    };
  } else if (daysRemaining === 0) {
    // Trial expired
    return {
      to: userEmail,
      subject: "Your Pitcht trial has ended",
      text: `Hi ${name},

Your 7-day Pitcht trial has ended.

You now have access to:
- 3 free practice sessions
- All your past sessions are saved

Upgrade to Premium ($27/month) to get:
✓ Unlimited practice sessions
✓ Full session history
✓ Progress tracking charts
✓ Advanced analytics

Upgrade now: https://pitcht.com/pricing

Thanks for trying Pitcht!

Best,
The Pitcht Team`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Your trial has ended</h2>
          <p>Hi ${name},</p>
          <p>Your 7-day Pitcht trial has ended.</p>
          <h3>You now have access to:</h3>
          <ul>
            <li>3 free practice sessions</li>
            <li>All your past sessions are saved</li>
          </ul>
          <h3>Upgrade to Premium ($27/month) to get:</h3>
          <ul>
            <li>✓ Unlimited practice sessions</li>
            <li>✓ Full session history</li>
            <li>✓ Progress tracking charts</li>
            <li>✓ Advanced analytics</li>
          </ul>
          <p><a href="https://pitcht.com/pricing" style="display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Upgrade to Premium</a></p>
          <p style="color: #666; font-size: 14px;">Thanks for trying Pitcht!</p>
        </div>
      `
    };
  }

  // Default fallback
  return {
    to: userEmail,
    subject: "Your Pitcht trial update",
    text: `Hi ${name}, your Pitcht trial has ${daysRemaining} days remaining.`,
    html: `<p>Hi ${name}, your Pitcht trial has ${daysRemaining} days remaining.</p>`
  };
}

/**
 * Send email using Resend API (recommended for transactional emails)
 * Setup: npm install resend
 * Get API key: https://resend.com
 */
export async function sendEmailWithResend(email: TrialReminderEmail): Promise<boolean> {
  try {
    // This would be called from a server-side function (API route or Edge Function)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Pitcht <noreply@pitcht.com>',
        to: email.to,
        subject: email.subject,
        html: email.html,
      })
    });

    if (!response.ok) {
      console.error('Failed to send email:', await response.text());
      return false;
    }

    console.log('✅ Email sent to:', email.to);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}
