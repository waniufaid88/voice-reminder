/**
 * VAPID keys for Web Push Notifications.
 * Defaults provided so background notifications work out-of-the-box.
 */
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BD7Wz7V2_iDn7hGW8w9RzIzD_nFNOK8NEXAkuL6iqCLh5Dzff_UWmVtMd3WHOmOYoQDSuNCTaU9MeESI1We3K60";

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  "ifSgEsxZmn0vqAH9zqALPluRiIuNV70L_DeYH4Nb39c";

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT || "mailto:support@voicereminder.app";

/**
 * Converts a base64 VAPID public key string into a Uint8Array for applicationServerKey.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
