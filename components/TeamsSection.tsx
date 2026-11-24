"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import toast from "react-hot-toast";
import {
  Users,
  Plus,
  Shield,
  Crown,
  User,
  Mail,
  Copy,
  Check,
  RotateCw,
  Trash2,
  LogOut,
  Settings,
  Bell,
  ArrowLeft,
  X,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ItemRecord } from "./ItemCard";
import { TabBasedReminderDashboard } from "./TabBasedReminderDashboard";
import { teamSchema } from "@/lib/validations/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TeamsSectionProps {
  user: {
    _id: string;
    name: string;
    email: string;
  };
  currentTime: number;
  onEditItem: (item: ItemRecord) => void;
  onAddTeamReminder?: (teamId: Id<"teams">) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onTeamStateChange?: (state: { teamName: string | null; subTab: string }) => void;
  targetReminderId?: string | null;
  targetTeamId?: Id<"teams"> | null;
  onTargetHandled?: () => void;
}

function getBaseUrl(): string {
  if (typeof window === "undefined") return "";

  // If a public app URL is configured via environment variable, use it directly
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : "";

  // WhatsApp Web and mobile only hyperlink URLs that have an alphabetic Top-Level Domain (TLD) like .com, .io, etc.
  // When using a raw IP address (e.g. 10.166.75.143) with a port (:3000), WhatsApp ignores the port and path,
  // making it unclickable. Appending '.sslip.io' gives it a valid .io TLD that resolves directly back to the IP.
  const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  if (isIp) {
    return `${protocol}//${hostname}.sslip.io${portSuffix}`;
  }

  if (hostname === "localhost") {
    return `${protocol}//127.0.0.1.sslip.io${portSuffix}`;
  }

  return window.location.origin;
}

export function TeamsSection({
  user,
  currentTime,
  onEditItem,
  onAddTeamReminder,
  searchQuery = "",
  onSearchChange,
  onTeamStateChange,
  targetReminderId,
  targetTeamId,
  onTargetHandled,
}: TeamsSectionProps) {
  const userId = user._id as Id<"users">;

  // Active Team Navigation State
  const [selectedTeamId, setSelectedTeamId] = useState<Id<"teams"> | null>(null);
  const [activeTeamSubTab, setActiveTeamSubTab] = useState<
    "reminders" | "members" | "invitations" | "settings"
  >("reminders");

  // Automatically switch to target team and reminders tab if targeted by notification
  useEffect(() => {
    if (targetTeamId) {
      setSelectedTeamId(targetTeamId);
      setActiveTeamSubTab("reminders");
    }
  }, [targetTeamId]);

  // Dialog States
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [hasCopiedLink, setHasCopiedLink] = useState(false);
  const [isLoadingInviteLink, setIsLoadingInviteLink] = useState(false);
  const [isResettingLink, setIsResettingLink] = useState(false);

  const [isEditTeamOpen, setIsEditTeamOpen] = useState(false);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDescription, setEditTeamDescription] = useState("");
  const [isSavingTeam, setIsSavingTeam] = useState(false);

  // Validation error states for Team create and edit
  const [createErrors, setCreateErrors] = useState<{ name?: string; description?: string }>({});
  const [editErrors, setEditErrors] = useState<{ name?: string; description?: string }>({});

  const [memberToRemove, setMemberToRemove] = useState<{
    userId: Id<"users">;
    name: string;
  } | null>(null);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  // Email tracking for instant WhatsApp/Email sharing
  const [lastInvitedEmail, setLastInvitedEmail] = useState("");

  // Sync browser history state for Android hardware back button
  useEffect(() => {
    if (selectedTeamId) {
      window.history.pushState({ teamId: selectedTeamId }, "");
    }
    const handlePopState = () => {
      setSelectedTeamId(null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [selectedTeamId]);

  // Convex Queries
  const myTeams = useQuery(api.teams.getMyTeams, { userId });
  const pendingUserInvites = useQuery(api.teams.getPendingInvitationsForUser, {
    email: user.email,
  });

  const teamDetails = useQuery(
    api.teams.getTeamDetails,
    selectedTeamId ? { teamId: selectedTeamId, userId } : "skip"
  );

  // Keep edit fields accurately in sync with active team details
  useEffect(() => {
    if (teamDetails?.team) {
      setEditTeamName(teamDetails.team.name);
      setEditTeamDescription(teamDetails.team.description || "");
      setEditErrors({});
    }
  }, [teamDetails?.team?._id, teamDetails?.team?.name, teamDetails?.team?.description]);

  // Synchronize active team and sub-tab context for dynamic search placeholder
  useEffect(() => {
    if (onTeamStateChange) {
      onTeamStateChange({
        teamName: selectedTeamId && teamDetails?.team ? teamDetails.team.name : null,
        subTab: activeTeamSubTab,
      });
    }
  }, [selectedTeamId, teamDetails?.team?.name, activeTeamSubTab, onTeamStateChange]);

  // Filtered teams list based on search query
  const filteredTeams = useMemo(() => {
    if (!myTeams) return undefined;
    const q = searchQuery?.trim().toLowerCase();
    if (!q) return myTeams;
    return myTeams.filter((t): t is NonNullable<typeof t> => {
      if (!t) return false;
      const matchesName = t.name.toLowerCase().includes(q);
      const matchesDesc = t.description?.toLowerCase().includes(q);
      return Boolean(matchesName || matchesDesc);
    });
  }, [myTeams, searchQuery]);

  // Convex Mutations
  const createTeam = useMutation(api.teams.createTeam);
  const updateTeam = useMutation(api.teams.updateTeam);
  const deleteTeam = useMutation(api.teams.deleteTeam);
  const leaveTeam = useMutation(api.teams.leaveTeam);
  const createInvitation = useMutation(api.teams.createInvitation);
  const cancelInvitation = useMutation(api.teams.cancelInvitation);
  const acceptInvitation = useMutation(api.teams.acceptInvitation);
  const declineInvitation = useMutation(api.teams.declineInvitation);
  const updateMemberRole = useMutation(api.teams.updateMemberRole);
  const removeMember = useMutation(api.teams.removeMember);
  const getOrCreateTeamInviteCode = useMutation(api.teams.getOrCreateTeamInviteCode);
  const regenerateTeamInviteCode = useMutation(api.teams.regenerateTeamInviteCode);

  // Load or generate team reusable invite link whenever invite dialog opens
  useEffect(() => {
    if (
      isInviteOpen &&
      selectedTeamId &&
      userId &&
      (teamDetails?.userRole === "owner" || teamDetails?.userRole === "admin")
    ) {
      setIsLoadingInviteLink(true);
      getOrCreateTeamInviteCode({ teamId: selectedTeamId, userId })
        .then((res) => {
          if (res?.inviteCode) {
            setGeneratedInviteLink(`${getBaseUrl()}/invite/${res.inviteCode}`);
          }
        })
        .catch((err) => {
          console.error("Failed to load invite link:", err);
          toast.error("Failed to retrieve invite link");
        })
        .finally(() => {
          setIsLoadingInviteLink(false);
        });
    }
  }, [isInviteOpen, selectedTeamId, userId, teamDetails?.userRole, getOrCreateTeamInviteCode]);

  const handleResetInviteLink = async () => {
    if (!selectedTeamId || !userId) return;
    setIsResettingLink(true);
    try {
      const res = await regenerateTeamInviteCode({ teamId: selectedTeamId, userId });
      if (res?.inviteCode) {
        setGeneratedInviteLink(`${getBaseUrl()}/invite/${res.inviteCode}`);
        toast.success("New invite link generated! Old link has been revoked.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reset invite link";
      toast.error(msg);
    } finally {
      setIsResettingLink(false);
    }
  };

  // Handlers

  const handleCreateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateErrors({});

    const validation = teamSchema.safeParse({
      name: newTeamName,
      description: newTeamDescription,
    });

    if (!validation.success) {
      const fieldErrors: { name?: string; description?: string } = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] as "name" | "description";
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setCreateErrors(fieldErrors);
      const firstMessage = validation.error.issues[0]?.message || "Invalid team details";
      toast.error(firstMessage);
      return;
    }

    setIsCreatingTeam(true);
    try {
      const teamId = await createTeam({
        userId,
        name: validation.data.name,
        description: validation.data.description || undefined,
      });

      toast.success("Team created successfully! 🎉");

      setNewTeamName("");
      setNewTeamDescription("");
      setCreateErrors({});
      setIsCreateTeamOpen(false);
      setSelectedTeamId(teamId);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create team";
      toast.error(msg);
    } finally {
      setIsCreatingTeam(false);
    }
  };


  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId || !inviteEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    const targetEmail = inviteEmail.trim().toLowerCase();
    setLastInvitedEmail(targetEmail);
    setIsInviting(true);
    try {
      const res = await createInvitation({
        teamId: selectedTeamId,
        invitedById: userId,
        invitedEmail: targetEmail,
        role: inviteRole,
      });

      const inviteUrl = `${getBaseUrl()}/invite/${res.token}`;
      setGeneratedInviteLink(inviteUrl);
      toast.success("Invitation generated! Share via WhatsApp or Email.");
      setInviteEmail("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create invitation";
      toast.error(msg);
    } finally {
      setIsInviting(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setHasCopiedLink(true);
      toast.success("Invitation link copied to clipboard!");
      setTimeout(() => setHasCopiedLink(false), 2500);
    } catch {
      toast.error("Could not copy link automatically");
    }
  };

  const handleAcceptInvite = async (token: string) => {
    try {
      const res = await acceptInvitation({ token, userId });
      toast.success("Invitation accepted! Welcome to the team 🎉");
      if (res?.teamId) {
        setSelectedTeamId(res.teamId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to accept invite";
      toast.error(msg);
    }
  };

  const handleDeclineInvite = async (token: string) => {
    try {
      await declineInvitation({ token, userId });
      toast.success("Invitation declined");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to decline invite";
      toast.error(msg);
    }
  };

  const handleUpdateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;
    setEditErrors({});

    const validation = teamSchema.safeParse({
      name: editTeamName,
      description: editTeamDescription,
    });

    if (!validation.success) {
      const fieldErrors: { name?: string; description?: string } = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] as "name" | "description";
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setEditErrors(fieldErrors);
      const firstMessage = validation.error.issues[0]?.message || "Invalid team details";
      toast.error(firstMessage);
      return;
    }

    setIsSavingTeam(true);
    try {
      await updateTeam({
        teamId: selectedTeamId,
        userId,
        name: validation.data.name,
        description: validation.data.description || undefined,
      });
      toast.success("Team settings saved!");
      setIsEditTeamOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update team";
      toast.error(msg);
    } finally {
      setIsSavingTeam(false);
    }
  };

  const handleDeleteTeamConfirm = async () => {
    if (!selectedTeamId) return;
    try {
      await deleteTeam({ teamId: selectedTeamId, userId });
      toast.success("Team permanently deleted");
      setSelectedTeamId(null);
      setIsDeletingTeam(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete team";
      toast.error(msg);
    }
  };

  const handleLeaveTeamConfirm = async () => {
    if (!selectedTeamId) return;
    try {
      await leaveTeam({ teamId: selectedTeamId, userId });
      toast.success("You have left the team");
      setSelectedTeamId(null);
      setIsLeavingTeam(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to leave team";
      toast.error(msg);
    }
  };

  const handleRemoveMemberConfirm = async () => {
    if (!selectedTeamId || !memberToRemove) return;
    try {
      await removeMember({
        teamId: selectedTeamId,
        requestingUserId: userId,
        targetUserId: memberToRemove.userId,
      });
      toast.success(`Removed ${memberToRemove.name} from the team`);
      setMemberToRemove(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      toast.error(msg);
    }
  };

  const handleRoleChange = async (
    targetUserId: Id<"users">,
    newRole: "admin" | "member"
  ) => {
    if (!selectedTeamId) return;
    try {
      await updateMemberRole({
        teamId: selectedTeamId,
        requestingUserId: userId,
        targetUserId,
        newRole,
      });
      toast.success(`Member role updated to ${newRole}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update role";
      toast.error(msg);
    }
  };

  const handleCancelInvite = async (invitationId: Id<"teamInvitations">) => {
    try {
      await cancelInvitation({ invitationId, userId });
      toast.success("Invitation cancelled");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to cancel invitation";
      toast.error(msg);
    }
  };

  // ================= VIEW: INDIVIDUAL ACTIVE TEAM WORKSPACE =================
  if (selectedTeamId && teamDetails) {
    const { team, userRole, members, pendingInvitations } = teamDetails;
    const canManage = userRole === "owner" || userRole === "admin";

    return (
      <div className="space-y-2">

        {/* Workspace Top Navigation Bar */}
        <div className="flex flex-col gap-3 pb-3 border-b border-zinc-200/80 dark:border-white/[0.08]">

          {/* Back Button - Desktop Only */}
          <div className="hidden sm:flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedTeamId(null)}
              className="group inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 dark:border-white/[0.1] bg-white dark:bg-[#161726] px-3.5 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-300 dark:hover:border-purple-800/60 hover:bg-purple-50/40 dark:hover:bg-[#1f2034] shadow-2xs active:scale-95 transition-all cursor-pointer select-none"
              title="Return to Teams list"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span>Back to Teams</span>
            </button>
          </div>

          {/* Prominently Highlighted Team Header Card */}
          <div className="w-full rounded-xl border border-purple-300/80 dark:border-purple-800/60 bg-gradient-to-r from-purple-100/70 via-indigo-50/50 to-purple-50/70 dark:from-purple-950/40 dark:via-[#161726] dark:to-[#1a1528] px-3 py-2 sm:px-4 sm:py-2.5 shadow-xs">
            <div className="flex min-w-0 items-center gap-2">
              {/* Team Information */}
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-purple-600 px-2 py-1 text-[9px] sm:text-[10px] font-bold leading-none text-white">
                👥 TEAM
              </span>
              <h1 className="min-w-0 flex-1 truncate text-sm sm:text-lg font-bold leading-tight tracking-tight text-zinc-900 dark:text-white">
                {team.name}
              </h1>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 sm:px-2 py-1 text-[9px] sm:text-[10px] font-semibold leading-none ${userRole === "owner"
                  ? "bg-amber-100 text-amber-800 border-amber-300/60 dark:bg-amber-950/60 dark:text-amber-300"
                  : userRole === "admin"
                    ? "bg-purple-100 text-purple-800 border-purple-300/60 dark:bg-purple-950/60 dark:text-purple-300"
                    : "bg-zinc-100 text-zinc-800 border-zinc-300/60 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}
              >
                {userRole === "owner" && <Crown className="h-3 w-3" />}
                {userRole === "admin" && <Shield className="h-3 w-3" />}
                {userRole === "member" && <User className="h-3 w-3" />}
                <span>{userRole.toUpperCase()}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Workspace Horizontal Category Navigation Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar border-b border-zinc-200/60 dark:border-white/[0.06] pb-2">
          <button
            type="button"
            onClick={() => setActiveTeamSubTab("reminders")}
            className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${activeTeamSubTab === "reminders"
              ? "bg-purple-600 text-white shadow-xs"
              : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.08]"
              }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>Reminders</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTeamSubTab("members")}
            className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${activeTeamSubTab === "members"
              ? "bg-purple-600 text-white shadow-xs"
              : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.08]"
              }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Members ({members.length})</span>
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setActiveTeamSubTab("invitations")}
              className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${activeTeamSubTab === "invitations"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.08]"
                }`}
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Invitations ({pendingInvitations.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTeamSubTab("settings")}
            className={`flex items-center gap-2 shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${activeTeamSubTab === "settings"
              ? "bg-purple-600 text-white shadow-xs"
              : "bg-white text-zinc-600 hover:text-zinc-900 border border-zinc-200/80 hover:bg-zinc-50 dark:bg-[#161726] dark:text-zinc-300 dark:border-white/[0.08]"
              }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Tab 1: Team Reminders Dashboard */}
        {activeTeamSubTab === "reminders" && (
          <div className="space-y-4">
            <TabBasedReminderDashboard
              userId={userId}
              teamId={team._id}
              currentTime={currentTime}
              searchQuery={searchQuery}
              onEdit={onEditItem}
              title={`${team.name} Reminders`}
              hideIfEmpty={false}
              onClearSearch={onSearchChange ? () => onSearchChange("") : undefined}
              targetReminderId={targetReminderId}
              onTargetHandled={onTargetHandled}
            />
          </div>
        )}

        {/* Tab 2: Members List */}
        {activeTeamSubTab === "members" && (() => {
          const q = searchQuery?.trim().toLowerCase();
          const filteredMembers = q
            ? members.filter(
              (m) =>
                m.name.toLowerCase().includes(q) ||
                m.email.toLowerCase().includes(q)
            )
            : members;

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                  Team Members ({filteredMembers.length}{q ? ` of ${members.length}` : ""})
                </h2>
                {canManage && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setGeneratedInviteLink(null);
                      setIsInviteOpen(true);
                    }}
                    className="text-xs gap-1.5 rounded-xl cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Invite New Member</span>
                  </Button>
                )}
              </div>

              {filteredMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 dark:border-white/[0.08] p-8 text-center bg-white/40 dark:bg-[#151624]">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    No team members match &quot;{searchQuery}&quot;
                  </p>
                  {onSearchChange && (
                    <button
                      type="button"
                      onClick={() => onSearchChange("")}
                      className="mt-2 text-xs font-semibold text-purple-600 hover:text-purple-500 dark:text-purple-400 cursor-pointer"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#151624] divide-y divide-zinc-200/70 dark:divide-white/[0.06] overflow-hidden">
                  {filteredMembers.map((m) => {
                    const isCurrentUser = m.userId === userId;
                    return (
                      <div
                        key={m.userId}
                        className="p-3 sm:p-4 flex items-center justify-between gap-2.5 sm:gap-4 hover:bg-zinc-50/60 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        {/* Left: Avatar + Name + Email in one horizontal block */}
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white font-bold text-xs shadow-xs">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white truncate">
                                {m.name}
                              </span>
                              {isCurrentUser && (
                                <span className="text-[10px] shrink-0 font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.2 rounded">
                                  (You)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              {m.email}
                            </p>
                          </div>
                        </div>

                        {/* Right: Role & Actions in same horizontal row */}
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                          {/* Role Badge / Role Selector for Owner */}
                          {userRole === "owner" && !isCurrentUser ? (
                            <select
                              value={m.role}
                              onChange={(e) =>
                                handleRoleChange(m.userId, e.target.value as "admin" | "member")
                              }
                              className="rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#1e1f32] px-2 py-1 text-[11px] sm:text-xs font-semibold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-purple-600 cursor-pointer"
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                            </select>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-semibold ${m.role === "owner"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : m.role === "admin"
                                  ? "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
                                  : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                                }`}
                            >
                              {m.role === "owner" && <Crown className="h-3 w-3" />}
                              {m.role === "admin" && <Shield className="h-3 w-3" />}
                              {m.role === "member" && <User className="h-3 w-3" />}
                              <span>{m.role.toUpperCase()}</span>
                            </span>
                          )}

                          {/* Remove Member Button */}
                          {!isCurrentUser &&
                            m.role !== "owner" &&
                            (userRole === "owner" || (userRole === "admin" && m.role === "member")) && (
                              <button
                                type="button"
                                onClick={() => setMemberToRemove({ userId: m.userId, name: m.name })}
                                className="rounded-lg p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                title={`Remove ${m.name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Tab 3: Pending Invitations */}
        {activeTeamSubTab === "invitations" && canManage && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Pending Invitations ({pendingInvitations.length})
              </h2>
            </div>

            {pendingInvitations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/[0.08] p-8 text-center text-xs text-zinc-500">
                No active pending invitations for this team. You can invite new members from the <strong>Members</strong> tab.
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#151624] divide-y divide-zinc-200/70 dark:divide-white/[0.06] overflow-hidden">
                {pendingInvitations.map((inv) => {
                  const inviteLink = `${getBaseUrl()}/invite/${inv.token}`;
                  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Hi,\n\nYou have been invited to join the team "${team.name}" on VoiceReminder.\n\nClick the link below to accept and join:\n\n${inviteLink}\n\nLooking forward to collaborating with you!`
                  )}`;
                  const mailtoUrl = `mailto:${inv.invitedEmail}?subject=${encodeURIComponent(
                    `Invitation to join "${team.name}" on VoiceReminder`
                  )}&body=${encodeURIComponent(
                    `Hi,\n\nI've invited you to join "${team.name}" on VoiceReminder as a ${inv.role}.\n\nClick the link below to accept your invitation:\n${inviteLink}\n\nLooking forward to collaborating with you!`
                  )}`;

                  return (
                    <div
                      key={inv._id}
                      className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white truncate max-w-full">
                            {inv.invitedEmail}
                          </span>
                          <span className="text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded shrink-0">
                            {inv.role.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          Expires in {Math.max(1, Math.round((inv.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))} days
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap self-end sm:self-center shrink-0">
                        {/* WhatsApp share */}
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                          title="Share via WhatsApp"
                        >
                          <span>💬 WhatsApp</span>
                        </a>

                        {/* Email share */}
                        <a
                          href={mailtoUrl}
                          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/60 text-xs font-semibold border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                          title="Send Email notification"
                        >
                          <Mail className="h-3 w-3" />
                          <span>Email</span>
                        </a>

                        {/* Copy Link */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(inviteLink)}
                          className="h-8 text-xs gap-1 rounded-lg cursor-pointer"
                        >
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </Button>

                        {/* Cancel Invitation */}
                        <button
                          type="button"
                          onClick={() => handleCancelInvite(inv._id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="Cancel invitation"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Team Settings */}
        {activeTeamSubTab === "settings" && (
          <div className="space-y-6 max-w-xl">
            {canManage && (
              <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#151624] p-5 space-y-4">
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  Team Information
                </h3>

                <form onSubmit={handleUpdateTeamSubmit} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Team Name *
                      </label>
                      <span className={`text-[10px] ${editTeamName.trim().length > 50 || (editTeamName.trim().length > 0 && editTeamName.trim().length <= 2) ? "text-rose-500 font-semibold" : "text-zinc-400"}`}>
                        {editTeamName.trim().length}/50
                      </span>
                    </div>
                    <Input
                      value={editTeamName}
                      onChange={(e) => {
                        setEditTeamName(e.target.value);
                        if (editErrors.name) setEditErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      placeholder="e.g. Design Team (3 to 50 characters)"
                      className={`text-xs ${editErrors.name ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                      maxLength={50}
                    />
                    <div className="flex justify-between mt-1">
                      <p className="text-[10px] text-zinc-500">
                        3–50 characters (greater than 2 characters)
                      </p>
                    </div>
                    {editErrors.name && (
                      <p className="text-[11px] text-rose-500 mt-1 font-medium">{editErrors.name}</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        Description (optional)
                      </label>
                      <span className={`text-[10px] ${editTeamDescription.length > 200 ? "text-rose-500 font-semibold" : "text-zinc-400"}`}>
                        {editTeamDescription.length}/200
                      </span>
                    </div>
                    <Textarea
                      value={editTeamDescription}
                      onChange={(e) => {
                        setEditTeamDescription(e.target.value);
                        if (editErrors.description) setEditErrors((prev) => ({ ...prev, description: undefined }));
                      }}
                      placeholder="What is this team working on? (0 to 200 characters)"
                      className={`text-xs h-20 resize-none ${editErrors.description ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                      maxLength={200}
                    />
                    <div className="flex justify-between mt-1">
                      <p className="text-[10px] text-zinc-500">
                        Maximum 200 characters
                      </p>
                    </div>
                    {editErrors.description && (
                      <p className="text-[11px] text-rose-500 mt-1 font-medium">{editErrors.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        isSavingTeam ||
                        (editTeamName.trim() === team.name &&
                          editTeamDescription.trim() === (team.description || ""))
                      }
                      className={`bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-xl transition-all ${editTeamName.trim() === team.name &&
                        editTeamDescription.trim() === (team.description || "")
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                        }`}
                    >
                      {isSavingTeam ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditTeamName(team.name);
                        setEditTeamDescription(team.description || "");
                        setEditErrors({});
                      }}
                      className="text-xs rounded-xl cursor-pointer"
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Danger Zone */}
            <div className="rounded-2xl border border-rose-200 dark:border-rose-950/60 bg-rose-50/30 dark:bg-rose-950/10 p-5 space-y-3">
              <h3 className="font-bold text-sm text-rose-700 dark:text-rose-400">
                Team Membership
              </h3>

              {userRole !== "owner" ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-xs text-zinc-900 dark:text-white">
                      Leave Team
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      You will lose access to all shared reminders in this team.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsLeavingTeam(true)}
                    className="text-rose-600 border-rose-300 hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-950 text-xs rounded-xl cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5 mr-1" />
                    <span>Leave</span>
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-xs text-zinc-900 dark:text-white">
                      Delete Team
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Permanently removes this team, its members, and all team reminders.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeletingTeam(true)}
                    className="text-xs rounded-xl cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    <span>Delete Team</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dialog: Invite Member */}
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Invite to {team.name}</DialogTitle>
              <DialogDescription>
                Share this link via WhatsApp, Email, or copy it. Anyone with this link can join {team.name} as a member.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 p-3.5 space-y-2">
                <p className="text-xs font-semibold text-purple-900 dark:text-purple-300">
                  Team Invitation Link:
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={isLoadingInviteLink ? "Generating link..." : (generatedInviteLink || "")}
                    className="text-xs font-mono bg-white dark:bg-[#161726]"
                  />
                  <Button
                    size="sm"
                    disabled={isLoadingInviteLink || !generatedInviteLink}
                    onClick={() => generatedInviteLink && copyToClipboard(generatedInviteLink)}
                    className="bg-purple-600 hover:bg-purple-700 text-white shrink-0 cursor-pointer text-xs"
                  >
                    {hasCopiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span>{hasCopiedLink ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
              </div>

              {/* Instant Share Buttons: WhatsApp & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <a
                  href={
                    generatedInviteLink
                      ? `https://api.whatsapp.com/send?text=${encodeURIComponent(
                        `Hi,\n\nYou have been invited to join the team "${team.name}" on VoiceReminder.\n\nClick the link below to accept and join:\n\n${generatedInviteLink}\n\nLooking forward to collaborating with you!`
                      )}`
                      : "#"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!generatedInviteLink) e.preventDefault();
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-semibold text-xs h-10 px-3 shadow-2xs transition-all text-center cursor-pointer"
                >
                  <span>💬 Share via WhatsApp</span>
                </a>

                <a
                  href={
                    generatedInviteLink
                      ? `mailto:?subject=${encodeURIComponent(
                        `Invitation to join "${team.name}" on VoiceReminder`
                      )}&body=${encodeURIComponent(
                        `Hi,\n\nYou have been invited to join the team "${team.name}" on VoiceReminder.\n\nClick the link below to accept and join:\n\n${generatedInviteLink}\n\nLooking forward to collaborating with you!`
                      )}`
                      : "#"
                  }
                  onClick={(e) => {
                    if (!generatedInviteLink) e.preventDefault();
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-10 px-3 shadow-2xs transition-all text-center cursor-pointer"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Send via Email</span>
                </a>
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-zinc-100 dark:border-white/[0.06]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isResettingLink || isLoadingInviteLink}
                  onClick={handleResetInviteLink}
                  className="text-[11px] text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 p-0 h-auto cursor-pointer"
                  title="Revoke existing invite link and generate a fresh one"
                >
                  <RotateCw className={`h-3 w-3 mr-1 ${isResettingLink ? "animate-spin" : ""}`} />
                  {isResettingLink ? "Resetting link..." : "Reset Invite Link"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsInviteOpen(false)}
                  className="cursor-pointer text-xs"
                >
                  Done
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog: Confirm Remove Member */}
        <AlertDialog open={Boolean(memberToRemove)} onOpenChange={(open) => !open && setMemberToRemove(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove &quot;{memberToRemove?.name}&quot; from {team.name}? They will immediately lose access to all shared reminders and stop receiving notifications.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveMemberConfirm}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Yes, Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog: Confirm Leave Team */}
        <AlertDialog open={isLeavingTeam} onOpenChange={setIsLeavingTeam}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {team.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                You will no longer receive notifications or have access to reminders from this team.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLeaveTeamConfirm}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Leave Team
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Dialog: Confirm Delete Team */}
        <AlertDialog open={isDeletingTeam} onOpenChange={setIsDeletingTeam}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {team.name} Permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                This action CANNOT be undone. All shared reminders, member access, and scheduled notifications for this team will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteTeamConfirm}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Delete Forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ================= VIEW: MAIN TEAMS LIST =================
  return (
    <div className="space-y-6">
      {/* Pending Invitations Alert Banner for Current User */}
      {pendingUserInvites && pendingUserInvites.length > 0 && (
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-[#17182c] dark:to-[#1a172c] p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs">
              ✉️
            </span>
            <h2 className="text-sm font-bold text-zinc-900 dark:text-white">
              Team Invitations ({pendingUserInvites.length})
            </h2>
          </div>

          <div className="space-y-2.5">
            {pendingUserInvites.map((inv) => (
              <div
                key={inv._id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/90 dark:bg-[#121320] border border-indigo-100 dark:border-white/[0.06] rounded-xl p-3 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white truncate">
                    {inv.teamName}
                  </p>
                  <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    Invited by <span className="font-semibold text-zinc-700 dark:text-zinc-200">{inv.inviterName}</span> as <span className="font-semibold text-purple-600 dark:text-purple-400">{inv.role}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    size="sm"
                    onClick={() => handleAcceptInvite(inv.token)}
                    className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer"
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeclineInvite(inv.token)}
                    className="h-8 text-xs text-zinc-600 hover:text-rose-600 rounded-lg cursor-pointer"
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header Row: Title & Create Team Button */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span className="truncate">My Teams</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1 sm:line-clamp-none">
            Collaborate on shared team reminders with teammates and family
          </p>
        </div>

        <Button
          onClick={() => setIsCreateTeamOpen(true)}
          className="shrink-0 gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-9 cursor-pointer font-semibold shadow-xs"
        >
          <Plus className="h-4 w-4" />
          <span>Create Team</span>
        </Button>
      </div>

      {/* Teams Grid */}
      {myTeams === undefined ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-36 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-2xs animate-pulse dark:border-white/[0.08] dark:bg-[#151624]"
            />
          ))}
        </div>
      ) : myTeams.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 dark:border-white/[0.1] py-16 text-center p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 text-2xl mb-3">
            👥
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            No teams yet
          </h3>
          <p className="mt-1 text-xs text-zinc-500 max-w-sm">
            Create a team to share reminders with your coworkers, friends, or family. When a team reminder is due, everyone is notified together!
          </p>
          <Button
            onClick={() => setIsCreateTeamOpen(true)}
            className="mt-4 gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-xl cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Create Your First Team</span>
          </Button>
        </div>
      ) : filteredTeams && filteredTeams.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 dark:border-white/[0.1] py-16 text-center p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 text-2xl mb-3">
            🔍
          </div>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            No teams match &quot;{searchQuery}&quot;
          </h3>
          <p className="mt-1 text-xs text-zinc-500 max-w-sm">
            Try a different search term or clear your search to view all your teams.
          </p>
          {onSearchChange && (
            <Button
              variant="outline"
              onClick={() => onSearchChange("")}
              className="mt-4 gap-1.5 text-xs rounded-xl cursor-pointer"
            >
              Clear Search
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTeams?.map((t) => {
            if (!t) return null;
            return (
              <div
                key={t._id}
                onClick={() => setSelectedTeamId(t._id)}
                className="group relative flex flex-col justify-between rounded-2xl border-2 border-purple-200/90 dark:border-purple-900/40 bg-gradient-to-b from-purple-50/20 via-white to-white dark:from-purple-950/20 dark:via-[#151624] dark:to-[#151624] p-5 shadow-xs hover:shadow-md hover:border-purple-400 dark:hover:border-purple-700 transition-all cursor-pointer ring-1 ring-purple-500/10"
              >
                <div>
                  {/* Header: Role Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white font-bold text-xs shadow-sm shadow-purple-600/30">
                      {t.name.charAt(0).toUpperCase()}
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${t.userRole === "owner"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        : t.userRole === "admin"
                          ? "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                    >
                      {t.userRole === "owner" && <Crown className="h-2.5 w-2.5" />}
                      {t.userRole === "admin" && <Shield className="h-2.5 w-2.5" />}
                      {t.userRole === "member" && <User className="h-2.5 w-2.5" />}
                      <span>{t.userRole.toUpperCase()}</span>
                    </span>
                  </div>

                  <h3 className="mt-3 font-bold text-base text-zinc-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                    {t.name}
                  </h3>

                  {t.description && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      {t.description}
                    </p>
                  )}
                </div>

                {/* Footer details */}
                <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-white/[0.06] flex items-center justify-between text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>{t.memberCount} member{t.memberCount === 1 ? "" : "s"}</span>
                  </span>

                  <span className="flex items-center gap-1 font-semibold text-purple-600 dark:text-purple-400">
                    <Bell className="h-3.5 w-3.5" />
                    <span>{t.reminderCount} active</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: Create Team */}
      <Dialog open={isCreateTeamOpen} onOpenChange={setIsCreateTeamOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create a New Team</DialogTitle>
            <DialogDescription>
              Collaborate on team reminders. You will be the owner of this team.
            </DialogDescription>
          </DialogHeader>


          <form onSubmit={handleCreateTeamSubmit} className="space-y-4 py-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Team Name *
                </label>
                <span className={`text-[10px] ${newTeamName.trim().length > 50 || (newTeamName.trim().length > 0 && newTeamName.trim().length <= 2) ? "text-rose-500 font-semibold" : "text-zinc-400"}`}>
                  {newTeamName.trim().length}/50
                </span>
              </div>
              <Input
                placeholder="e.g. Marketing Team, Family, Study Group"
                value={newTeamName}
                onChange={(e) => {
                  setNewTeamName(e.target.value);
                  if (createErrors.name) setCreateErrors((prev) => ({ ...prev, name: undefined }));
                }}
                className={`text-xs ${createErrors.name ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
                maxLength={50}
                autoFocus
              />
              <div className="flex justify-between mt-1">
                <p className="text-[10px] text-zinc-500">
                  3–50 characters (greater than 2 characters)
                </p>
              </div>
              {createErrors.name && (
                <p className="text-[11px] text-rose-500 mt-1 font-medium">{createErrors.name}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Description (optional)
                </label>
                <span className={`text-[10px] ${newTeamDescription.length > 200 ? "text-rose-500 font-semibold" : "text-zinc-400"}`}>
                  {newTeamDescription.length}/200
                </span>
              </div>
              <Textarea
                maxLength={200}
                placeholder="Briefly describe the purpose of this team (0 to 200 characters)..."
                value={newTeamDescription}
                onChange={(e) => {
                  setNewTeamDescription(e.target.value);
                  if (createErrors.description) setCreateErrors((prev) => ({ ...prev, description: undefined }));
                }}
                className={`text-xs h-20 resize-none ${createErrors.description ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
              />
              <div className="flex justify-between mt-1">
                <p className="text-[10px] text-zinc-500">
                  Maximum 200 characters
                </p>
              </div>
              {createErrors.description && (
                <p className="text-[11px] text-rose-500 mt-1 font-medium">{createErrors.description}</p>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateTeamOpen(false);
                  setCreateErrors({});
                }}
                className="cursor-pointer text-xs"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={isCreatingTeam}
                className="bg-purple-600 hover:bg-purple-700 text-white cursor-pointer text-xs font-semibold"
              >
                {isCreatingTeam ? "Creating..." : "Create Team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
