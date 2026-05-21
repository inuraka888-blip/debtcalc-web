import { redirect } from "@/i18n/routing";

export default function DataSafetyRedirectPage() {
  redirect({ href: "/settings/data-safety", locale: "en" });
}
