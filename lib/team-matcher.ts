/**
 * Team destination matcher for voice and text reminders.
 * Matches team names mentioned in user voice transcripts or typed text against
 * the user's available teams (supporting 100+ teams).
 */

export interface TeamInfo {
  id: string;
  name: string;
}

export interface TeamMatchResult {
  teamId: string | null;
  teamName: string | null;
  isAmbiguous: boolean;
  ambiguousTeams: TeamInfo[];
  cleanedText?: string;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Identifies if a reminder destination targets an existing team.
 *
 * Rules:
 * 1. Exact / strong matches take highest priority (e.g. "in Friends", "for Office", "ABC:").
 * 2. If multiple teams match identically or with equal confidence, flags as ambiguous.
 * 3. Cleans destination phrasing from the reminder text so the title stays clean.
 */
export function matchTeamDestination(
  rawText: string,
  availableTeams: TeamInfo[]
): TeamMatchResult {
  if (!rawText || !availableTeams || availableTeams.length === 0) {
    return {
      teamId: null,
      teamName: null,
      isAmbiguous: false,
      ambiguousTeams: [],
    };
  }

  const normalizedInput = rawText.trim();
  const lowerInput = normalizedInput.toLowerCase();

  // Sort teams by name length descending so longer/more specific names match first
  // e.g. "Office NYC" matches before "Office"
  const sortedTeams = [...availableTeams].sort(
    (a, b) => b.name.trim().length - a.name.trim().length
  );

  // 1. High-confidence explicit destination patterns:
  // "in <Team>", "for <Team>", "to <Team>", "team <Team>", "for team <Team>", "in team <Team>"
  // "<Team>:", "<Team> -"
  // "remind <Team> to", "remind <Team>:"
  const candidateMatches: Array<{
    team: TeamInfo;
    matchIndex: number;
    matchedPattern: string;
    isExactName: boolean;
    hasPrefix: boolean;
  }> = [];

  for (const team of sortedTeams) {
    const teamName = team.name.trim();
    if (!teamName || teamName.length < 2) continue;

    const escapedName = escapeRegex(teamName);

    // Pattern A: Destination prefix like "in/for/to/at team X" or "for X" or "in X"
    const prefixRegex = new RegExp(
      `\\b(?:in|for|to|at|team|group|for\\s+team|in\\s+team|to\\s+team)\\s+["']?(${escapedName})["']?\\b`,
      "i"
    );

    // Pattern B: Header prefix like "Team X:" or "X: ..." or "X -" at start
    const startPrefixRegex = new RegExp(
      `^(?:(?:team|group)\\s+)?["']?(${escapedName})["']?\\s*(?::|—|-|\\|)\\s*`,
      "i"
    );

    // Pattern C: "remind X to" / "remind X about" / "remind X that"
    const remindTargetRegex = new RegExp(
      `\\bremind\\s+["']?(${escapedName})["']?\\s+(?:to|about|that|for)\\b`,
      "i"
    );

    // Pattern D: standalone word match
    const standaloneRegex = new RegExp(
      `\\b["']?(${escapedName})["']?\\b`,
      "i"
    );

    let match = normalizedInput.match(prefixRegex);
    if (match && match.index !== undefined) {
      candidateMatches.push({
        team,
        matchIndex: match.index,
        matchedPattern: match[0],
        isExactName: true,
        hasPrefix: true,
      });
      continue;
    }

    match = normalizedInput.match(startPrefixRegex);
    if (match && match.index !== undefined) {
      candidateMatches.push({
        team,
        matchIndex: match.index,
        matchedPattern: match[0],
        isExactName: true,
        hasPrefix: true,
      });
      continue;
    }

    match = normalizedInput.match(remindTargetRegex);
    if (match && match.index !== undefined) {
      candidateMatches.push({
        team,
        matchIndex: match.index,
        matchedPattern: match[0],
        isExactName: true,
        hasPrefix: true,
      });
      continue;
    }

    match = normalizedInput.match(standaloneRegex);
    if (match && match.index !== undefined) {
      // Check if it's a common English word that might not be a team without a prefix (e.g. "team", "call", "all", "work")
      const lowerName = teamName.toLowerCase();
      const genericWords = new Set(["all", "me", "my", "us", "today", "tomorrow", "now", "here", "later", "work", "home", "call", "send"]);
      const isGeneric = genericWords.has(lowerName);

      if (!isGeneric) {
        candidateMatches.push({
          team,
          matchIndex: match.index,
          matchedPattern: match[0],
          isExactName: true,
          hasPrefix: false,
        });
      }
    }
  }

  // Check prefix matches first (highest confidence)
  const prefixCandidates = candidateMatches.filter((c) => c.hasPrefix);

  if (prefixCandidates.length === 1) {
    const single = prefixCandidates[0];
    const cleaned = cleanTeamDestinationText(normalizedInput, single.matchedPattern);
    return {
      teamId: single.team.id,
      teamName: single.team.name,
      isAmbiguous: false,
      ambiguousTeams: [],
      cleanedText: cleaned,
    };
  }

  if (prefixCandidates.length > 1) {
    // If multiple candidates share the exact same team ID (e.g. repeated mention), deduplicate
    const uniqueTeams = Array.from(
      new Map(prefixCandidates.map((c) => [c.team.id, c.team])).values()
    );

    if (uniqueTeams.length === 1) {
      const single = uniqueTeams[0];
      return {
        teamId: single.id,
        teamName: single.name,
        isAmbiguous: false,
        ambiguousTeams: [],
      };
    }

    // Truly ambiguous between multiple teams!
    return {
      teamId: null,
      teamName: null,
      isAmbiguous: true,
      ambiguousTeams: uniqueTeams,
    };
  }

  // If no prefix candidates, look at standalone candidates
  if (candidateMatches.length === 1) {
    const single = candidateMatches[0];
    return {
      teamId: single.team.id,
      teamName: single.team.name,
      isAmbiguous: false,
      ambiguousTeams: [],
      cleanedText: normalizedInput,
    };
  }

  if (candidateMatches.length > 1) {
    const uniqueTeams = Array.from(
      new Map(candidateMatches.map((c) => [c.team.id, c.team])).values()
    );

    if (uniqueTeams.length === 1) {
      const single = uniqueTeams[0];
      return {
        teamId: single.id,
        teamName: single.name,
        isAmbiguous: false,
        ambiguousTeams: [],
      };
    }

    return {
      teamId: null,
      teamName: null,
      isAmbiguous: true,
      ambiguousTeams: uniqueTeams,
    };
  }

  // Partial substring matches (e.g., user says "Office" and team is named "Office Alpha" and "Office Beta")
  const partialMatches: TeamInfo[] = [];
  const words = normalizedInput.toLowerCase().split(/\s+/);

  for (const team of availableTeams) {
    const teamWords = team.name.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (w.length >= 3 && teamWords.includes(w)) {
        if (!partialMatches.some((pm) => pm.id === team.id)) {
          partialMatches.push(team);
        }
      }
    }
  }

  if (partialMatches.length > 1) {
    return {
      teamId: null,
      teamName: null,
      isAmbiguous: true,
      ambiguousTeams: partialMatches,
    };
  }

  if (partialMatches.length === 1) {
    // Only accept partial if it had some destination context in the sentence
    const hasDestinationIndicator = /\b(?:in|for|to|team)\b/i.test(normalizedInput);
    if (hasDestinationIndicator) {
      return {
        teamId: partialMatches[0].id,
        teamName: partialMatches[0].name,
        isAmbiguous: false,
        ambiguousTeams: [],
      };
    }
  }

  // No team mentioned -> personal reminder
  return {
    teamId: null,
    teamName: null,
    isAmbiguous: false,
    ambiguousTeams: [],
  };
}

/**
 * Removes the team destination phrasing from a reminder title so it reads cleanly.
 * e.g., "In Friends submit assignment" -> "Submit assignment"
 * e.g., "Submit assignment in Friends" -> "Submit assignment"
 * e.g., "Office: sprint planning" -> "Sprint planning"
 */
export function cleanTeamDestinationText(
  text: string,
  teamName?: string
): string {
  if (!text) return "";
  let cleaned = text;

  if (teamName) {
    const escaped = escapeRegex(teamName);
    // Remove variations like "in Friends", "for Friends team", "Friends:", "remind Friends to"
    const patterns = [
      new RegExp(`^\\s*(?:team\\s+)?${escaped}(?:\\s+team)?\\s*[:—–-]\\s*`, "i"),
      new RegExp(`\\b(?:in|for|to|with)\\s+(?:the\\s+)?(?:team\\s+)?${escaped}(?:\\s+team)?\\b`, "gi"),
      new RegExp(`\\b(?:team\\s+)?${escaped}\\s+team\\b`, "gi"),
      new RegExp(`^\\s*remind\\s+(?:the\\s+)?${escaped}\\s+(?:team\\s+)?(?:to\\s+)?`, "i"),
      new RegExp(`\\b${escaped}\\b`, "i"),
    ];

    for (const pat of patterns) {
      cleaned = cleaned.replace(pat, " ");
    }
  }

  // Remove leftover trailing/leading prepositions or punctuation
  cleaned = cleaned
    .replace(/^[\s:—–-]+/, "")
    .replace(/[\s:—–-]+$/, "")
    .replace(/\s+(?:in|for|to|with)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned || text;
}
