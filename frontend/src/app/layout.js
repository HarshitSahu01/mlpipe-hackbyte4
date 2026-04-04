// src/app/layout.js

import { GoogleOAuthProvider } from "@react-oauth/google";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Predict-Xplore — Agnostic ML Inference SaaS",
  description:
    "Build and run ML inference pipelines on any model, powered by Docker containers and a BFF architecture.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        <GoogleOAuthProvider clientId={process.env.GOOGLE_CLIENT_ID}>
          {children}
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
