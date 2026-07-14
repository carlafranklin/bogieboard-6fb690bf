import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getSafeErrorMessage } from '@/lib/errorUtils';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { toast } = useToast();
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

      // Map social profile data to profiles table
      const user = session.user;
      const meta = user.user_metadata || {};
      const profileUpdate: Record<string, any> = {};

      const fullName = meta.full_name || meta.name || '';
      const firstName = fullName.split(' ')[0] || meta.given_name || '';
      const lastName = fullName.split(' ').slice(1).join(' ') || meta.family_name || '';
      const providerAvatarUrl = meta.avatar_url || meta.picture || null;
      const provider = user.app_metadata?.provider || null;

      if (firstName) profileUpdate.first_name = firstName;
      if (lastName) profileUpdate.last_name = lastName;
      if (providerAvatarUrl) profileUpdate.provider_avatar_url = providerAvatarUrl;
      if (provider) profileUpdate.provider = provider;

      // Fetch existing profile to check new vs returning
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, provider_avatar_url, provider, last_login_at, first_login_at, onboarding_completed, onboarding_skipped')
        .eq('user_id', user.id)
        .maybeSingle();

      const now = new Date().toISOString();
      const isFirstTime = !existingProfile?.first_login_at && !(existingProfile as any)?.last_login_at;

      // Build update payload
      const finalUpdate: Record<string, any> = {
        last_login_at: now,
      };

      if (isFirstTime) {
        finalUpdate.first_login_at = now;
      }

      // Only fill in blanks from social data
      if (!existingProfile?.first_name && profileUpdate.first_name) finalUpdate.first_name = profileUpdate.first_name;
      if (!existingProfile?.last_name && profileUpdate.last_name) finalUpdate.last_name = profileUpdate.last_name;
      if (!existingProfile?.provider_avatar_url && profileUpdate.provider_avatar_url) finalUpdate.provider_avatar_url = profileUpdate.provider_avatar_url;
      if (!existingProfile?.provider && profileUpdate.provider) finalUpdate.provider = profileUpdate.provider;

      if (Object.keys(finalUpdate).length > 0) {
        await supabase.from('profiles').update(finalUpdate).eq('user_id', user.id);
      }

      // Deferred partner setup — completes what PartnerMember.tsx's signup couldn't:
      // at signup time there was no active session yet (email confirmation required),
      // so the RLS-protected user_roles/partner_profiles/partner_employees inserts would
      // have silently failed. The business/contact fields travel here as user_metadata.
      // Each step checks for an existing row first, so this is safe to run on every
      // callback (repeat visits, token refresh, etc.) without creating duplicates.
      if (meta.pending_partner_signup) {
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('id')
          .eq('user_id', user.id)
          .eq('role', 'partner')
          .maybeSingle();

        if (!existingRole) {
          const { error: roleError } = await supabase.from('user_roles').insert({ user_id: user.id, role: 'partner' });
          if (roleError) {
            toast({ title: 'Partner setup failed', description: getSafeErrorMessage(roleError), variant: 'destructive' });
            navigate('/partner-member', { replace: true });
            return;
          }
        }

        const { data: existingPartnerProfile } = await supabase
          .from('partner_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        let partnerProfileId = existingPartnerProfile?.id ?? null;

        if (!existingPartnerProfile) {
          const slug = String(meta.business_name || 'partner')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
          const { data: newProfile, error: profileError } = await supabase
            .from('partner_profiles')
            .insert({
              user_id: user.id,
              business_name: meta.business_name || '',
              slug,
              address: meta.address ?? null,
              city: meta.city ?? null,
              state: meta.state ?? null,
              zip_code: meta.zip_code ?? null,
              phone: meta.phone ?? null,
              industry_sector: meta.industry_sector ?? null,
              industry_type: meta.industry_type ?? null,
            })
            .select('id')
            .single();
          if (profileError || !newProfile) {
            toast({ title: 'Partner setup failed', description: getSafeErrorMessage(profileError), variant: 'destructive' });
            navigate('/partner-member', { replace: true });
            return;
          }
          partnerProfileId = newProfile.id;
        }

        if (partnerProfileId) {
          const { data: existingContact } = await supabase
            .from('partner_employees')
            .select('id')
            .eq('partner_profile_id', partnerProfileId)
            .eq('title', 'Primary Contact')
            .maybeSingle();

          if (!existingContact) {
            const { error: employeeError } = await supabase.from('partner_employees').insert({
              partner_profile_id: partnerProfileId,
              name: meta.contact_name || '',
              email: meta.contact_email || null,
              phone: meta.contact_phone || null,
              title: 'Primary Contact',
            });
            if (employeeError) {
              toast({ title: 'Partner setup failed', description: getSafeErrorMessage(employeeError), variant: 'destructive' });
              navigate('/partner-member', { replace: true });
              return;
            }
          }
        }
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

      // Route: returning users with completed onboarding go home; new or incomplete go to /welcome
      const isNewUser = isFirstTime || (!existingProfile?.onboarding_completed && !existingProfile?.onboarding_skipped);
      const isReturning = !isNewUser && existingProfile?.onboarding_completed === true;
      navigate(isReturning ? '/' : '/welcome', { replace: true });
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing you in…</p>
    </div>
  );
}
