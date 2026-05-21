import { SharedEventScreen } from "@/features/share/SharedEventScreen";

interface SharePageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  return <SharedEventScreen token={token} />;
}
