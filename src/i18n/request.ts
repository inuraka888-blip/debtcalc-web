import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import type { Locale } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale: Locale = routing.locales.includes(requestedLocale as Locale)
    ? (requestedLocale as Locale)
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
