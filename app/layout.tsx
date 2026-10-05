import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { NumberWheelGuard } from "@/components/NumberWheelGuard";
import { readTheme } from "@/lib/theme";

// Text in a clean sans, titles and big figures in a serif.
const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const serif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shri Ram Jewellers",
  description: "Gold/Silver Jewelry Lifecycle & Bookkeeping",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // "auto" leaves the attribute off, and the stylesheet then follows the device's setting.
  const theme = readTheme((await cookies()).get("theme")?.value);

  return (
    <html
      lang="en"
      data-theme={theme === "auto" ? undefined : theme}
      className={`${sans.variable} ${serif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full min-h-screen bg-page text-fg">
        <NumberWheelGuard />
        {children}
      </body>
    </html>
  );
}
