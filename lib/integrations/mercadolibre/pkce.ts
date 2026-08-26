import { createHash, randomBytes } from 'crypto';

const VERIFIER_MIN_LENGTH = 43;
const VERIFIER_MAX_LENGTH = 128;

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/** RFC 7636 — code_verifier (43–128 chars, base64url). */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

export function isValidCodeVerifier(value: string): boolean {
  if (value.length < VERIFIER_MIN_LENGTH || value.length > VERIFIER_MAX_LENGTH) return false;
  return /^[A-Za-z0-9\-._~]+$/.test(value);
}

/** PKCE S256 — BASE64URL(SHA256(code_verifier)). */
export function createS256Challenge(codeVerifier: string): string {
  const digest = createHash('sha256').update(codeVerifier, 'utf8').digest();
  return base64UrlEncode(digest);
}

export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = generateCodeVerifier();
  return {
    codeVerifier,
    codeChallenge: createS256Challenge(codeVerifier),
  };
}
