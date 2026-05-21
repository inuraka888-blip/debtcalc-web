import { redirect } from "@/i18n/routing";

export default function SettingsPage() {
  redirect({ href: "/settings", locale: "en" });
}
