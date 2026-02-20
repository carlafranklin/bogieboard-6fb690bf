import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-0 left-0 right-0 z-[60] p-4"
        >
          <div className="container mx-auto max-w-3xl bg-secondary border border-border rounded-xl p-4 shadow-lg flex flex-col sm:flex-row items-center gap-4">
            <p className="text-sm text-foreground/80 flex-1">
              We use cookies to improve your experience.{' '}
              <Link to="/cookie-policy" className="text-primary hover:underline font-medium">
                Learn more
              </Link>
            </p>
            <Button size="sm" onClick={accept} className="shrink-0">
              Accept
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
