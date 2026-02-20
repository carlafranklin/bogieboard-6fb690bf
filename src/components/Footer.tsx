import { MapPin } from 'lucide-react';

interface FooterProps {
  isLoggedIn?: boolean;
}

export function Footer({ isLoggedIn = false }: FooterProps) {
  return (
    <footer className="bg-secondary text-secondary-foreground py-12 px-4">
      <div className="container mx-auto max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center">
                <MapPin className="w-8 h-8 text-primary-foreground" />
              </div>
              <span className="font-display text-2xl font-bold">BogieBoard</span>
            </div>
            <p className="text-white/90 max-w-sm">
              Your local guide to events, activities, and experiences. Discover what's happening near you.
            </p>
          </div>

          {/* Links — only shown for guests */}
          {!isLoggedIn && (
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-white/90">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
          )}

          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-white/90">
              <li><a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</a></li>
              <li><a href="/cookie-policy" className="hover:text-white transition-colors">Cookie Policy</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/20 pt-8 text-center text-white/70 text-sm">
          © {new Date().getFullYear()} BogieBoard. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
