import { redirect } from "@/i18n/routing";

export default function EventsRedirectPage() {
  redirect({ href: "/events", locale: "en" });
}
