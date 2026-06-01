import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest } from "@/lib/api";

const rewardCreateSchema = z.object({
  title: z.string(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  xpCost: z.number().min(1),
});

const rewardUpdateSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  xpCost: z.number().min(1).optional(),
  isActive: z.boolean().optional(),
});

export interface RewardItem {
  id: number;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  xpCost: number;
  isActive: boolean;
  createdAt: string;
  createdBy: number;
}

export interface RewardClaimItem {
  id: number;
  rewardId: number;
  rewardTitle: string;
  familyId: number;
  userId: number;
  username: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
}

export function useRewards(familyId: number | null, includeInactive: boolean) {
  return useQuery({
    queryKey: ["rewards", familyId, includeInactive],
    queryFn: () =>
      apiRequest<RewardItem[]>(
        `/api/families/${familyId}/rewards?include_inactive=${includeInactive}`,
      ),
    enabled: !!familyId,
  });
}

export function useRewardClaims(
  familyId: number | null,
  status?: "pending" | "approved" | "rejected",
) {
  return useQuery({
    queryKey: ["reward-claims", familyId, status ?? "all"],
    queryFn: () =>
      apiRequest<RewardClaimItem[]>(
        `/api/families/${familyId}/reward-claims${status ? `?status=${status}` : ""}`,
      ),
    enabled: !!familyId,
  });
}

export function useCreateReward(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string | null;
      thumbnailUrl?: string | null;
      xpCost: number;
    }) =>
      apiRequest<RewardItem>(`/api/families/${familyId}/rewards`, {
        method: "POST",
        body: JSON.stringify(rewardCreateSchema.parse(body)),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rewards", familyId] });
    },
  });
}

export function useUpdateReward(familyId: number | null, rewardId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title?: string;
      description?: string | null;
      thumbnailUrl?: string | null;
      xpCost?: number;
      isActive?: boolean;
    }) =>
      apiRequest<RewardItem>(`/api/families/${familyId}/rewards/${rewardId}`, {
        method: "PATCH",
        body: JSON.stringify(rewardUpdateSchema.parse(body)),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rewards", familyId] });
    },
  });
}

export function useClaimReward(familyId: number | null, rewardId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<RewardClaimItem>(`/api/families/${familyId}/rewards/${rewardId}/claim`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reward-claims", familyId] });
    },
  });
}

export function useResolveRewardClaim(familyId: number | null, claimId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      apiRequest<RewardClaimItem>(`/api/families/${familyId}/reward-claims/${claimId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reward-claims", familyId] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard", familyId] });
    },
  });
}
