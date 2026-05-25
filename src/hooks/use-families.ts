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
  myRole: "parent" | "child" | "superadmin";
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
  familyId: number;
  familyName: string | null;
  role: "parent" | "child";
  code: string;
  qrToken: string | null;
  joinLink: string;
  qrJoinLink: string | null;
  expiresAt: string;
  usedBy: number | null;
  revoked: boolean;
  createdAt: string;
}

export interface JoinResult {
  familyId: number;
  familyName: string;
  role: "parent" | "child" | "superadmin";
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
  limit = 20,
) {
  return useQuery({
    queryKey: ["family-activity", type, familyId, limit],
    queryFn: () => apiRequest<ActivityPage>(`/api/families/${familyId}/${type}?limit=${limit}`),
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
      apiRequest<JoinResult>("/api/join", {
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
    mutationFn: (body: { role: "parent" | "child" }) =>
      apiRequest<Invite>(`/api/families/${familyId}/invites`, {
        method: "POST",
        body: JSON.stringify(body),
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

export function useDeleteFamily(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<void>(`/api/families/${familyId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["families"] });
      queryClient.invalidateQueries({ queryKey: ["family", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-members", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-invites", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-join-requests", familyId] });
    },
  });
}

export function useRevokeInvite(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: number) =>
      apiRequest<void>(`/api/families/${familyId}/invites/${inviteId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-invites", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-activity", "activity", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-activity", "audit", familyId] });
    },
  });
}

export function useResolveJoinRequest(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { joinRequestId: number; status: "approved" | "rejected" }) =>
      apiRequest<JoinRequestItem>(`/api/families/${familyId}/join-requests/${body.joinRequestId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: body.status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-join-requests", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-members", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family", familyId] });
      queryClient.invalidateQueries({ queryKey: ["families"] });
    },
  });
}

export function useUpdateMemberRole(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: number; role: "parent" | "child" }) =>
      apiRequest<Member>(`/api/families/${familyId}/members/${body.userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: body.role }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-members", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-activity", "audit", familyId] });
    },
  });
}

export function useRemoveMember(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiRequest<void>(`/api/families/${familyId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["family-members", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family", familyId] });
      queryClient.invalidateQueries({ queryKey: ["families"] });
      queryClient.invalidateQueries({ queryKey: ["family-activity", "activity", familyId] });
      queryClient.invalidateQueries({ queryKey: ["family-activity", "audit", familyId] });
    },
  });
}
