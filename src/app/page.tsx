import { redirect } from "@/i18n/routing";

export default function Home() {
  redirect({ href: "/events", locale: "en" });
}
