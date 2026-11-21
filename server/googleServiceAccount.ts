import crypto from 'node:crypto';

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
}

let cachedAccessToken = '';
let cachedExpiresAt = 0;

/**
 * Exchanges a server-only Google service-account key for a short-lived OAuth
 * access token. Never place FIREBASE_SERVICE_ACCOUNT_JSON in client code or
 * commit its value to the repository.
 */
function readCredentials(): ServiceAccountCredentials {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Firebase service-account credentials are invalid.');
  }
  const credentials = parsed as Partial<ServiceAccountCredentials>;
  if (
    typeof credentials.client_email !== 'string' ||
    !credentials.client_email.includes('@') ||
    typeof credentials.private_key !== 'string' ||
    !credentials.private_key.includes('PRIVATE KEY')
  ) {
    throw new Error('Firebase service-account credentials are missing client_email or private_key.');
  }

  return {
    client_email: credentials.client_email,
    private_key: credentials.private_key.replace(/\\n/g, '\n'),
    token_uri: credentials.token_uri || 'https://oauth2.googleapis.com/token',
  };
}

function base64UrlJson(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export async function getGoogleServiceAccountAccessToken(
  now = Date.now()
): Promise<string> {
  if (cachedAccessToken && now < cachedExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const credentials = readCredentials();
  const issuedAt = Math.floor(now / 1000);
  const unsigned = [
    base64UrlJson({ alg: 'RS256', typ: 'JWT' }),
    base64UrlJson({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: credentials.token_uri!,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  ].join('.');
  const signature = crypto.sign(
    'RSA-SHA256',
    Buffer.from(unsigned),
    credentials.private_key
  ).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const response = await fetch(credentials.token_uri!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Google service-account token exchange failed (HTTP ${response.status}).`);
  }

  const payload = await response.json() as OAuthTokenResponse;
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new Error('Google token exchange returned no access token.');
  }

  cachedAccessToken = payload.access_token;
  cachedExpiresAt = now + Math.max(60, Number(payload.expires_in) || 3600) * 1000;
  return cachedAccessToken;
}

/** Test-only cache reset; does not expose credentials or tokens. */
export function resetGoogleServiceAccountTokenCache(): void {
  cachedAccessToken = '';
  cachedExpiresAt = 0;
}
