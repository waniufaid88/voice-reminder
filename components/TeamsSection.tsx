"use client";

import { useState, useEffect } from "react";
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
  Trash2,
  LogOut,
  Settings,
  Bell,
  ArrowLeft,
  X,
  ExternalLink,
  Calendar,
  Mic,
  Square,
  RotateCcw,
  UserPlus,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ItemRecord } from "./ItemCard";
import { TabBasedReminderDashboard } from "./TabBasedReminderDashboard";
import { DateTimePicker12h } from "./DateTimePicker12h";
import { RecurrenceSelector } from "./RecurrenceSelector";
import { AudioPlayer } from "./AudioPlayer";
import { formatLocalDatetime, parseLocalDatetime } from "@/lib/date-utils";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
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
}

export function TeamsSection({
  user,
  currentTime,
  onEditItem,
  onAddTeamReminder,
}: TeamsSectionProps) {
  const userId = user._id as Id<"users">;

  // Active Team Navigation State
  const [selectedTeamId, setSelectedTeamId] = useState<Id<"teams"> | null>(null);
  const [activeTeamSubTab, setActiveTeamSubTab] = useState<
    "reminders" | "members" | "invitations" | "settings"
  >("reminders");

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

  const [isEditTeamOpen, setIsEditTeamOpen] = useState(false);
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDescription, setEditTeamDescription] = useState("");
  const [isSavingTeam, setIsSavingTeam] = useState(false);

  const [memberToRemove, setMemberToRemove] = useState<{
    userId: Id<"users">;
    name: string;
  } | null>(null);
  const [isLeavingTeam, setIsLeavingTeam] = useState(false);
  const [isDeletingTeam, setIsDeletingTeam] = useState(false);

  // Add Team Reminder Dialog state (supports separate Voice and Text options)
  const [isAddReminderOpen, setIsAddReminderOpen] = useState(false);
  const [reminderType, setReminderType] = useState<"text" | "voice">("text");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderContent, setReminderContent] = useState("");
  const [reminderDueDateString, setReminderDueDateString] = useState("");
  const [reminderRecurrenceMode, setReminderRecurrenceMode] = useState<"once" | "daily" | "custom">("once");
  const [reminderRecurrenceDays, setReminderRecurrenceDays] = useState<number[]>([new Date().getDay()]);
  const [isSavingReminder, setIsSavingReminder] = useState(false);

  // Voice recording state for Team Voice Reminders
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioDuration, setRecordedAudioDuration] = useState<number>(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Email tracking for instant WhatsApp/Email sharing
  const [lastInvitedEmail, setLastInvitedEmail] = useState("");

  const {
    isRecording,
    formattedTime,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

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

  const handleOpenAddReminder = (type: "text" | "voice" = "text") => {
    // Automatically show the current time instead of two hours ahead
    const defaultTime = formatLocalDatetime(Date.now());
    setReminderDueDateString(defaultTime);
    setReminderTitle("");
    setReminderContent("");
    setReminderType(type);
    setReminderRecurrenceMode("once");
    setReminderRecurrenceDays([new Date().getDay()]);
    setRecordedAudioBlob(null);
    setRecordedAudioDuration(0);
    setRecordedAudioUrl(null);
    setIsAddReminderOpen(true);
  };

  const handleStopVoiceRecording = async () => {
    setIsTranscribing(true);
    try {
      const result = await stopRecording();
      if (!result || result.blob.size === 0) {
        setIsTranscribing(false);
        return;
      }
      setRecordedAudioBlob(result.blob);
      setRecordedAudioDuration(result.duration);
      setRecordedAudioUrl(result.url);

      // Transcribe via /api/ai/process
      const formData = new FormData();
      const rawMime = (result.blob.type || "").toLowerCase();
      let filename = "voice-recording.webm";
      let cleanType = "audio/webm";
      if (rawMime.includes("mp4") || rawMime.includes("m4a")) {
        filename = "voice-recording.mp4";
        cleanType = "audio/mp4";
      } else if (rawMime.includes("wav")) {
        filename = "voice-recording.wav";
        cleanType = "audio/wav";
      }
      const sanitizedBlob = new Blob([result.blob], { type: cleanType });
      formData.append("audio", sanitizedBlob, filename);
      formData.append("fallbackText", (result.browserTranscript || "").trim());
      formData.append("clientTimezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

      const resp = await fetch("/api/ai/process", {
        method: "POST",
        body: formData,
      });

      if (resp.ok) {
        const json = await resp.json();
        if (json.data) {
          if (json.data.title) setReminderTitle(json.data.title);
          if (json.data.content) setReminderContent(json.data.content);
          if (json.data.dueDateLocal) setReminderDueDateString(json.data.dueDateLocal);
          if (json.data.recurrenceMode) setReminderRecurrenceMode(json.data.recurrenceMode);
        }
      } else if (result.browserTranscript?.trim()) {
        setReminderTitle(result.browserTranscript.trim());
      }
    } catch (err) {
      console.warn("Voice transcription fallback:", err);
      toast("Voice recorded! You can adjust title and time.");
    } finally {
      setIsTranscribing(false);
    }
  };

  // Convex Queries
  const myTeams = useQuery(api.teams.getMyTeams, { userId });
  const pendingUserInvites = useQuery(api.teams.getPendingInvitationsForUser, {
    email: user.email,
  });

  const teamDetails = useQuery(
    api.teams.getTeamDetails,
    selectedTeamId ? { teamId: selectedTeamId, userId } : "skip"
  );

  // Convex Mutations
  const createItem = useMutation(api.items.create);
  const generateUploadUrl = useMutation(api.items.generateUploadUrl);
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

  // Handlers
  const handleCreateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      toast.error("Please enter a team name");
      return;
    }
    setIsCreatingTeam(true);
    try {
      const teamId = await createTeam({
        userId,
        name: newTeamName.trim(),
        description: newTeamDescription.trim() || undefined,
      });
      toast.success("Team created successfully! 🎉");
      setNewTeamName("");
      setNewTeamDescription("");
      setIsCreateTeamOpen(false);
      setSelectedTeamId(teamId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create team";
      toast.error(msg);
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleCreateReminderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderTitle.trim()) {
      toast.error("Please enter a reminder title");
      return;
    }
    if (!selectedTeamId) return;

    setIsSavingReminder(true);
    try {
      let audioStorageId: Id<"_storage"> | undefined = undefined;
      if (recordedAudioBlob) {
        try {
          const postUrl = await generateUploadUrl();
          const uploadRes = await fetch(postUrl, {
            method: "POST",
            headers: { "Content-Type": recordedAudioBlob.type || "audio/webm" },
            body: recordedAudioBlob,
          });
          const uploadJson = await uploadRes.json();
          audioStorageId = uploadJson.storageId as Id<"_storage">;
        } catch (uploadErr) {
          console.error("Audio storage upload failed:", uploadErr);
        }
      }

      const dueDate = parseLocalDatetime(reminderDueDateString);
      await createItem({
        userId,
        teamId: selectedTeamId,
        creatorName: user.name || "Member",
        type: "reminder",
        title: reminderTitle.trim(),
        content: reminderContent.trim(),
        dueDate,
        isDaily: reminderRecurrenceMode === "daily",
        recurrenceMode: reminderRecurrenceMode,
        recurrenceDays:
          reminderRecurrenceMode === "custom" ? reminderRecurrenceDays : undefined,
        tags: ["#team", ...(recordedAudioBlob ? ["#voice"] : [])],
        audioStorageId,
        audioDuration: recordedAudioDuration || undefined,
        reminderStatus: "pending",
      });

      toast.success(recordedAudioBlob ? "Team voice reminder added! 🎤" : "Team reminder added! ⏰");
      setIsAddReminderOpen(false);
      setReminderTitle("");
      setReminderContent("");
      setRecordedAudioBlob(null);
      setRecordedAudioUrl(null);
      setRecordedAudioDuration(0);
      onAddTeamReminder?.(selectedTeamId);
    } catch (err) {
      console.error("Failed to add team reminder:", err);
      toast.error("Failed to add team reminder");
    } finally {
      setIsSavingReminder(false);
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

      const inviteUrl = `${window.location.origin}/invite/${res.token}`;
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
    if (!selectedTeamId || !editTeamName.trim()) return;
    setIsSavingTeam(true);
    try {
      await updateTeam({
        teamId: selectedTeamId,
        userId,
        name: editTeamName.trim(),
        description: editTeamDescription.trim() || undefined,
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
          <div className="rounded-2xl border-2 border-purple-300/80 dark:border-purple-800/60 bg-gradient-to-r from-purple-100/70 via-indigo-50/50 to-purple-50/70 dark:from-purple-950/40 dark:via-[#161726] dark:to-[#1a1528] p-3 sm:p-4 shadow-xs">
            <div className="flex flex-row items-center justify-between gap-2 sm:gap-3">
              {/* Team Information */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  <span className="inline-flex items-center gap-1 rounded-md bg-purple-600 text-white px-2 py-0.5 text-[9px] sm:text-[10px] font-bold shadow-2xs">
                    👥 TEAM
                  </span>
                  <h1 className="text-base sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-white truncate min-w-0">
                    {team.name}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-md text-[9px] sm:text-[11px] font-semibold shrink-0 ${userRole === "owner"
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60"
                      : userRole === "admin"
                        ? "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300/60"
                        : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-300/60"
                      }`}
                  >
                    {userRole === "owner" && <Crown className="h-3 w-3" />}
                    {userRole === "admin" && <Shield className="h-3 w-3" />}
                    {userRole === "member" && <User className="h-3 w-3" />}
                    <span>{userRole.toUpperCase()}</span>
                  </span>
                </div>

              </div>

              {/* Quick Actions Header Buttons: Separate Voice and Text options */}
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-nowrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenAddReminder("voice")}
                  className="flex-none gap-1 text-[10px] sm:text-xs rounded-xl h-8 sm:h-9 border-purple-300 dark:border-purple-700/60 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/50 cursor-pointer font-semibold whitespace-nowrap px-2 sm:px-3 shadow-2xs"
                  title="Record a voice reminder for this team"
                >
                  <Mic className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                  <span>Voice Reminder</span>
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleOpenAddReminder("text")}
                  className="flex-none gap-1 text-[10px] sm:text-xs bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-8 sm:h-9 shadow-xs cursor-pointer font-semibold whitespace-nowrap px-2 sm:px-3"
                  title="Create a text reminder for this team"
                >
                  <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span>Text Reminder</span>
                </Button>
              </div>
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
              onEdit={onEditItem}
              title={`${team.name} Reminders`}
              hideIfEmpty={false}
            />
          </div>
        )}

        {/* Tab 2: Members List */}
        {activeTeamSubTab === "members" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Team Members ({members.length})
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

            <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#151624] divide-y divide-zinc-200/70 dark:divide-white/[0.06] overflow-hidden">
              {members.map((m) => {
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
          </div>
        )}

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
                  const inviteLink = `${window.location.origin}/invite/${inv.token}`;
                  const waUrl = `https://wa.me/?text=${encodeURIComponent(
                    `Hey! You have been invited to join the team "${team.name}" on VoiceReminder to collaborate on reminders.\n\nClick this secure link to accept: ${inviteLink}`
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

                <form onSubmit={handleUpdateTeamSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Team Name
                    </label>
                    <Input
                      value={editTeamName || team.name}
                      onChange={(e) => setEditTeamName(e.target.value)}
                      placeholder="e.g. Design Team"
                      className="text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                      Description (optional)
                    </label>
                    <Textarea
                      value={editTeamDescription !== "" ? editTeamDescription : (team.description || "")}
                      onChange={(e) => setEditTeamDescription(e.target.value)}
                      placeholder="What is this team working on?"
                      className="text-xs h-20"
                    />
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSavingTeam}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-xl cursor-pointer"
                  >
                    {isSavingTeam ? "Saving..." : "Save Changes"}
                  </Button>
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
              <DialogTitle>Invite Member to {team.name}</DialogTitle>
              <DialogDescription>
                Send an invitation. The recipient can join via WhatsApp or Email and sign in to collaborate.
              </DialogDescription>
            </DialogHeader>

            {generatedInviteLink ? (
              <div className="space-y-4 py-2">
                <div className="rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/40 p-3.5 space-y-2">
                  <p className="text-xs font-semibold text-purple-900 dark:text-purple-300">
                    Secure Invitation Link Generated:
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={generatedInviteLink}
                      className="text-xs font-mono bg-white dark:bg-[#161726]"
                    />
                    <Button
                      size="sm"
                      onClick={() => copyToClipboard(generatedInviteLink)}
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
                    href={`https://wa.me/?text=${encodeURIComponent(
                      `Hey! You have been invited to join the team "${team.name}" on VoiceReminder to collaborate on reminders.\n\nClick this secure link to accept: ${generatedInviteLink}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-semibold text-xs h-10 px-3 shadow-2xs transition-all text-center cursor-pointer"
                  >
                    <span>💬 Share via WhatsApp</span>
                  </a>

                  <a
                    href={`mailto:${lastInvitedEmail || ""}?subject=${encodeURIComponent(
                      `Invitation to join "${team.name}" on VoiceReminder`
                    )}&body=${encodeURIComponent(
                      `Hi,\n\nI've invited you to join "${team.name}" on VoiceReminder as a ${inviteRole}.\n\nClick the link below to accept your invitation:\n${generatedInviteLink}\n\nLooking forward to collaborating with you!`
                    )}`}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-10 px-3 shadow-2xs transition-all text-center cursor-pointer"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Send Email</span>
                  </a>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setGeneratedInviteLink(null);
                      setIsInviteOpen(false);
                    }}
                    className="cursor-pointer w-full text-xs"
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4 py-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Email Address *
                  </label>
                  <Input
                    type="email"
                    required
                    placeholder="teammate@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Role
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInviteRole("member")}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${inviteRole === "member"
                        ? "border-purple-600 bg-purple-50/50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300"
                        : "border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400"
                        }`}
                    >
                      <p className="font-bold text-xs">Member</p>
                      <p className="text-[10px] mt-0.5 opacity-80">
                        View and manage team reminders
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInviteRole("admin")}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${inviteRole === "admin"
                        ? "border-purple-600 bg-purple-50/50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300"
                        : "border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400"
                        }`}
                    >
                      <p className="font-bold text-xs">Admin</p>
                      <p className="text-[10px] mt-0.5 opacity-80">
                        Can invite & manage team members
                      </p>
                    </button>
                  </div>
                </div>

                <DialogFooter className="pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsInviteOpen(false)}
                    className="cursor-pointer text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isInviting || !inviteEmail.trim()}
                    className="bg-purple-600 hover:bg-purple-700 text-white cursor-pointer text-xs font-semibold"
                  >
                    {isInviting ? "Generating..." : "Generate Invite Link"}
                  </Button>
                </DialogFooter>
              </form>
            )}
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

        {/* Dialog: Add Team Reminder (Separate Voice and Text options) */}
        <Dialog open={isAddReminderOpen} onOpenChange={setIsAddReminderOpen}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-white text-xs">
                  {reminderType === "voice" ? "🎤" : "⏰"}
                </span>
                <span>
                  {reminderType === "voice" ? "Add Team Voice Reminder" : "Add Team Text Reminder"}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                This reminder will be shared with all members of <strong>{team.name}</strong>.
              </DialogDescription>
            </DialogHeader>

            {/* Type Selector: Text vs Voice */}
            <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-[#161726] border border-zinc-200/80 dark:border-white/[0.08]">
              <button
                type="button"
                onClick={() => setReminderType("text")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${reminderType === "text"
                  ? "bg-white text-purple-700 shadow-2xs dark:bg-[#202135] dark:text-purple-300"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
              >
                <span>📝 Text Reminder</span>
              </button>
              <button
                type="button"
                onClick={() => setReminderType("voice")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${reminderType === "voice"
                  ? "bg-white text-purple-700 shadow-2xs dark:bg-[#202135] dark:text-purple-300"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
              >
                <Mic className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                <span>🎤 Voice Reminder</span>
              </button>
            </div>

            <form onSubmit={handleCreateReminderSubmit} className="space-y-4 py-1">
              {/* Voice Recorder Component (shown in voice mode) */}
              {reminderType === "voice" && (
                <div className="rounded-2xl border-2 border-purple-200/90 dark:border-purple-900/50 bg-purple-50/30 dark:bg-purple-950/20 p-4 space-y-3">
                  {isRecording ? (
                    <div className="flex flex-col items-center justify-center py-3 space-y-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/40 animate-pulse">
                        <Mic className="h-6 w-6" />
                      </div>
                      <div className="text-center">
                        <span className="font-mono text-base font-bold text-rose-600 dark:text-rose-400">
                          {formattedTime}
                        </span>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Recording team voice reminder... Speak clearly</p>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={cancelRecording}
                          className="rounded-xl text-xs h-8"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleStopVoiceRecording}
                          className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3.5 h-8 gap-1.5"
                        >
                          <Square className="h-3 w-3 fill-current" />
                          <span>Done Speaking</span>
                        </Button>
                      </div>
                    </div>
                  ) : recordedAudioUrl ? (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                          <span>🎤 Voice Note Attached</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRecordedAudioBlob(null);
                            setRecordedAudioUrl(null);
                            setRecordedAudioDuration(0);
                          }}
                          className="text-xs text-zinc-400 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Re-record</span>
                        </button>
                      </div>
                      <AudioPlayer src={recordedAudioUrl} initialDuration={recordedAudioDuration} />
                      {isTranscribing && (
                        <p className="text-xs text-purple-600 dark:text-purple-400 animate-pulse flex items-center gap-1">
                          <span>Transcribing voice audio & extracting details...</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-3 space-y-2.5 text-center">
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        title="Start voice recording"
                      >
                        <Mic className="h-6 w-6" />
                      </button>
                      <div>
                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                          Tap mic to record voice reminder
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Say e.g. &quot;Submit project report tomorrow at 11am&quot;
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Reminder Title *
                </label>
                <Input
                  required
                  placeholder={
                    reminderType === "voice"
                      ? "e.g. Discuss Q3 roadmap (or speak above)"
                      : "e.g. Sprint Planning, Project Review, Pay Utility Bill"
                  }
                  value={reminderTitle}
                  onChange={(e) => setReminderTitle(e.target.value)}
                  className="text-xs"
                  autoFocus={reminderType === "text"}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Details / Content (optional)
                </label>
                <Textarea
                  placeholder="Add extra context, notes, or links for the team..."
                  value={reminderContent}
                  onChange={(e) => setReminderContent(e.target.value)}
                  className="text-xs h-20"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Due Date & Time
                </label>
                <DateTimePicker12h
                  value={reminderDueDateString}
                  onChange={setReminderDueDateString}
                />
              </div>

              <RecurrenceSelector
                mode={reminderRecurrenceMode}
                selectedDays={reminderRecurrenceDays}
                onChangeMode={setReminderRecurrenceMode}
                onChangeDays={setReminderRecurrenceDays}
              />

              <DialogFooter className="pt-2 gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (isRecording) cancelRecording();
                    setIsAddReminderOpen(false);
                  }}
                  className="cursor-pointer text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingReminder || !reminderTitle.trim() || isRecording}
                  className="bg-purple-600 hover:bg-purple-700 text-white cursor-pointer text-xs font-semibold"
                >
                  {isSavingReminder
                    ? "Adding..."
                    : reminderType === "voice"
                      ? "Add Voice Reminder"
                      : "Add Reminder"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
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
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myTeams.map((t) => {
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
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Team Name *
              </label>
              <Input
                required
                placeholder="e.g. Marketing Team, Family, Study Group"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                className="text-xs"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Description (optional)
              </label>
              <Textarea
                placeholder="Briefly describe the purpose of this team..."
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
                className="text-xs h-20"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateTeamOpen(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreatingTeam}
                className="bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
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
