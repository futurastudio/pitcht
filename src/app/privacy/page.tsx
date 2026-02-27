'use client';

import React from 'react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen text-white p-8 pb-24 relative">
      {/* Background Gradient Overlay */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md -z-10" />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-12">
          <Link
            href="/"
            className="text-white/60 hover:text-white transition-colors mb-6 inline-block"
          >
            ← Back to Home
          </Link>
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-4">
            Privacy Policy
          </h1>
          <p className="text-white/60">
            Last Updated: February 15, 2026
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-white/80">
          {/* Introduction */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Introduction</h2>
            <p className="mb-4">
              Pitcht ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy
              explains how we collect, use, and safeguard your information when you use our interview
              practice platform.
            </p>
            <p className="text-white/60 text-sm">
              By using Pitcht, you agree to the collection and use of information in accordance with
              this policy.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Information We Collect</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white/90 mb-2">Account Information</h3>
                <ul className="list-disc list-inside space-y-1 text-white/60 ml-4">
                  <li>Email address and encrypted password</li>
                  <li>Account preferences and settings</li>
                  <li>OAuth provider information (if using third-party sign-in)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white/90 mb-2">Practice Session Data</h3>
                <ul className="list-disc list-inside space-y-1 text-white/60 ml-4">
                  <li>Video and audio recordings of your practice sessions</li>
                  <li>Audio transcripts and session context</li>
                  <li>Performance metrics (eye contact, speech patterns, pacing)</li>
                  <li>AI-generated feedback and analysis</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white/90 mb-2">Payment & Usage Data</h3>
                <ul className="list-disc list-inside space-y-1 text-white/60 ml-4">
                  <li>Payment processor customer ID and subscription status</li>
                  <li>Session timestamps, duration, and feature usage statistics</li>
                  <li>Error logs and diagnostic information</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Use Your Information */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">How We Use Your Information</h2>
            <p className="mb-4 text-white/60">We use your information to:</p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span>Provide interview practice and AI-powered feedback</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span>Analyze performance metrics and video content</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span>Process payments and manage subscriptions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span>Send service updates and support responses</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span>Improve our services and user experience</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span>Ensure platform security and prevent abuse</span>
              </li>
            </ul>
          </section>

          {/* Third-Party Services */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Third-Party Service Providers</h2>
            <p className="mb-4">
              We use trusted third-party service providers to deliver our platform. These providers
              have access only to the data necessary to perform their services on our behalf.
            </p>

            <div className="space-y-4 text-white/70">
              <div>
                <h4 className="font-semibold text-white/90 mb-1">AI & Machine Learning Services</h4>
                <p className="text-sm text-white/60">
                  Generate interview questions, coaching feedback, and transcribe audio recordings.
                  Your data is not used to train AI models.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white/90 mb-1">Cloud Infrastructure & Storage</h4>
                <p className="text-sm text-white/60">
                  Securely store account data, session recordings, and application files.
                  GDPR and SOC 2 Type II compliant.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white/90 mb-1">Payment Processing</h4>
                <p className="text-sm text-white/60">
                  Handle subscription payments securely. We do not store credit card information.
                  PCI DSS Level 1 certified.
                </p>
              </div>

              <div>
                <h4 className="font-semibold text-white/90 mb-1">Video Analysis Tools</h4>
                <p className="text-sm text-white/60">
                  Client-side eye tracking and face analysis. Processing happens entirely in your browser—no
                  data is transmitted to external servers.
                </p>
              </div>
            </div>

            <p className="mt-6 text-sm text-white/50">
              We do not sell your personal information to third parties.
            </p>
          </section>

          {/* Data Security */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Data Security</h2>
            <p className="mb-4">We implement industry-standard security measures to protect your data:</p>
            <ul className="space-y-2 text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-white/40">•</span>
                <span>All data transmitted over encrypted HTTPS/TLS connections</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40">•</span>
                <span>Passwords encrypted using industry-standard hashing</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40">•</span>
                <span>Videos stored in private, access-controlled storage</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40">•</span>
                <span>Row-level security policies enforce strict data isolation</span>
              </li>
            </ul>
            <p className="mt-4 text-sm text-white/50">
              While we implement robust security measures, no system is completely secure.
              We cannot guarantee absolute security of your data.
            </p>
          </section>

          {/* Your Rights */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Your Privacy Rights</h2>
            <p className="mb-4">You have the right to:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-white/70">
              <div className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span><strong className="text-white/90">Access</strong> your personal data</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span><strong className="text-white/90">Correct</strong> inaccurate information</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span><strong className="text-white/90">Delete</strong> your account and data</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span><strong className="text-white/90">Export</strong> your data</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span><strong className="text-white/90">Opt-out</strong> of marketing emails</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/40 mt-1">•</span>
                <span><strong className="text-white/90">Object</strong> to data processing</span>
              </div>
            </div>
            <p className="mt-6">
              To exercise these rights, contact us at{' '}
              <a href="mailto:contact@pitcht.us" className="text-white hover:text-white/80 underline">
                contact@pitcht.us
              </a>
            </p>
          </section>

          {/* Data Retention */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Data Retention</h2>
            <ul className="space-y-2 text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-white/40">•</span>
                <span><strong className="text-white/90">Active accounts:</strong> Data retained while your account is active</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40">•</span>
                <span><strong className="text-white/90">Deleted accounts:</strong> Data permanently deleted within 30 days</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40">•</span>
                <span><strong className="text-white/90">Inactive accounts:</strong> May be deleted after 1+ year with email notice</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-white/40">•</span>
                <span><strong className="text-white/90">Payment records:</strong> Retained for 7 years for legal compliance</span>
              </li>
            </ul>
          </section>

          {/* Additional Notices */}
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-6">Additional Information</h2>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white/90 mb-2">International Data Transfers</h3>
                <p className="text-white/70">
                  Your data may be transferred to and processed in countries other than your country
                  of residence. By using Pitcht, you consent to these transfers.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white/90 mb-2">Children's Privacy</h3>
                <p className="text-white/70">
                  Pitcht is not intended for users under 13 years of age. We do not knowingly collect
                  information from children under 13.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white/90 mb-2">Policy Updates</h3>
                <p className="text-white/70">
                  We may update this Privacy Policy from time to time. Significant changes will be
                  communicated via email and reflected in the "Last Updated" date above.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white/90 mb-2">GDPR & CCPA Compliance</h3>
                <p className="text-white/70">
                  For EU/EEA residents: You have the right to lodge a complaint with a supervisory
                  authority under GDPR. For California residents: You have additional rights under
                  CCPA, including the right to know what information we collect and request deletion.
                  We do not sell your personal information.
                </p>
              </div>
            </div>
          </section>

          {/* Contact */}
          <section className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Contact Us</h2>
            <p className="mb-4 text-white/80">
              Questions or concerns about this Privacy Policy? We're here to help.
            </p>
            <div className="space-y-2 text-white/70">
              <p>
                <strong className="text-white/90">Email:</strong>{' '}
                <a href="mailto:contact@pitcht.us" className="text-white hover:text-white/80 underline">
                  contact@pitcht.us
                </a>
              </p>
              <p><strong className="text-white/90">Company:</strong> Pitcht, Inc.</p>
              <p><strong className="text-white/90">Location:</strong> New York, New York</p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-white/10">
          <p className="text-center text-white/40 text-sm">
            © {new Date().getFullYear()} Pitcht, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
