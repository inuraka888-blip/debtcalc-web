import { redirect } from "@/i18n/routing";

interface ShareRedirectPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function ShareRedirectPage({ params }: ShareRedirectPageProps) {
  const { token } = await params;

  redirect({ href: `/share/${token}`, locale: "en" });
}
