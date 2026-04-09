import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function AuthCallback() {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const handleCallback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('Auth callback error:', error.message);
          navigate('/auth', { replace: true });
          return;
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth', { replace: true });
        return;
      }

      // Check roles
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);

      const isPartner = roles?.some(r => r.role === 'partner') || false;
      if (isPartner) {
        navigate('/partner-dashboard', { replace: true });
        return;
      }

      // Check if first-time user (onboarding not completed or skipped)
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, onboarding_skipped')
        .eq('user_id', session.user.id)
        .maybeSingle();

      const isFirstTime = !profile?.onboarding_completed && !profile?.onboarding_skipped;
      navigate(isFirstTime ? '/welcome' : '/', { replace: true });
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing you in…</p>
    </div>
  );
}
