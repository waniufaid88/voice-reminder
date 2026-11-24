"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";

import { validateResetTokenAction, resetPasswordAction } from "@/app/actions/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [isValidating, setIsValidating] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setTokenError("No reset token provided. Please use the link sent to your email.");
        setIsValidating(false);
        return;
      }

      const res = await validateResetTokenAction(token);
      if (!res.valid) {
        setTokenError(res.error || "Invalid or expired password reset link.");
      }
      setIsValidating(false);
    }

    verifyToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (newPassword.length < 6) {
      setFormError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError("Passwords do not match. Please re-enter.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await resetPasswordAction(token, newPassword);
      if (!res.success) {
        setFormError(res.message);
        toast.error(res.message);
      } else {
        setIsSuccess(true);
        toast.success("Password reset successfully! 🎉");
      }
    } catch {
      setFormError("An unexpected error occurred. Please try again.");
      toast.error("Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md shadow-xl border-zinc-200/80 dark:border-white/[0.08] dark:bg-[#131424]">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30">
            <Lock className="h-7 w-7" />
          </div>
          <CardTitle className="mt-4 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
            Reset Password
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Choose a new, secure password for your VoiceReminder account.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isValidating ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
              <p className="text-xs text-zinc-500">Verifying your reset link...</p>
            </div>
          ) : tokenError ? (
            <div className="space-y-5 text-center py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                <AlertCircle className="h-7 w-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Invalid or Expired Link
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {tokenError}
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <Link href="/forgot-password">
                  <Button className="w-full h-10 text-xs font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white">
                    Request a New Link
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="ghost" className="w-full h-9 text-xs font-medium text-zinc-500">
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : isSuccess ? (
            <div className="space-y-5 text-center py-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Password Reset Complete!
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Your password has been changed successfully. You can now sign in with your new password.
                </p>
              </div>
              <div className="pt-2">
                <Link href="/login">
                  <Button className="w-full h-11 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/25">
                    Proceed to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{formError}</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  New Password
                </label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    disabled={isSubmitting}
                    className="pr-10 rounded-xl border-zinc-300 dark:border-white/10 dark:bg-[#1a1b2e] focus-visible:border-purple-600 focus-visible:ring-purple-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    tabIndex={-1}
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    disabled={isSubmitting}
                    className="pr-10 rounded-xl border-zinc-300 dark:border-white/10 dark:bg-[#1a1b2e] focus-visible:border-purple-600 focus-visible:ring-purple-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-11 text-sm font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/25 cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Resetting Password...
                  </span>
                ) : (
                  "Change Password"
                )}
              </Button>

              <div className="pt-2 text-center text-xs">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1 font-semibold text-purple-600 hover:text-purple-500 dark:text-purple-400"
                >
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
