import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export type QuestFrequency = "once" | "daily" | "weekly" | "monthly";

export interface AssignedMember {
  assignmentId: number;
  userId: number;
  username: string;
  avatarColor: string | null;
  status: "pending" | "completed" | "missed";
  completedAt: string | null;
  cycleIndex: number;
  cycleDueAt: string | null;
  cycleStartAt: string;
}

export interface QuestItem {
  id: number;
  title: string;
  description: string | null;
  category: string;
  difficulty: string;
  xpReward: number;
  dueDate: string | null;
  frequency: QuestFrequency;
  nextOccurrenceAt: string | null;
  recurrenceEndAt: string | null;
  status: "pending" | "completed" | "missed";
  assignedMembers: AssignedMember[];
  createdAt: string;
}

export interface QuestPage {
  items: QuestItem[];
  nextCursor: string | null;
  total: number;
}

export interface QuestCompleteResult {
  questId: number;
  assignmentId: number;
  xpAwarded: number;
  totalXp: number;
  level: number;
  status: "completed";
}

export function useQuests(
  familyId: number | null,
  options?: { search?: string; status?: "all" | "pending" | "completed" | "missed" },
) {
  return useQuery({
    queryKey: ["quests", familyId, options?.search ?? "", options?.status ?? "all"],
    queryFn: () => {
      const params = new URLSearchParams();
      if (options?.search?.trim()) params.set("search", options.search.trim());
      if (options?.status && options.status !== "all") params.set("status", options.status);
      const qs = params.toString();
      return apiRequest<QuestPage>(`/api/families/${familyId}/quests${qs ? `?${qs}` : ""}`);
    },
    enabled: !!familyId,
  });
}

export function useQuestDetail(familyId: number | null, questId: number | null) {
  return useQuery({
    queryKey: ["quest", familyId, questId],
    queryFn: () => apiRequest<QuestItem>(`/api/families/${familyId}/quests/${questId}`),
    enabled: !!familyId && !!questId,
  });
}

export function useCreateQuest(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string | null;
      category?: string;
      difficulty?: string;
      xpReward?: number;
      dueDate?: string | null;
      frequency?: QuestFrequency;
      recurrenceEndAt?: string | null;
      assignedUserIds?: number[];
    }) =>
      apiRequest<QuestItem>(`/api/families/${familyId}/quests`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quests", familyId] });
    },
  });
}

export function useCompleteQuest(familyId: number | null, assignmentId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<QuestCompleteResult>(`/api/families/${familyId}/quest-assignments/${assignmentId}/complete`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quests", familyId] });
      queryClient.invalidateQueries({ queryKey: ["quest", familyId] });
    },
  });
}

export function useUpdateQuest(familyId: number | null, questId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title?: string;
      description?: string | null;
      category?: string;
      difficulty?: string;
      xpReward?: number;
      dueDate?: string | null;
      frequency?: QuestFrequency;
      recurrenceEndAt?: string | null;
    }) =>
      apiRequest<QuestItem>(`/api/families/${familyId}/quests/${questId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quests", familyId] });
      queryClient.invalidateQueries({ queryKey: ["quest", familyId, questId] });
    },
  });
}

export function useDeleteQuest(familyId: number | null, questId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<void>(`/api/families/${familyId}/quests/${questId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quests", familyId] });
    },
  });
}
