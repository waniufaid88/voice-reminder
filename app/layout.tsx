import type { Metadata } from "next";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { Toaster } from "react-hot-toast";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: "VoiceReminder",
  description: "Smart voice & text notes, reminders and lists",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", "font-sans", geist.variable)}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ConvexClientProvider>
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                borderRadius: "14px",
                // background: "#18181b",
                background: "white",
                color: "#18181b",
                fontSize: "13px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
              },
              success: {
                iconTheme: {
                  primary: "#10b981",
                  secondary: "#ffffff",
                },
              },
              error: {
                iconTheme: {
                  primary: "#ef4444",
                  secondary: "#ffffff",
                },
              },
            }}
          />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
