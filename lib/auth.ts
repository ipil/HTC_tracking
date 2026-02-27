import { cookies } from "next/headers";
import { verifyCookieValue } from "@/lib/cookies";

function isAcceptedCookieValue(value: string | undefined, expectedRawValue: string): boolean {
  if (!value) {
    return false;
  }

  if (value === expectedRawValue) {
    return true;
  }

  return verifyCookieValue(value, expectedRawValue);
}

export async function isSiteAuthenticated(): Promise<boolean> {
  const sitePasswordEnabled = Boolean(process.env.SITE_PASSWORD);
  if (!sitePasswordEnabled) {
    return true;
  }

  const store = await cookies();
  const value = store.get("site_auth")?.value;
  return isAcceptedCookieValue(value, "1");
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const adminPasswordEnabled = Boolean(process.env.ADMIN_PASSWORD);
  if (!adminPasswordEnabled) {
    return true;
  }

  const store = await cookies();
  const value = store.get("admin_auth")?.value;
  return isAcceptedCookieValue(value, "1");
}
