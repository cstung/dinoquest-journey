import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  avatarColor: string | null;
  level: number;
  xp: number;
  currentStreak: number;
  isYou: boolean;
}

export interface LeaderboardPage {
  scope: "family" | "global";
  items: LeaderboardEntry[];
}

export interface LevelUpResult {
  newLevel: number;
  xpSpent: number;
  xpBalance: number;
}

export function useLeaderboard(familyId: number | null, scope: "family" | "global") {
  return useQuery({
    queryKey: ["leaderboard", familyId, scope],
    queryFn: () => apiRequest<LeaderboardPage>(`/api/families/${familyId}/leaderboard?scope=${scope}`),
    enabled: !!familyId,
  });
}

export function useLevelUp(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<LevelUpResult>(`/api/families/${familyId}/members/me/level-up`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaderboard", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-activity", "activity", familyId] });
    },
  });
}
