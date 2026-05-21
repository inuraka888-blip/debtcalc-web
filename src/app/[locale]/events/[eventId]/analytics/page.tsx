import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EventAnalyticsScreen } from "@/features/events/EventAnalyticsScreen";

interface EventAnalyticsPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function EventAnalyticsPage({ params }: EventAnalyticsPageProps) {
  const { eventId } = await params;

  return (
    <ErrorBoundary title="Analytics could not be opened">
      <EventAnalyticsScreen eventId={eventId} />
    </ErrorBoundary>
  );
}
