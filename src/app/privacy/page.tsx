'use client';

import React from 'react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/"
            className="text-purple-400 hover:text-purple-300 transition-colors mb-6 inline-block"
          >
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-gray-400">
            Last Updated: December 2, 2024
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-gray-300">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Introduction</h2>
            <p className="mb-4">
              Welcome to Pitcht ("we," "our," or "us"). We are committed to protecting your privacy and
              ensuring you have a positive experience when using our interview practice platform.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, disclose, and safeguard your information
              when you use our application. Please read this policy carefully to understand our practices
              regarding your personal data.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Information We Collect</h2>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">1. Account Information</h3>
            <p className="mb-4">When you create an account, we collect:</p>
            <ul className="list-disc list-inside space-y-2 mb-4 ml-4">
              <li>Email address</li>
              <li>Password (encrypted and securely stored)</li>
              <li>Account preferences and settings</li>
              <li>OAuth provider information (if using Google sign-in)</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">2. Practice Session Data</h3>
            <p className="mb-4">When you use our platform, we collect:</p>
            <ul className="list-disc list-inside space-y-2 mb-4 ml-4">
              <li>Video recordings of your practice sessions</li>
              <li>Audio transcripts of your responses</li>
              <li>Session context (job descriptions, topics, questions)</li>
              <li>Performance metrics (eye contact, speech patterns, pacing)</li>
              <li>AI-generated feedback and analysis</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">3. Payment Information</h3>
            <p className="mb-4">
              Payment processing is handled securely by Stripe. We do not store your credit card
              information on our servers. We only receive:
            </p>
            <ul className="list-disc list-inside space-y-2 mb-4 ml-4">
              <li>Stripe customer ID</li>
              <li>Subscription status and plan details</li>
              <li>Payment history and invoice records</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">4. Usage Data</h3>
            <p className="mb-4">We automatically collect:</p>
            <ul className="list-disc list-inside space-y-2 mb-4 ml-4">
              <li>Session timestamps and duration</li>
              <li>Feature usage statistics</li>
              <li>Error logs and diagnostic information</li>
              <li>IP address and browser information</li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">How We Use Your Information</h2>
            <p className="mb-4">We use your information for the following purposes:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Service Delivery:</strong> To provide interview practice, analysis, and feedback</li>
              <li><strong>AI Processing:</strong> To generate personalized questions and coaching feedback</li>
              <li><strong>Video Analysis:</strong> To analyze eye contact, emotions, and presentation skills</li>
              <li><strong>Account Management:</strong> To manage your account, subscriptions, and preferences</li>
              <li><strong>Payment Processing:</strong> To process payments and manage billing</li>
              <li><strong>Communication:</strong> To send service updates, trial reminders, and support responses</li>
              <li><strong>Improvement:</strong> To analyze usage patterns and improve our services</li>
              <li><strong>Security:</strong> To detect fraud, prevent abuse, and ensure platform security</li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Third-Party Services</h2>
            <p className="mb-4">We use the following third-party services to deliver our platform:</p>

            <div className="space-y-4">
              <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg">
                <h4 className="font-semibold text-purple-400 mb-2">Anthropic (Claude AI)</h4>
                <p className="text-sm">
                  <strong>Purpose:</strong> Generates interview questions and coaching feedback<br />
                  <strong>Data Shared:</strong> Session context, transcripts, performance metrics<br />
                  <strong>Data Retention:</strong> Not used for AI training<br />
                  <strong>Privacy Policy:</strong>{' '}
                  <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                    anthropic.com/privacy
                  </a>
                </p>
              </div>

              <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg">
                <h4 className="font-semibold text-purple-400 mb-2">OpenAI (Whisper API)</h4>
                <p className="text-sm">
                  <strong>Purpose:</strong> Transcribes audio recordings to text<br />
                  <strong>Data Shared:</strong> Audio recordings<br />
                  <strong>Data Retention:</strong> 30 days, not used for training<br />
                  <strong>Privacy Policy:</strong>{' '}
                  <a href="https://openai.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                    openai.com/privacy
                  </a>
                </p>
              </div>

              <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg">
                <h4 className="font-semibold text-purple-400 mb-2">Supabase</h4>
                <p className="text-sm">
                  <strong>Purpose:</strong> Database, authentication, and video storage<br />
                  <strong>Data Shared:</strong> All account and session data<br />
                  <strong>Compliance:</strong> GDPR, SOC 2 Type II certified<br />
                  <strong>Privacy Policy:</strong>{' '}
                  <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                    supabase.com/privacy
                  </a>
                </p>
              </div>

              <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg">
                <h4 className="font-semibold text-purple-400 mb-2">Stripe</h4>
                <p className="text-sm">
                  <strong>Purpose:</strong> Payment processing and subscription management<br />
                  <strong>Data Shared:</strong> Email, payment information<br />
                  <strong>Compliance:</strong> PCI DSS Level 1 certified<br />
                  <strong>Privacy Policy:</strong>{' '}
                  <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                    stripe.com/privacy
                  </a>
                </p>
              </div>

              <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg">
                <h4 className="font-semibold text-purple-400 mb-2">MediaPipe (Google)</h4>
                <p className="text-sm">
                  <strong>Purpose:</strong> Client-side eye tracking and face analysis<br />
                  <strong>Data Shared:</strong> None (runs entirely in your browser)<br />
                  <strong>Privacy Policy:</strong>{' '}
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                    policies.google.com/privacy
                  </a>
                </p>
              </div>
            </div>
          </section>

          {/* Data Storage and Security */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Data Storage and Security</h2>
            <p className="mb-4">We implement industry-standard security measures:</p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li><strong>Encryption:</strong> All data transmitted over HTTPS/TLS</li>
              <li><strong>Access Control:</strong> Row-level security policies enforce data isolation</li>
              <li><strong>Video Storage:</strong> Videos stored in private buckets with time-limited access URLs</li>
              <li><strong>Password Security:</strong> Passwords encrypted using bcrypt hashing</li>
              <li><strong>API Security:</strong> CSRF protection and rate limiting on all endpoints</li>
              <li><strong>Payment Security:</strong> PCI-compliant payment processing through Stripe</li>
            </ul>
            <p className="text-sm text-gray-400">
              Despite our best efforts, no security system is impenetrable. We cannot guarantee the
              absolute security of your data.
            </p>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Your Rights</h2>
            <p className="mb-4">You have the following rights regarding your personal data:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your account and all associated data</li>
              <li><strong>Portability:</strong> Export your data in a machine-readable format</li>
              <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications</li>
              <li><strong>Object:</strong> Object to certain processing of your data</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, please contact us at{' '}
              <a href="mailto:privacy@pitcht.com" className="text-purple-400 hover:text-purple-300">
                privacy@pitcht.com
              </a>
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Data Retention</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Active Accounts:</strong> Data retained for the duration of your account</li>
              <li><strong>Deleted Accounts:</strong> Data permanently deleted within 30 days</li>
              <li><strong>Inactive Accounts:</strong> Accounts inactive for 1+ year may be deleted after email notice</li>
              <li><strong>Videos:</strong> Stored until you delete them or close your account</li>
              <li><strong>Payment Records:</strong> Retained for 7 years for tax/legal compliance</li>
            </ul>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Children's Privacy</h2>
            <p>
              Pitcht is not intended for users under 13 years of age. We do not knowingly collect
              personal information from children under 13. If you become aware that a child has
              provided us with personal information, please contact us immediately.
            </p>
          </section>

          {/* International Data Transfers */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">International Data Transfers</h2>
            <p>
              Your data may be transferred to and processed in countries other than your country of
              residence. These countries may have different data protection laws. By using Pitcht,
              you consent to the transfer of your information to our facilities and service providers
              worldwide.
            </p>
          </section>

          {/* Cookies and Tracking */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Cookies and Tracking</h2>
            <p className="mb-4">We use the following types of cookies:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>Essential Cookies:</strong> Required for authentication and security</li>
              <li><strong>Functional Cookies:</strong> Remember your preferences and settings</li>
              <li><strong>Analytics Cookies:</strong> Help us understand how you use the platform</li>
            </ul>
            <p className="mt-4 text-sm text-gray-400">
              You can control cookies through your browser settings, but disabling essential cookies
              may affect platform functionality.
            </p>
          </section>

          {/* Changes to This Policy */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes
              by posting the new policy on this page and updating the "Last Updated" date. Significant
              changes will be communicated via email.
            </p>
          </section>

          {/* Contact Us */}
          <section className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg">
            <h2 className="text-2xl font-semibold text-white mb-4">Contact Us</h2>
            <p className="mb-4">
              If you have questions or concerns about this Privacy Policy, please contact us:
            </p>
            <div className="space-y-2 text-sm">
              <p><strong>Email:</strong>{' '}
                <a href="mailto:privacy@pitcht.com" className="text-purple-400 hover:text-purple-300">
                  privacy@pitcht.com
                </a>
              </p>
              <p><strong>Company:</strong> Pitcht, Inc.</p>
              <p><strong>Address:</strong> New York, New York</p>
            </div>
          </section>

          {/* GDPR/CCPA Compliance Notice */}
          <section className="border-t border-gray-700 pt-6 mt-8">
            <h3 className="text-lg font-semibold text-purple-400 mb-3">
              For EU/EEA Residents (GDPR)
            </h3>
            <p className="mb-4">
              Under the General Data Protection Regulation (GDPR), you have additional rights including
              the right to lodge a complaint with a supervisory authority. Our legal basis for processing
              your data is your consent and our legitimate interest in providing our services.
            </p>

            <h3 className="text-lg font-semibold text-purple-400 mb-3">
              For California Residents (CCPA)
            </h3>
            <p>
              Under the California Consumer Privacy Act (CCPA), you have the right to request information
              about the categories of personal information we collect, the purposes for collection, and
              the categories of third parties we share information with. You also have the right to
              opt-out of the sale of your personal information. Note: We do not sell your personal
              information.
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-gray-700">
          <p className="text-center text-gray-400 text-sm">
            © {new Date().getFullYear()} Pitcht, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
