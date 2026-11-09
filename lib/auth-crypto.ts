import crypto from "node:crypto";

/**
 * Hashes a password using Node.js built-in scrypt with a random 16-byte salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(`${salt}:${derived.toString("hex")}`);
    });
  });
}

/**
 * Verifies a password against the stored scrypt hash using timingSafeEqual.
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, key] = parts;
  if (!salt || !key) return false;

  return new Promise<boolean>((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      try {
        const keyBuffer = Buffer.from(key, "hex");
        const match = crypto.timingSafeEqual(keyBuffer, derived);
        resolve(match);
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Generates a secure random 64-character session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

