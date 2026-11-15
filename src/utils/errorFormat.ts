import type { Language } from '../types';

interface ParsedFirestoreError {
  error?: string;
  operationType?: string;
  path?: string | null;
  authInfo?: {
    emailVerified?: boolean | null;
    userId?: string | null;
  };
}

const MESSAGES: Record<
  Language,
  {
    permissionDeniedOwner: string;
    permissionDeniedBusiness: string;
    permissionDeniedGeneric: string;
    emailNotVerified: string;
    popupClosed: string;
    popupBlocked: string;
    unauthorizedDomain: string;
    networkOffline: string;
    quotaExceeded: string;
    genericSignIn: string;
  }
> = {
  en: {
    permissionDeniedOwner:
      'Unable to save your owner account profile right now. Please sign out and sign in again with your verified Google account.',
    permissionDeniedBusiness:
      'You do not have permission to view or update this business workspace.',
    permissionDeniedGeneric:
      'You do not have permission to perform this action. Please sign in again with your Google account.',
    emailNotVerified:
      'Your Google account email must be verified before continuing.',
    popupClosed: 'Google sign-in was cancelled before completion. Please try again.',
    popupBlocked:
      'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.',
    unauthorizedDomain:
      'Sign-in is not authorized for this web address yet. Please try again later or contact support.',
    networkOffline:
      'Connection unavailable. Please check your internet connection and try again.',
    quotaExceeded:
      'Service limit reached for today. Please try again later.',
    genericSignIn: 'Could not complete Google sign-in. Please try again.',
  },
  rw: {
    permissionDeniedOwner:
      'Ntibishobotse kubika umwirondoro wa konti yawe ubu. Sohoka wongere winjire ukoresheje konti ya Google yemejwe.',
    permissionDeniedBusiness:
      'Nta burenganzira ufite bwo kureba cyangwa guhindura iki kigo.',
    permissionDeniedGeneric:
      'Nta burenganzira ufite kuri iki gikorwa. Ongera winjire ukoresheje konti yawe ya Google.',
    emailNotVerified:
      'Imeri ya konti yawe ya Google igomba kuba yemejwe mbere yo gukomeza.',
    popupClosed: 'Kwinjira na Google byahagaritswe bitararangira. Ongera ugerageze.',
    popupBlocked:
      'Mushakisha yahagaritse idirishya ryo kwinjira na Google. Emerera popups kuri uru rubuga wongere ugerageze.',
    unauthorizedDomain:
      'Kwinjira ntibiremezwa kuri iyi aderesi y’urubuga. Ongera ugerageze nyuma.',
    networkOffline:
      'Murandasi ntiri gukora neza. Reba internet yawe wongere ugerageze.',
    quotaExceeded:
      'Umubare w’ikoreshwa ry’uyu munsi wuzuye. Ongera ugerageze nyuma.',
    genericSignIn: 'Kwinjira na Google ntibyakunze. Ongera ugerageze.',
  },
  fr: {
    permissionDeniedOwner:
      'Impossible d’enregistrer votre profil propriétaire pour le moment. Déconnectez-vous puis reconnectez-vous avec votre compte Google vérifié.',
    permissionDeniedBusiness:
      'Vous n’avez pas l’autorisation de consulter ou modifier cet espace entreprise.',
    permissionDeniedGeneric:
      'Vous n’avez pas l’autorisation pour cette action. Veuillez vous reconnecter avec votre compte Google.',
    emailNotVerified:
      'L’adresse e-mail de votre compte Google doit être vérifiée pour continuer.',
    popupClosed: 'La connexion Google a été annulée avant la fin. Veuillez réessayer.',
    popupBlocked:
      'Votre navigateur a bloqué la fenêtre de connexion Google. Autorisez les fenêtres contextuelles pour ce site et réessayez.',
    unauthorizedDomain:
      'La connexion n’est pas encore autorisée sur cette adresse web. Veuillez réessayer plus tard.',
    networkOffline:
      'Connexion indisponible. Vérifiez votre accès Internet et réessayez.',
    quotaExceeded:
      'Limite quotidienne atteinte. Veuillez réessayer plus tard.',
    genericSignIn: 'La connexion avec Google a échoué. Veuillez réessayer.',
  },
};

function tryParseFirestoreError(rawMessage: string): ParsedFirestoreError | null {
  const trimmed = rawMessage.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as ParsedFirestoreError;
  } catch {
    return null;
  }
}

export function formatUserFriendlyError(error: unknown, language: Language): string {
  const copy = MESSAGES[language];
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const parsed = tryParseFirestoreError(raw);
  const inner = parsed?.error ?? raw;
  const lower = inner.toLowerCase();

  if (lower.includes('email must be verified') || parsed?.authInfo?.emailVerified === false) {
    return copy.emailNotVerified;
  }
  if (lower.includes('popup-closed-by-user') || lower.includes('cancelled-popup-request')) {
    return copy.popupClosed;
  }
  if (lower.includes('popup-blocked')) {
    return copy.popupBlocked;
  }
  if (lower.includes('unauthorized-domain')) {
    return copy.unauthorizedDomain;
  }
  if (lower.includes('quota exceeded')) {
    return copy.quotaExceeded;
  }
  if (lower.includes('client is offline') || lower.includes('network-request-failed')) {
    return copy.networkOffline;
  }
  if (
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied') ||
    lower.includes('permission_denied')
  ) {
    const path = parsed?.path ?? '';
    if (path.startsWith('owners/')) {
      return copy.permissionDeniedOwner;
    }
    if (path.startsWith('businesses')) {
      return copy.permissionDeniedBusiness;
    }
    return copy.permissionDeniedGeneric;
  }

  if (parsed?.error) {
    return copy.permissionDeniedGeneric;
  }
  return raw || copy.genericSignIn;
}
