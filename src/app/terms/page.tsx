'use client';

import React from 'react';
import Link from 'next/link';

export default function TermsOfServicePage() {
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
          <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
          <p className="text-gray-400">
            Last Updated: December 9, 2024
          </p>
        </div>

        {/* Content */}
        <div className="space-y-8 text-gray-300">
          {/* Introduction */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">1. Acceptance of Terms</h2>
            <p className="mb-4">
              Welcome to Pitcht ("Service," "we," "our," or "us"). By accessing or using our interview
              practice platform, you agree to be bound by these Terms of Service ("Terms"). If you do not
              agree to these Terms, you may not access or use the Service.
            </p>
            <p>
              These Terms constitute a legally binding agreement between you and Pitcht, Inc. regarding your
              access to and use of the Service.
            </p>
          </section>

          {/* Eligibility */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">2. Eligibility</h2>
            <p className="mb-4">To use the Service, you must:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Be at least 13 years of age (or the legal age of majority in your jurisdiction)</li>
              <li>Have the legal capacity to enter into a binding agreement</li>
              <li>Not be barred from using the Service under applicable law</li>
              <li>Provide accurate and complete registration information</li>
            </ul>
            <p className="mt-4">
              If you are using the Service on behalf of an organization, you represent that you have
              authority to bind that organization to these Terms.
            </p>
          </section>

          {/* Account Registration */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">3. Account Registration and Security</h2>
            <h3 className="text-xl font-semibold text-purple-400 mb-3">3.1 Account Creation</h3>
            <p className="mb-4">
              You may create an account using your email address or through a third-party authentication
              provider (e.g., Google). You are responsible for maintaining the confidentiality of your
              account credentials.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">3.2 Account Security</h3>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>You are solely responsible for all activities that occur under your account</li>
              <li>You must immediately notify us of any unauthorized access or security breach</li>
              <li>We are not liable for any loss or damage arising from unauthorized account access</li>
              <li>You may not share your account with others or allow multiple users to access one account</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">3.3 Account Information</h3>
            <p>
              You agree to provide accurate, current, and complete information and to update it as necessary
              to maintain its accuracy.
            </p>
          </section>

          {/* Service Description */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">4. Service Description</h2>
            <p className="mb-4">Pitcht provides:</p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>AI-powered interview question generation tailored to your job context</li>
              <li>Video recording capabilities for practice sessions</li>
              <li>Speech-to-text transcription of your responses</li>
              <li>AI-driven analysis and feedback on your interview performance</li>
              <li>Eye tracking and facial analysis during recordings</li>
              <li>Historical session tracking and progress monitoring</li>
              <li>Premium features including unlimited sessions and advanced analytics</li>
            </ul>
            <p className="text-sm text-gray-400">
              We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time
              without prior notice. We are not liable for any modification, suspension, or discontinuation
              of the Service.
            </p>
          </section>

          {/* Acceptable Use Policy */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">5. Acceptable Use Policy</h2>
            <p className="mb-4">You agree NOT to:</p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li><strong>Misuse the Service:</strong> Use for any illegal, harmful, or fraudulent purpose</li>
              <li><strong>Violate Rights:</strong> Infringe on intellectual property or privacy rights of others</li>
              <li><strong>Abuse Systems:</strong> Reverse engineer, decompile, or attempt to extract source code</li>
              <li><strong>Automated Access:</strong> Use bots, scrapers, or automated tools without permission</li>
              <li><strong>Overload Systems:</strong> Engage in activities that could harm or overload our infrastructure</li>
              <li><strong>Share Accounts:</strong> Share your account credentials or sell account access</li>
              <li><strong>Upload Malicious Content:</strong> Upload viruses, malware, or harmful code</li>
              <li><strong>Circumvent Security:</strong> Attempt to bypass security features or access restrictions</li>
              <li><strong>Impersonate Others:</strong> Pretend to be someone else or misrepresent your affiliation</li>
              <li><strong>Harass Others:</strong> Engage in abusive, threatening, or harassing behavior</li>
            </ul>
            <p className="text-sm text-gray-400">
              Violation of this Acceptable Use Policy may result in immediate termination of your account
              without refund.
            </p>
          </section>

          {/* User Content */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">6. User Content and Intellectual Property</h2>
            <h3 className="text-xl font-semibold text-purple-400 mb-3">6.1 Your Content</h3>
            <p className="mb-4">
              You retain all ownership rights to content you create, upload, or submit to the Service
              ("User Content"), including video recordings, audio, and text.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">6.2 License Grant</h3>
            <p className="mb-4">
              By uploading User Content, you grant us a limited, non-exclusive, royalty-free, worldwide
              license to use, store, process, and transmit your User Content solely for the purpose of:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Providing the Service to you</li>
              <li>Processing your videos and generating analysis</li>
              <li>Transcribing your audio recordings</li>
              <li>Generating AI feedback and coaching insights</li>
            </ul>
            <p className="mb-4 text-sm text-gray-400">
              <strong>Important:</strong> We do not use your User Content to train AI models or share it with
              third parties except as necessary to provide the Service (e.g., Anthropic for AI analysis,
              OpenAI for transcription).
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">6.3 Our Intellectual Property</h3>
            <p>
              The Service, including all software, algorithms, designs, trademarks, and content created by us,
              is owned by Pitcht, Inc. and protected by copyright, trademark, and other intellectual property
              laws. You may not copy, modify, distribute, or create derivative works without our written
              permission.
            </p>
          </section>

          {/* Payment Terms */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">7. Payment Terms and Subscriptions</h2>
            <h3 className="text-xl font-semibold text-purple-400 mb-3">7.1 Free Trial</h3>
            <p className="mb-4">
              New users receive a free trial period with limited features. Trial limitations include:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Limited number of practice sessions</li>
              <li>Basic feedback and analysis</li>
              <li>Session history limited to recent sessions</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">7.2 Premium Subscription</h3>
            <p className="mb-4">
              Premium subscriptions provide access to unlimited features. Subscription options include:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li><strong>Monthly Plan:</strong> Billed monthly, cancel anytime</li>
              <li><strong>Annual Plan:</strong> Billed annually, discounted rate</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">7.3 Billing</h3>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>All payments are processed securely through Stripe</li>
              <li>Subscriptions automatically renew unless canceled before the renewal date</li>
              <li>You authorize us to charge your payment method on each renewal date</li>
              <li>Prices are subject to change with 30 days' notice</li>
              <li>All fees are non-refundable except as required by law</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">7.4 Cancellation</h3>
            <p className="mb-4">
              You may cancel your subscription at any time from your account settings. Cancellation will take
              effect at the end of your current billing period. You will retain access to premium features
              until the end of the paid period.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">7.5 Refunds</h3>
            <p>
              Refunds are generally not provided except in cases of technical failure preventing service use
              or as required by applicable law. Contact us at support@pitcht.com to request a refund.
            </p>
          </section>

          {/* Data and Privacy */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">8. Data and Privacy</h2>
            <p className="mb-4">
              Your use of the Service is also governed by our{' '}
              <Link href="/privacy" className="text-purple-400 hover:text-purple-300 underline">
                Privacy Policy
              </Link>
              , which describes how we collect, use, and protect your personal information.
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>You consent to the collection and processing of your data as described in the Privacy Policy</li>
              <li>You may delete your account and data at any time from account settings</li>
              <li>We retain deleted data for up to 30 days before permanent deletion</li>
              <li>You can export your data in machine-readable format upon request</li>
            </ul>
          </section>

          {/* Disclaimers */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">9. Disclaimers and Warranties</h2>
            <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg mb-4">
              <p className="font-semibold text-yellow-400 mb-2">IMPORTANT DISCLAIMER</p>
              <p className="text-sm">
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER
                EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
                PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
              </p>
            </div>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>We do not guarantee the Service will be uninterrupted, secure, or error-free</li>
              <li>We do not guarantee the accuracy or completeness of AI-generated feedback</li>
              <li>The Service is for practice purposes only and does not guarantee job interview success</li>
              <li>AI analysis and feedback are suggestions and should not be considered professional advice</li>
              <li>We are not responsible for third-party services (Anthropic, OpenAI, Stripe, Supabase)</li>
            </ul>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">10. Limitation of Liability</h2>
            <div className="bg-gray-800/50 backdrop-blur-sm p-4 rounded-lg mb-4">
              <p className="text-sm">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, PITCHT, INC., ITS OFFICERS, DIRECTORS, EMPLOYEES,
                AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
              </p>
            </div>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Loss of profits, revenue, or business opportunities</li>
              <li>Loss of data or content</li>
              <li>Failed job interviews or employment outcomes</li>
              <li>Unauthorized access to your account</li>
              <li>Service interruptions or technical failures</li>
            </ul>
            <p className="text-sm text-gray-400">
              Our total liability for any claims arising out of or related to these Terms or the Service
              shall not exceed the amount you paid us in the 12 months preceding the claim, or $100 USD,
              whichever is greater.
            </p>
          </section>

          {/* Indemnification */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">11. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Pitcht, Inc. and its officers, directors,
              employees, and agents from any claims, liabilities, damages, losses, and expenses (including
              reasonable attorneys' fees) arising out of or related to:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mt-4">
              <li>Your use or misuse of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of another party</li>
              <li>Your User Content</li>
            </ul>
          </section>

          {/* Termination */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">12. Termination</h2>
            <h3 className="text-xl font-semibold text-purple-400 mb-3">12.1 Termination by You</h3>
            <p className="mb-4">
              You may terminate your account at any time by deleting it from your account settings. Upon
              termination, your access to the Service will cease, and your data will be deleted within 30 days.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">12.2 Termination by Us</h3>
            <p className="mb-4">
              We reserve the right to suspend or terminate your account at any time, with or without notice, for:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Violation of these Terms</li>
              <li>Fraudulent or illegal activity</li>
              <li>Non-payment of subscription fees</li>
              <li>Prolonged inactivity (1+ year)</li>
              <li>At our sole discretion</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">12.3 Effect of Termination</h3>
            <p>
              Upon termination, all licenses granted to you will immediately cease. Provisions that by their
              nature should survive (including payment obligations, disclaimers, and limitations of liability)
              will remain in effect.
            </p>
          </section>

          {/* Dispute Resolution */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">13. Dispute Resolution and Governing Law</h2>
            <h3 className="text-xl font-semibold text-purple-400 mb-3">13.1 Governing Law</h3>
            <p className="mb-4">
              These Terms are governed by and construed in accordance with the laws of the State of Delaware,
              United States, without regard to its conflict of law principles.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">13.2 Dispute Resolution</h3>
            <p className="mb-4">
              For any dispute arising out of or relating to these Terms or the Service:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li><strong>Informal Resolution:</strong> Contact us first at support@pitcht.com</li>
              <li><strong>Mediation:</strong> If unresolved, we agree to pursue good-faith mediation</li>
              <li><strong>Arbitration:</strong> Disputes will be resolved through binding arbitration</li>
            </ul>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">13.3 Class Action Waiver</h3>
            <p className="text-sm text-gray-400">
              You agree to resolve disputes on an individual basis only, and waive any right to participate
              in class actions or class arbitrations.
            </p>
          </section>

          {/* Changes to Terms */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">14. Changes to Terms</h2>
            <p className="mb-4">
              We reserve the right to modify these Terms at any time. Changes will be effective immediately
              upon posting to the Service. We will notify you of material changes via:
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4 mb-4">
              <li>Email notification</li>
              <li>In-app notification</li>
              <li>Prominent notice on the website</li>
            </ul>
            <p>
              Your continued use of the Service after changes constitutes acceptance of the updated Terms.
              If you do not agree to the changes, you must stop using the Service and delete your account.
            </p>
          </section>

          {/* Miscellaneous */}
          <section>
            <h2 className="text-2xl font-semibold text-white mb-4">15. Miscellaneous</h2>
            <h3 className="text-xl font-semibold text-purple-400 mb-3">15.1 Entire Agreement</h3>
            <p className="mb-4">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you
              and Pitcht, Inc. regarding the Service.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">15.2 Severability</h3>
            <p className="mb-4">
              If any provision of these Terms is found to be invalid or unenforceable, the remaining
              provisions will remain in full force and effect.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">15.3 Waiver</h3>
            <p className="mb-4">
              Our failure to enforce any provision of these Terms does not constitute a waiver of that provision.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">15.4 Assignment</h3>
            <p className="mb-4">
              You may not assign or transfer these Terms without our written consent. We may assign these
              Terms without restriction.
            </p>

            <h3 className="text-xl font-semibold text-purple-400 mb-3">15.5 Force Majeure</h3>
            <p>
              We are not liable for any failure to perform due to circumstances beyond our reasonable control,
              including natural disasters, war, terrorism, labor disputes, or internet outages.
            </p>
          </section>

          {/* Contact */}
          <section className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg">
            <h2 className="text-2xl font-semibold text-white mb-4">16. Contact Information</h2>
            <p className="mb-4">
              If you have questions or concerns about these Terms, please contact us:
            </p>
            <div className="space-y-2 text-sm">
              <p><strong>Email:</strong>{' '}
                <a href="mailto:legal@pitcht.com" className="text-purple-400 hover:text-purple-300">
                  legal@pitcht.com
                </a>
              </p>
              <p><strong>Support:</strong>{' '}
                <a href="mailto:support@pitcht.com" className="text-purple-400 hover:text-purple-300">
                  support@pitcht.com
                </a>
              </p>
              <p><strong>Company:</strong> Pitcht, Inc.</p>
              <p><strong>Address:</strong> New York, New York</p>
            </div>
          </section>

          {/* Acknowledgment */}
          <section className="border-t border-gray-700 pt-6 mt-8">
            <div className="bg-purple-900/30 backdrop-blur-sm p-6 rounded-lg">
              <h3 className="text-lg font-semibold text-purple-400 mb-3">
                Acknowledgment
              </h3>
              <p className="text-sm">
                BY USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND
                BY THESE TERMS OF SERVICE. IF YOU DO NOT AGREE, DO NOT USE THE SERVICE.
              </p>
            </div>
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
