import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 19, 2025</p>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold mb-2">1. Introduction</h2>
            <p>
              Bogie Enterprises LLC, a North Carolina limited liability company ("we," "us," or "BogieBoard"), operates the BogieBoard website and mobile applications. This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our services.
            </p>
            <p>
              By using BogieBoard, you consent to the practices described in this policy. If you do not agree, please discontinue use of our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">2. Information We Collect</h2>
            <h3 className="text-lg font-medium mt-4 mb-1">Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account registration details (name, email address, password)</li>
              <li>Profile information (date of birth, gender, location preferences)</li>
              <li>Saved events and search preferences</li>
              <li>Partner Member business information (business name, address, phone)</li>
              <li>Communications you send to us (support inquiries, feedback)</li>
            </ul>

            <h3 className="text-lg font-medium mt-4 mb-1">Information Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Device and browser information (IP address, browser type, operating system)</li>
              <li>Usage data (pages visited, search queries, clicks, time spent)</li>
              <li>Location data (approximate location based on IP address or, with your permission, precise GPS location)</li>
              <li>Cookies and similar tracking technologies (see our Cookie Policy)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide, maintain, and improve our services</li>
              <li>To personalize event recommendations based on your preferences and location</li>
              <li>To process Partner Member registrations and manage business profiles</li>
              <li>To communicate with you about your account, updates, and promotions</li>
              <li>To analyze usage patterns and improve user experience</li>
              <li>To detect and prevent fraud or other harmful activities</li>
              <li>To comply with legal obligations under North Carolina and federal law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">4. How We Share Your Information</h2>
            <p>We do not sell your personal information. We may share information with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Service Providers:</strong> Third parties that help us operate our platform (hosting, analytics, email delivery)</li>
              <li><strong>Partner Members:</strong> If you interact with a Partner Member's event or listing, limited information may be shared to facilitate your inquiry</li>
              <li><strong>Legal Requirements:</strong> When required by law, court order, or governmental authority, including compliance with North Carolina General Statutes</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">5. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data by contacting us at{' '}
              <a href="mailto:support@bogieboard.com" className="text-primary hover:underline">support@bogieboard.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">6. Your Rights Under North Carolina Law</h2>
            <p>Under applicable North Carolina law, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your personal information</li>
              <li>Opt out of marketing communications at any time</li>
            </ul>
            <p className="mt-2">
              To exercise these rights, contact us at{' '}
              <a href="mailto:support@bogieboard.com" className="text-primary hover:underline">support@bogieboard.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">7. Security</h2>
            <p>
              We implement reasonable administrative, technical, and physical safeguards to protect your information. However, no method of electronic transmission or storage is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">8. Children's Privacy</h2>
            <p>
              BogieBoard is not directed to children under 13. We do not knowingly collect personal information from children under 13. If we become aware of such collection, we will delete the information promptly.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page with a revised "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">10. Contact Us</h2>
            <p>
              Bogie Enterprises LLC<br />
              6414 Woodmont Rd., Jamestown, NC 27282<br />
              Email:{' '}
              <a href="mailto:support@bogieboard.com" className="text-primary hover:underline">support@bogieboard.com</a>
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
