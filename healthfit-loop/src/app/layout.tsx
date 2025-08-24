import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FYTR AI - Your Personalized Health & Fitness Loop",
  description: "AI-powered fitness and nutrition plans tailored to your bloodwork, goals, and budget.",
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