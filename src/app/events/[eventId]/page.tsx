import { redirect } from "@/i18n/routing";

interface EventPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function EventPage({ params }: EventPageProps) {
  const { eventId } = await params;

  redirect({ href: `/events/${eventId}`, locale: "en" });
}
