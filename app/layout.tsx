import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuAssist PH",
  description: "Document processing CRM & order tracking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
