import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface Family {
  id: number;
  name: string;
  motto: string | null;
  avatarUrl: string | null;
  colorHex: string;
  ownerId: number;
  memberCount: number;
  createdAt: string;
  myRole: "parent" | "child";
}

export interface Member {
  userId: number;
  username: string;
  role: "parent" | "child";
  nickname: string | null;
  avatarColor: string | null;
  joinedAt: string;
}

export interface Invite {
  id: number;
  code: string;
  qrToken: string;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}

export interface JoinRequestItem {
  id: number;
  familyId: number;
  userId: number;
  username: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
}

export interface ActivityItem {
  id: number;
  familyId: number;
  userId: number | null;
  username: string | null;
  eventType: string;
  payload: Record<string, unknown> | null;
  isAudit: boolean;
  createdAt: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
  total: number;
}

export function useFamilies() {
  return useQuery({
    queryKey: ["families"],
    queryFn: () => apiRequest<Family[]>("/api/families"),
  });
}

export function useFamilyDetail(familyId: number | null) {
  return useQuery({
    queryKey: ["family", familyId],
    queryFn: () => apiRequest<Family>(`/api/families/${familyId}`),
    enabled: !!familyId,
  });
}

export function useFamilyMembers(familyId: number | null) {
  return useQuery({
    queryKey: ["family-members", familyId],
    queryFn: () => apiRequest<Member[]>(`/api/families/${familyId}/members`),
    enabled: !!familyId,
  });
}

export function useFamilyInvites(familyId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["family-invites", familyId],
    queryFn: () => apiRequest<Invite[]>(`/api/families/${familyId}/invites`),
    enabled: !!familyId && enabled,
  });
}

export function useFamilyJoinRequests(familyId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["family-join-requests", familyId],
    queryFn: () => apiRequest<JoinRequestItem[]>(`/api/families/${familyId}/join-requests`),
    enabled: !!familyId && enabled,
  });
}

export function useFamilyActivity(
  familyId: number | null,
  type: "activity" | "audit",
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["family-activity", type, familyId],
    queryFn: () => apiRequest<ActivityPage>(`/api/families/${familyId}/${type}?limit=20`),
    enabled: !!familyId && enabled,
  });
}

export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; motto?: string | null; colorHex?: string }) =>
      apiRequest<Family>("/api/families", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["families"] });
    },
  });
}

export function useJoinFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { code?: string; qrToken?: string }) =>
      apiRequest<JoinRequestItem>("/api/join", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["families"] });
    },
  });
}

export function useCreateInvite(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<Invite>(`/api/families/${familyId}/invites`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-invites", familyId] });
    },
  });
}

export function useUpdateFamily(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; motto?: string | null; colorHex?: string }) =>
      apiRequest<Family>(`/api/families/${familyId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family", familyId] });
      queryClient.invalidateQueries({ queryKey: ["families"] });
    },
  });
}

