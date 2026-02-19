import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

export default function CookiePolicy() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 container mx-auto max-w-3xl px-4 py-12">
        <h1 className="font-display text-3xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 19, 2025</p>

        <div className="prose prose-sm max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-xl font-semibold mb-2">1. What Are Cookies</h2>
            <p>
              Cookies are small text files placed on your device when you visit a website. They help the website remember your preferences and improve your browsing experience. This policy explains how Bogie Enterprises LLC, a North Carolina limited liability company ("BogieBoard," "we," "us"), uses cookies and similar technologies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">2. How We Use Cookies</h2>

            <h3 className="text-lg font-medium mt-4 mb-1">Essential Cookies</h3>
            <p>
              These cookies are necessary for BogieBoard to function properly. They enable core features such as user authentication, session management, and security. Without these cookies, the platform cannot operate as intended.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-1">Functional Cookies</h3>
            <p>
              These cookies remember your choices and preferences, such as your selected metro area, search filters, and saved events, to provide a personalized experience.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-1">Analytics Cookies</h3>
            <p>
              We use analytics cookies to understand how visitors interact with BogieBoard. This data helps us improve our platform, identify popular features, and fix issues. Analytics data is aggregated and anonymized where possible.
            </p>

            <h3 className="text-lg font-medium mt-4 mb-1">Performance Cookies</h3>
            <p>
              These cookies help us monitor platform performance, load times, and error rates to ensure a smooth user experience.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">3. Third-Party Cookies</h2>
            <p>
              Some cookies may be set by third-party services we use, such as analytics providers. These third parties have their own privacy policies governing their use of cookies. We do not control third-party cookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">4. Managing Cookies</h2>
            <p>
              You can manage or disable cookies through your browser settings. Please note that disabling essential cookies may impair the functionality of BogieBoard. Here's how to manage cookies in common browsers:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Chrome:</strong> Settings → Privacy and Security → Cookies</li>
              <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies</li>
              <li><strong>Safari:</strong> Preferences → Privacy → Manage Website Data</li>
              <li><strong>Edge:</strong> Settings → Cookies and Site Permissions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">5. Local Storage and Similar Technologies</h2>
            <p>
              In addition to cookies, we may use local storage and session storage in your browser to store preferences and session data. These technologies function similarly to cookies but may store larger amounts of data. The same management principles apply.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">6. Changes to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time. Changes will be posted on this page with a revised "Last updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2">7. Contact Us</h2>
            <p>
              If you have questions about our use of cookies, contact us at:
            </p>
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
