"use client";

import { use, useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import { Users, Check, AlertCircle, ArrowRight, LogIn, LogOut } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getCurrentUserAction, logoutAction } from "@/app/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

interface InvitePageProps {
  params: Promise<{
    token: string;
  }>;
}

function InviteAcceptContent({ params }: InvitePageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<{
    _id: string;
    name: string;
    email: string;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  useEffect(() => {
    getCurrentUserAction().then((u) => {
      setCurrentUser(u);
      setAuthLoading(false);
    });
  }, []);

  const inviteDetails = useQuery(api.teams.getInvitationByToken, { token });
  const acceptInvitation = useMutation(api.teams.acceptInvitation);
  const declineInvitation = useMutation(api.teams.declineInvitation);

  const userTeamRole = useQuery(
    api.teams.getUserTeamRole,
    inviteDetails?.teamId && currentUser
      ? { teamId: inviteDetails.teamId, userId: currentUser._id as Id<"users"> }
      : "skip"
  );
  const isAlreadyMember = Boolean(userTeamRole);

  const handleAccept = async () => {
    if (!currentUser || !inviteDetails) return;
    setIsAccepting(true);
    try {
      await acceptInvitation({
        token,
        userId: currentUser._id as Id<"users">,
      });
      toast.success(`You have joined ${inviteDetails.teamName}! 🎉`);
      router.push(`/?teamId=${inviteDetails.teamId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to accept invitation";
      toast.error(msg);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!currentUser) return;
    setIsDeclining(true);
    try {
      await declineInvitation({
        token,
        userId: currentUser._id as Id<"users">,
      });
      toast.success("Invitation declined.");
      router.push("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to decline invitation";
      toast.error(msg);
    } finally {
      setIsDeclining(false);
    }
  };

  const handleSwitchAccount = async () => {
    await logoutAction();
    router.push(`/login?redirect=/invite/${token}&email=${inviteDetails?.invitedEmail || ""}`);
  };

  if (authLoading || inviteDetails === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="flex items-center gap-3 text-zinc-500">
          <svg className="h-5 w-5 animate-spin text-purple-600" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading invitation...</span>
        </div>
      </div>
    );
  }

  // Invalid or expired invitation link
  if (!inviteDetails) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <Card className="max-w-md w-full border-zinc-200 dark:border-white/[0.08] shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 mb-2">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg">Invitation Not Found</CardTitle>
            <CardDescription>
              This invitation link is invalid or has already been used or cancelled.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link
              href="/"
              className={buttonVariants({
                className: "bg-purple-600 hover:bg-purple-700 text-white rounded-xl",
              })}
            >
              Go to Dashboard
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (inviteDetails.status !== "pending" || inviteDetails.isExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <Card className="max-w-md w-full border-zinc-200 dark:border-white/[0.08] shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-2">
              <AlertCircle className="h-6 w-6" />
            </div>
            <CardTitle className="text-lg">Invitation {inviteDetails.isExpired ? "Expired" : inviteDetails.status}</CardTitle>
            <CardDescription>
              {inviteDetails.isExpired
                ? "This invitation link has expired. Please ask the team owner to send a new invitation."
                : `This invitation has already been ${inviteDetails.status}.`}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link
              href="/"
              className={buttonVariants({
                className: "bg-purple-600 hover:bg-purple-700 text-white rounded-xl",
              })}
            >
              Go to Dashboard
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isEmailMatching =
    currentUser &&
    inviteDetails.invitedEmail &&
    currentUser.email.toLowerCase() === inviteDetails.invitedEmail.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <Card className="max-w-md w-full border-zinc-200/90 dark:border-white/[0.08] shadow-xl overflow-hidden">
        {/* Brand Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md text-white text-2xl mb-3 shadow-sm">
            👥
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">Team Invitation</h1>
          <p className="text-xs text-white/80 mt-1">
            You&apos;ve been invited to join a team on VoiceReminder
          </p>
        </div>

        <CardContent className="p-6 space-y-5">
          {/* Team Details Box */}
          <div className="rounded-2xl border border-zinc-200 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-[#151624] p-4 text-center space-y-1.5">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
              {inviteDetails.teamName}
            </h2>
            {inviteDetails.teamDescription && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {inviteDetails.teamDescription}
              </p>
            )}
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
              <span>Invited by <strong className="text-zinc-900 dark:text-white">{inviteDetails.inviterName}</strong></span>
              {inviteDetails.memberCount !== undefined && (
                <>
                  <span>•</span>
                  <span>{inviteDetails.memberCount} {inviteDetails.memberCount === 1 ? "member" : "members"}</span>
                </>
              )}
              <span>•</span>
              <span className="font-semibold text-purple-600 dark:text-purple-400 capitalize bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/40">
                {inviteDetails.role}
              </span>
            </div>
          </div>

          {/* Reusable Invite Link Flow */}
          {inviteDetails.isReusableLink ? (
            !currentUser ? (
              /* Scenario A: Not logged in */
              <div className="space-y-4">
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 p-3.5 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">Sign in required</p>
                  <p>
                    Please sign in or create an account to join <strong>{inviteDetails.teamName}</strong>.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <Link
                    href={`/login?redirect=/invite/${token}`}
                    className={buttonVariants({
                      className: "w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl flex items-center justify-center gap-2",
                    })}
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Sign In to Join</span>
                  </Link>

                  <Link
                    href={`/register?redirect=/invite/${token}`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "w-full rounded-xl flex items-center justify-center",
                    })}
                  >
                    <span>Create a New Account</span>
                  </Link>
                </div>
              </div>
            ) : isAlreadyMember ? (
              /* Scenario B: Already a team member */
              <div className="space-y-4">
                <div className="rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 p-3.5 text-xs text-purple-900 dark:text-purple-300 flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-purple-600" />
                  <span>You are already a member of <strong>{inviteDetails.teamName}</strong></span>
                </div>

                <Link
                  href={`/?teamId=${inviteDetails.teamId}`}
                  className={buttonVariants({
                    className: "w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10 font-bold flex items-center justify-center gap-2",
                  })}
                >
                  <span>Go to Team Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              /* Scenario C: Logged in and ready to join */
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Signed in as <strong>{currentUser.email}</strong></span>
                </div>

                <div className="flex flex-col gap-2.5">
                  <Button
                    onClick={handleAccept}
                    disabled={isAccepting}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10 font-bold cursor-pointer"
                  >
                    {isAccepting ? "Joining Team..." : "Join Team"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => router.push("/")}
                    className="w-full text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )
          ) : (
            /* Legacy Specific Email Invite Flow */
            !currentUser ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 p-3.5 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">Sign in required</p>
                  <p>
                    This invitation was sent to <strong>{inviteDetails.invitedEmail}</strong>. Please sign in with this email address to accept.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <Link
                    href={`/login?redirect=/invite/${token}&email=${encodeURIComponent(inviteDetails.invitedEmail || "")}`}
                    className={buttonVariants({
                      className: "w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl flex items-center justify-center gap-2",
                    })}
                  >
                    <LogIn className="h-4 w-4" />
                    <span>Sign In to Accept</span>
                  </Link>

                  <Link
                    href={`/register?redirect=/invite/${token}&email=${encodeURIComponent(inviteDetails.invitedEmail || "")}`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "w-full rounded-xl flex items-center justify-center",
                    })}
                  >
                    <span>Create a New Account</span>
                  </Link>
                </div>
              </div>
            ) : !isEmailMatching ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/40 p-4 text-xs text-rose-800 dark:text-rose-300 space-y-2">
                  <p className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    <span>Email Address Mismatch</span>
                  </p>
                  <p>
                    This invitation was sent to <strong>{inviteDetails.invitedEmail}</strong>, but you are currently signed in as <strong>{currentUser.email}</strong>.
                  </p>
                  <p>
                    To accept this invitation, please switch to the account with email <strong>{inviteDetails.invitedEmail}</strong>.
                  </p>
                </div>

                <Button
                  onClick={handleSwitchAccount}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl cursor-pointer"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>Switch to {inviteDetails.invitedEmail}</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Signed in as <strong>{currentUser.email}</strong></span>
                </div>

                <div className="flex flex-col gap-2.5">
                  <Button
                    onClick={handleAccept}
                    disabled={isAccepting}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10 font-bold cursor-pointer"
                  >
                    {isAccepting ? "Joining Team..." : "Accept Invitation & Join Team"}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleDecline}
                    disabled={isDeclining}
                    className="w-full text-xs text-zinc-500 hover:text-rose-600 rounded-xl cursor-pointer"
                  >
                    {isDeclining ? "Declining..." : "Decline Invitation"}
                  </Button>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function InviteAcceptPage(props: InvitePageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
          <div className="flex items-center gap-3 text-zinc-500">
            <svg
              className="h-5 w-5 animate-spin text-purple-600"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm font-medium">Loading invitation...</span>
          </div>
        </div>
      }
    >
      <InviteAcceptContent {...props} />
    </Suspense>
  );
}
