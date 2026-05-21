import { redirect } from "@/i18n/routing";
import type { Locale } from "@/i18n/routing";

export default async function LocaleHomePage({
  params,
}: Readonly<{
  params: Promise<{ locale: Locale }>;
}>) {
  const { locale } = await params;

  redirect({ href: "/events", locale });
}
