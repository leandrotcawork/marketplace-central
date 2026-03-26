import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Marketplace Central",
  description: "Gestão de preços e margens para marketplaces",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <body className="min-h-full flex" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
