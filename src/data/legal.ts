// Current legal document version, stored with every legal_acceptances row so
// future terms revisions can distinguish who accepted what. Bump this date
// string when the Terms of Service or Privacy Policy materially change.
// (Re-acceptance enforcement on version bump is deferred; recording the
// version now is what makes it possible later.)
export const TERMS_VERSION = '2026-07-18';

export const LEGAL_DOC_TYPES = ['terms_of_service', 'privacy_policy'] as const;
export type LegalDocType = (typeof LEGAL_DOC_TYPES)[number];

export type LegalAcceptanceSource = 'email_signup' | 'partner_signup' | 'oauth_signup';
