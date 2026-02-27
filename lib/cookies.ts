import { createHmac, timingSafeEqual } from "crypto";

function getSecret(): string {
  return (
    process.env.AUTH_COOKIE_SECRET ||
    process.env.SITE_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    "local-dev-cookie-secret"
  );
}

export function signCookieValue(value: string): string {
  const signature = createHmac("sha256", getSecret()).update(value).digest("hex");
  return `${value}.${signature}`;
}

export function verifyCookieValue(signed: string | undefined, expectedRawValue: string): boolean {
  if (!signed) {
    return false;
  }

  const parts = signed.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [raw, signature] = parts;
  if (raw !== expectedRawValue) {
    return false;
  }

  const expected = createHmac("sha256", getSecret()).update(raw).digest("hex");
  if (signature.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
