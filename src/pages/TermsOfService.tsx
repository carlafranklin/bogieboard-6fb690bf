import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function TermsOfService() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 19, 2025</p>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold mb-2">1. Acceptance of Terms</h2>
            <p>
              These Terms of Service ("Terms") govern your use of the BogieBoard website and services operated by Bogie Enterprises LLC, a North Carolina limited liability company. By accessing or using BogieBoard, you agree to be bound by these Terms. If you do not agree, do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">2. Description of Service</h2>
            <p>
              BogieBoard is an event discovery platform that aggregates event information from third-party sources, organizations, and Partner Members to help users find local events, activities, and experiences.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">3. Third-Party Event Information Disclaimer</h2>
            <p>
              <strong>BogieBoard aggregates and displays event information sourced from third-party companies, organizations, venues, and public data feeds.</strong> We do not organize, host, or control these events. Accordingly:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>BogieBoard is <strong>not responsible</strong> for the accuracy, completeness, or timeliness of event information provided by third parties.</li>
              <li>BogieBoard is <strong>not liable</strong> for event cancellations, postponements, venue changes, or any modifications made by event organizers.</li>
              <li>BogieBoard is <strong>not responsible</strong> for acts of God, force majeure events, natural disasters, severe weather, pandemics, government actions, or any other circumstances beyond our control that may disrupt, cancel, or otherwise affect listed events.</li>
              <li>Users are encouraged to verify event details directly with the event organizer or venue before attending.</li>
              <li>BogieBoard assumes no liability for any loss, injury, or damages arising from attendance at or reliance on any event listed on our platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">4. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use at{' '}
              <a href="mailto:support@bogieboard.com" className="text-primary hover:underline">support@bogieboard.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">5. Partner Member Accounts</h2>
            <p>
              Partner Members may create business profiles, post events, and manage team members. Partner Members are solely responsible for the accuracy of their business information and event listings. BogieBoard reserves the right to remove or modify any listing that violates these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">6. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the platform for any unlawful purpose</li>
              <li>Post false, misleading, or fraudulent event information</li>
              <li>Attempt to gain unauthorized access to our systems or other user accounts</li>
              <li>Scrape, crawl, or use automated means to access the platform without our written consent</li>
              <li>Interfere with or disrupt the platform or servers</li>
              <li>Impersonate any person or entity</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">7. Intellectual Property</h2>
            <p>
              All content, trademarks, and intellectual property on BogieBoard are owned by or licensed to Bogie Enterprises LLC. You may not reproduce, distribute, or create derivative works without our prior written consent. Event information sourced from third parties remains the property of the respective owners.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">8. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by North Carolina law, Bogie Enterprises LLC, its officers, directors, members, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of BogieBoard, including but not limited to damages related to event cancellations, inaccurate event information, or inability to access the platform.
            </p>
            <p>
              Our total liability for any claim arising from use of the services shall not exceed the amount you paid to us, if any, in the twelve (12) months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">9. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Bogie Enterprises LLC from any claims, damages, losses, or expenses (including reasonable attorney's fees) arising from your use of BogieBoard, your violation of these Terms, or your violation of any rights of a third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">10. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of North Carolina, without regard to conflict of law principles. Any disputes arising from these Terms or your use of BogieBoard shall be resolved in the state or federal courts located in Guilford County, North Carolina.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">11. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time, with or without cause or notice, if we believe you have violated these Terms. Upon termination, your right to use BogieBoard ceases immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">12. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of BogieBoard after changes constitutes acceptance of the revised Terms. We will post the updated Terms on this page with a revised "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">13. Contact Us</h2>
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
