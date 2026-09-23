import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_KEYS = "https://www.googleapis.com/oauth2/v3/certs";
const keySets = new Map();

export async function verifyGoogleCredential(token, clientId, keyUrl = GOOGLE_KEYS) {
  if (!clientId || typeof token !== "string" || token.length > 8192) throw new Error("Google sign-in is unavailable.");
  let keys = keySets.get(keyUrl);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(keyUrl));
    keySets.set(keyUrl, keys);
  }
  const { payload } = await jwtVerify(token, keys, {
    audience: clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    algorithms: ["RS256"],
    clockTolerance: 5,
  });
  if (typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string") throw new Error("Google account information is incomplete.");
  return { sub: payload.sub, email: payload.email, name: typeof payload.name === "string" ? payload.name : payload.email };
}
