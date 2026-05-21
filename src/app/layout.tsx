import type { Metadata, Viewport } from "next";
import { PwaRegistration } from "@/components/PwaRegistration";
import { ReminderScheduler } from "@/components/ReminderScheduler";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DebtCalc",
    template: "%s - DebtCalc",
  },
  description: "Local-first shared expense tracking",
  applicationName: "DebtCalc",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "DebtCalc",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f7f4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <PwaRegistration />
        <ReminderScheduler />
        {children}
      </body>
    </html>
  );
}
