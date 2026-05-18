import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  avatarColor: string | null;
  level: number;
  xp: number;
  isYou: boolean;
}

export interface LeaderboardPage {
  scope: "family" | "global";
  items: LeaderboardEntry[];
}

export function useLeaderboard(familyId: number | null, scope: "family" | "global") {
  return useQuery({
    queryKey: ["leaderboard", familyId, scope],
    queryFn: () => apiRequest<LeaderboardPage>(`/api/families/${familyId}/leaderboard?scope=${scope}`),
    enabled: !!familyId,
  });
}
