
import type { Metadata } from "next";
import "./globals.css";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "react-hot-toast";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: "VoiceReminder",
  description: "Smart voice & text notes, reminders and lists",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("h-full antialiased", geist.variable)}>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ConvexClientProvider>
            {children}
            <Toaster
              position="top-center"
              toastOptions={{
                duration: 3000,
                className: "dark:!bg-zinc-900 dark:!text-zinc-100 dark:!border-zinc-800",
                style: {
                  borderRadius: "14px",
                  background: "var(--card, #ffffff)",
                  color: "var(--card-foreground, #18181b)",
                  fontSize: "13px",
                  border: "1px solid var(--border, rgba(0, 0, 0, 0.1))",
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
        </ThemeProvider>
      </body>
    </html>
  );
}
