/**
 * Maps database/API errors to safe, user-friendly messages.
 * Prevents leaking internal schema details to end users.
 */
export const getSafeErrorMessage = (error: any): string => {
  if (!error) return 'An unexpected error occurred. Please try again.';

  const code = error.code;
  const msg = error.message?.toLowerCase() || '';

  // Known safe error codes
  if (code === '23505') return 'This item already exists.';
  if (code === '23503') return 'Cannot complete this action — the item is referenced elsewhere.';
  if (code === '23502') return 'A required field is missing.';
  if (code === '42501' || msg.includes('rls') || msg.includes('policy')) return 'You do not have permission to perform this action.';
  if (msg.includes('jwt') || msg.includes('token')) return 'Your session has expired. Please sign in again.';
  if (msg.includes('invalid login') || msg.includes('invalid email') || msg.includes('invalid password')) return 'Invalid email or password.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email address before signing in.';
  if (msg.includes('user already registered')) return 'An account with this email already exists.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Too many attempts. Please wait and try again.';

  // Generic fallback — never expose raw error.message
  console.error('Database/API error:', error);
  return 'Something went wrong. Please try again.';
};
