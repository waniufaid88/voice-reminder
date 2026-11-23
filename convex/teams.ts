import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

/**
 * Helper to check if a user is a member of a team and return their membership record.
 */
async function getMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  teamId: Id<"teams">,
  userId: Id<"users">
) {
  return await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId_userId", (q: any) =>
      q.eq("teamId", teamId).eq("userId", userId)
    )
    .first();
}

/**
 * Returns the calling user's role in a team ('owner' | 'admin' | 'member' | null).
 */
export const getUserTeamRole = query({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.teamId, args.userId);
    if (membership) {
      return membership.role;
    }
    const team = await ctx.db.get(args.teamId);
    if (team && team.createdById === args.userId) {
      return "owner" as const;
    }
    return null;
  },
});

/**
 * Lightweight query to fetch available team names and IDs for a user.
 * Efficiently supports 100+ teams by avoiding member/reminder counts.
 */
export const getUserTeamsList = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const teams: Array<{ _id: Id<"teams">; name: string }> = [];
    for (const m of memberships) {
      const team = await ctx.db.get(m.teamId);
      if (team) {
        teams.push({
          _id: team._id,
          name: team.name,
        });
      }
    }
    return teams.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Creates a new team and assigns the creator as the Owner.
 */
export const createTeam = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const trimmedName = args.name.trim();
    if (trimmedName.length <= 2) {
      throw new Error("Team name must be greater than 2 characters (at least 3 characters).");
    }
    if (trimmedName.length > 50) {
      throw new Error("Team name must not exceed 50 characters.");
    }

    const trimmedDescription = args.description ? args.description.trim() : undefined;
    if (trimmedDescription && trimmedDescription.length > 200) {
      throw new Error("Team description must not exceed 200 characters.");
    }

    const now = Date.now();
    const randomHex = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const inviteCode = `${now}-${randomHex}`;

    const teamId = await ctx.db.insert("teams", {
      name: trimmedName,
      description: trimmedDescription || undefined,
      createdById: args.userId,
      inviteCode,
      createdAt: now,
      updatedAt: now,
    });

    // Creator becomes the team owner
    await ctx.db.insert("teamMembers", {
      teamId,
      userId: args.userId,
      role: "owner",
      joinedAt: now,
    });

    return teamId;
  },
});

/**
 * Returns all teams the user belongs to, including member count, reminder count, and user's role.
 */
export const getMyTeams = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("teamMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const teamsWithDetails = await Promise.all(
      memberships.map(async (m) => {
        const team = await ctx.db.get(m.teamId);
        if (!team) return null;

        // Count members
        const allMembers = await ctx.db
          .query("teamMembers")
          .withIndex("by_teamId", (q) => q.eq("teamId", m.teamId))
          .collect();

        // Count active team reminders
        const teamReminders = await ctx.db
          .query("items")
          .withIndex("by_teamId_type", (q) =>
            q.eq("teamId", m.teamId).eq("type", "reminder")
          )
          .collect();

        const pendingReminders = teamReminders.filter(
          (r) => r.reminderStatus === "pending"
        );

        return {
          ...team,
          userRole: m.role,
          memberCount: allMembers.length,
          reminderCount: pendingReminders.length,
          totalReminders: teamReminders.length,
        };
      })
    );

    return teamsWithDetails.filter((t): t is NonNullable<typeof t> => t !== null);
  },
});

/**
 * Fetches detailed team information including members, invitations (if owner/admin), and user role.
 */
export const getTeamDetails = query({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.teamId, args.userId);
    if (!membership) {
      throw new Error("You are not a member of this team.");
    }

    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found.");

    // Fetch all members with their user info
    const memberRecords = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .collect();

    const members = await Promise.all(
      memberRecords.map(async (mr) => {
        const u = await ctx.db.get(mr.userId);
        return {
          _id: mr._id,
          userId: mr.userId,
          name: u?.name || "Unknown User",
          email: u?.email || "",
          role: mr.role,
          joinedAt: mr.joinedAt,
        };
      })
    );

    // Fetch pending invitations if caller is Owner or Admin
    let pendingInvitations: Array<{
      _id: Id<"teamInvitations">;
      invitedEmail: string;
      role: "admin" | "member";
      token: string;
      expiresAt: number;
      createdAt: number;
    }> = [];

    if (membership.role === "owner" || membership.role === "admin") {
      const invites = await ctx.db
        .query("teamInvitations")
        .withIndex("by_teamId_status", (q) =>
          q.eq("teamId", args.teamId).eq("status", "pending")
        )
        .collect();

      const now = Date.now();
      pendingInvitations = invites
        .filter((inv) => inv.expiresAt > now)
        .map((inv) => ({
          _id: inv._id,
          invitedEmail: inv.invitedEmail,
          role: inv.role,
          token: inv.token,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        }));
    }

    return {
      team,
      userRole: membership.role,
      members,
      pendingInvitations,
    };
  },
});

/**
 * Updates team name and/or description. Accessible by Owners and Admins.
 */
export const updateTeam = mutation({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.teamId, args.userId);
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Only team owners and admins can update team details.");
    }

    const trimmedName = args.name.trim();
    if (trimmedName.length <= 2) {
      throw new Error("Team name must be greater than 2 characters (at least 3 characters).");
    }
    if (trimmedName.length > 50) {
      throw new Error("Team name must not exceed 50 characters.");
    }

    const trimmedDescription = args.description ? args.description.trim() : undefined;
    if (trimmedDescription && trimmedDescription.length > 200) {
      throw new Error("Team description must not exceed 200 characters.");
    }

    await ctx.db.patch(args.teamId, {
      name: trimmedName,
      description: trimmedDescription || undefined,
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Deletes a team, its memberships, invitations, and cancels reminder scheduled jobs. Accessible by Owner only.
 */
export const deleteTeam = mutation({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.teamId, args.userId);
    if (!membership || membership.role !== "owner") {
      throw new Error("Only the team owner can delete this team.");
    }

    // 1. Delete all team items & cancel reminder scheduled jobs
    const teamItems = await ctx.db
      .query("items")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .collect();

    for (const item of teamItems) {
      if (item.scheduledJobId) {
        try {
          await ctx.scheduler.cancel(item.scheduledJobId);
        } catch {
          // Ignore if already executed/cancelled
        }
      }
      await ctx.db.delete(item._id);
    }

    // 2. Delete team members
    const members = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .collect();

    for (const m of members) {
      await ctx.db.delete(m._id);
    }

    // 3. Delete team invitations
    const invites = await ctx.db
      .query("teamInvitations")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .collect();

    for (const inv of invites) {
      await ctx.db.delete(inv._id);
    }

    // 4. Delete the team itself
    await ctx.db.delete(args.teamId);
    return true;
  },
});

/**
 * Allows a member or admin to leave a team. Owners must delete the team or transfer ownership.
 */
export const leaveTeam = mutation({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const membership = await getMembership(ctx, args.teamId, args.userId);
    if (!membership) {
      throw new Error("You are not a member of this team.");
    }

    if (membership.role === "owner") {
      throw new Error("Team owner cannot leave without deleting the team or transferring ownership.");
    }

    await ctx.db.delete(membership._id);
    return true;
  },
});

/**
 * Promotes or demotes a team member. Accessible by Owner only.
 */
export const updateMemberRole = mutation({
  args: {
    teamId: v.id("teams"),
    requestingUserId: v.id("users"),
    targetUserId: v.id("users"),
    newRole: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const requester = await getMembership(ctx, args.teamId, args.requestingUserId);
    if (!requester || requester.role !== "owner") {
      throw new Error("Only team owners can change member roles.");
    }

    if (args.requestingUserId === args.targetUserId) {
      throw new Error("Cannot change your own owner role here.");
    }

    const targetMembership = await getMembership(ctx, args.teamId, args.targetUserId);
    if (!targetMembership) {
      throw new Error("Target user is not a member of this team.");
    }

    await ctx.db.patch(targetMembership._id, {
      role: args.newRole,
    });

    return true;
  },
});

/**
 * Removes a member from the team.
 * - Owners can remove any member or admin.
 * - Admins can remove standard members (not other admins or owners).
 */
export const removeMember = mutation({
  args: {
    teamId: v.id("teams"),
    requestingUserId: v.id("users"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const requester = await getMembership(ctx, args.teamId, args.requestingUserId);
    if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
      throw new Error("Only team owners and admins can remove members.");
    }

    if (args.requestingUserId === args.targetUserId) {
      throw new Error("To leave the team, please use the Leave Team option.");
    }

    const targetMembership = await getMembership(ctx, args.teamId, args.targetUserId);
    if (!targetMembership) {
      throw new Error("Target user is not a member of this team.");
    }

    if (targetMembership.role === "owner") {
      throw new Error("The team owner cannot be removed.");
    }

    if (requester.role === "admin" && targetMembership.role === "admin") {
      throw new Error("Admins cannot remove other admins. Only the owner can.");
    }

    await ctx.db.delete(targetMembership._id);
    return true;
  },
});

/**
 * Creates an invitation for a member or admin via email. Generates a secure token.
 */
export const createInvitation = mutation({
  args: {
    teamId: v.id("teams"),
    invitedById: v.id("users"),
    invitedEmail: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  handler: async (ctx, args) => {
    const requester = await getMembership(ctx, args.teamId, args.invitedById);
    if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
      throw new Error("Only team owners and admins can invite new members.");
    }

    const email = args.invitedEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("Please enter a valid email address.");
    }

    // Check if user is already a member
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingUser) {
      const isAlreadyMember = await getMembership(ctx, args.teamId, existingUser._id);
      if (isAlreadyMember) {
        throw new Error("This user is already a member of this team.");
      }
    }

    // Check for existing pending invitation
    const existingInvites = await ctx.db
      .query("teamInvitations")
      .withIndex("by_teamId_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "pending")
      )
      .collect();

    for (const inv of existingInvites) {
      if (inv.invitedEmail.toLowerCase() === email) {
        // Cancel the prior invite to supersede with the new one
        await ctx.db.patch(inv._id, { status: "cancelled", updatedAt: Date.now() });
      }
    }

    // Generate secure random token
    const randomHex = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const token = `${Date.now()}-${randomHex}`;

    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    const invitationId = await ctx.db.insert("teamInvitations", {
      teamId: args.teamId,
      invitedEmail: email,
      invitedById: args.invitedById,
      role: args.role,
      token,
      status: "pending",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return {
      invitationId,
      token,
      invitedEmail: email,
      role: args.role,
      expiresAt,
    };
  },
});

/**
 * Cancels a pending invitation.
 */
export const cancelInvitation = mutation({
  args: {
    invitationId: v.id("teamInvitations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.invitationId);
    if (!invite) throw new Error("Invitation not found.");

    const requester = await getMembership(ctx, invite.teamId, args.userId);
    if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
      throw new Error("Only team owners and admins can cancel invitations.");
    }

    await ctx.db.patch(args.invitationId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Retrieves the team's reusable invite code. If it doesn't exist, generates one and saves it.
 * Only owners and admins can access or share the invite link.
 */
export const getOrCreateTeamInviteCode = mutation({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const requester = await getMembership(ctx, args.teamId, args.userId);
    if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
      throw new Error("Only team owners and admins can access or share the invite link.");
    }

    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found.");

    if (team.inviteCode) {
      return { inviteCode: team.inviteCode };
    }

    const randomHex = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const inviteCode = `${Date.now()}-${randomHex}`;

    await ctx.db.patch(team._id, {
      inviteCode,
      updatedAt: Date.now(),
    });

    return { inviteCode };
  },
});

/**
 * Regenerates the team's reusable invite code, invalidating any previous invite link.
 * Only owners and admins can reset the invite link.
 */
export const regenerateTeamInviteCode = mutation({
  args: {
    teamId: v.id("teams"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const requester = await getMembership(ctx, args.teamId, args.userId);
    if (!requester || (requester.role !== "owner" && requester.role !== "admin")) {
      throw new Error("Only team owners and admins can reset the invite link.");
    }

    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found.");

    const randomHex = Array.from({ length: 24 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const inviteCode = `${Date.now()}-${randomHex}`;

    await ctx.db.patch(team._id, {
      inviteCode,
      updatedAt: Date.now(),
    });

    return { inviteCode };
  },
});

/**
 * Public query to look up invitation details by token or team inviteCode.
 */
export const getInvitationByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // 1. Check if token matches a team's reusable inviteCode
    const team = await ctx.db
      .query("teams")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", args.token))
      .first();

    if (team) {
      const owner = await ctx.db.get(team.createdById);
      const members = await ctx.db
        .query("teamMembers")
        .withIndex("by_teamId", (q) => q.eq("teamId", team._id))
        .collect();

      return {
        invitationId: null as Id<"teamInvitations"> | null,
        teamId: team._id,
        teamName: team.name,
        teamDescription: team.description,
        invitedEmail: null as string | null,
        inviterName: owner?.name || "Team Owner",
        role: "member" as const,
        status: "pending" as const,
        isExpired: false,
        expiresAt: null as number | null,
        isReusableLink: true,
        memberCount: members.length,
      };
    }

    // 2. Individual invitation lookup
    const invite = await ctx.db
      .query("teamInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invite) return null;

    const invitedTeam = await ctx.db.get(invite.teamId);
    if (!invitedTeam) return null;

    const inviter = await ctx.db.get(invite.invitedById);
    const now = Date.now();
    const isExpired = invite.expiresAt <= now;

    return {
      invitationId: invite._id,
      teamId: invite.teamId,
      teamName: invitedTeam.name,
      teamDescription: invitedTeam.description,
      invitedEmail: invite.invitedEmail,
      inviterName: inviter?.name || "A team member",
      role: invite.role,
      status: invite.status,
      isExpired,
      expiresAt: invite.expiresAt,
      isReusableLink: false,
      memberCount: undefined,
    };
  },
});

/**
 * Accepts an invitation (handles both reusable team invite links and email invitations).
 */
export const acceptInvitation = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // 1. Check if token matches a team's reusable inviteCode
    const team = await ctx.db
      .query("teams")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", args.token))
      .first();

    if (team) {
      const user = await ctx.db.get(args.userId);
      if (!user) throw new Error("User not found.");

      const existingMembership = await getMembership(ctx, team._id, args.userId);
      if (existingMembership) {
        return { success: true, teamId: team._id, alreadyMember: true };
      }

      await ctx.db.insert("teamMembers", {
        teamId: team._id,
        userId: args.userId,
        role: "member",
        joinedAt: Date.now(),
      });

      return { success: true, teamId: team._id, alreadyMember: false };
    }

    // 2. Individual email invitation logic
    const invite = await ctx.db
      .query("teamInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invite) {
      throw new Error("Invitation not found or link is invalid.");
    }

    if (invite.status !== "pending") {
      throw new Error(`This invitation has already been ${invite.status}.`);
    }

    const now = Date.now();
    if (invite.expiresAt <= now) {
      await ctx.db.patch(invite._id, { status: "expired", updatedAt: now });
      throw new Error("This invitation link has expired. Please request a new invite.");
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found.");

    // Strict email match requirement for individual invites
    if (user.email.toLowerCase() !== invite.invitedEmail.toLowerCase()) {
      throw new Error(
        `This invitation was sent to ${invite.invitedEmail}. You are signed in as ${user.email}. Please sign in with ${invite.invitedEmail} to accept.`
      );
    }

    // Check if user is already a member
    const existingMembership = await getMembership(ctx, invite.teamId, args.userId);
    if (!existingMembership) {
      await ctx.db.insert("teamMembers", {
        teamId: invite.teamId,
        userId: args.userId,
        role: invite.role,
        joinedAt: now,
      });
    }

    // Mark invitation as accepted
    await ctx.db.patch(invite._id, {
      status: "accepted",
      updatedAt: now,
    });

    return { success: true, teamId: invite.teamId, alreadyMember: Boolean(existingMembership) };
  },
});

/**
 * Declines an invitation.
 */
export const declineInvitation = mutation({
  args: {
    token: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // If reusable team link, declining is just a no-op success
    const team = await ctx.db
      .query("teams")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", args.token))
      .first();

    if (team) {
      return { success: true };
    }

    const invite = await ctx.db
      .query("teamInvitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!invite) throw new Error("Invitation not found.");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found.");

    if (user.email.toLowerCase() !== invite.invitedEmail.toLowerCase()) {
      throw new Error("You can only decline invitations addressed to your email.");
    }

    await ctx.db.patch(invite._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Queries pending invitations for the logged-in user by their email address.
 */
export const getPendingInvitationsForUser = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.trim().toLowerCase();
    if (!normalizedEmail) return [];

    const invites = await ctx.db
      .query("teamInvitations")
      .withIndex("by_invitedEmail_status", (q) =>
        q.eq("invitedEmail", normalizedEmail).eq("status", "pending")
      )
      .collect();

    const now = Date.now();
    const activeInvites = invites.filter((inv) => inv.expiresAt > now);

    const detailedInvites = await Promise.all(
      activeInvites.map(async (inv) => {
        const team = await ctx.db.get(inv.teamId);
        const inviter = await ctx.db.get(inv.invitedById);
        return {
          _id: inv._id,
          teamId: inv.teamId,
          teamName: team?.name || "A Team",
          teamDescription: team?.description,
          role: inv.role,
          token: inv.token,
          inviterName: inviter?.name || "A team member",
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        };
      })
    );

    return detailedInvites;
  },
});
