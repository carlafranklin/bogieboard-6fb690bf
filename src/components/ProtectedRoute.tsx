import { useEffect, useState, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [status, setStatus] = useState<'loading' | 'authed' | 'guest'>('loading');

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setStatus(session ? 'authed' : 'guest');
    });
    return () => { cancelled = true; };
  }, []);

  if (status === 'loading') return null;
  if (status === 'guest') return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default ProtectedRoute;
