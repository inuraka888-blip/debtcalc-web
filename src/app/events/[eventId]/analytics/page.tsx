import { redirect } from "@/i18n/routing";

interface EventAnalyticsPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function EventAnalyticsPage({ params }: EventAnalyticsPageProps) {
  const { eventId } = await params;

  redirect({ href: `/events/${eventId}/analytics`, locale: "en" });
}
