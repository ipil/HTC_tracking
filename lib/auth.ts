import { cookies } from "next/headers";
import { verifyCookieValue } from "@/lib/cookies";

export async function isSiteAuthenticated(): Promise<boolean> {
  const sitePasswordEnabled = Boolean(process.env.SITE_PASSWORD);
  if (!sitePasswordEnabled) {
    return true;
  }

  const store = await cookies();
  const value = store.get("site_auth")?.value;
  return verifyCookieValue(value, "1");
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const adminPasswordEnabled = Boolean(process.env.ADMIN_PASSWORD);
  if (!adminPasswordEnabled) {
    return true;
  }

  const store = await cookies();
  const value = store.get("admin_auth")?.value;
  return verifyCookieValue(value, "1");
}
