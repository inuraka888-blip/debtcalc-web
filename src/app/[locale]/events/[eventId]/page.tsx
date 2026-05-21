import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EventDetailScreen } from "@/features/events/EventDetailScreen";

interface EventPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function EventPage({ params }: EventPageProps) {
  const { eventId } = await params;

  return (
    <ErrorBoundary title="Event could not be opened">
      <EventDetailScreen eventId={eventId} />
    </ErrorBoundary>
  );
}
