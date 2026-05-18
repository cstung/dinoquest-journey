import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface PetItem {
  id: number;
  userId: number;
  username: string;
  name: string;
  species: string;
  stage: "egg" | "hatchling" | "adult" | "evolved";
  level: number;
  xp: number;
  xpToNext: number;
  isActive: boolean;
  lastFedAt: string | null;
  createdAt: string;
}

export interface PetPage {
  items: PetItem[];
  total: number;
}

export function usePets(familyId: number | null) {
  return useQuery({
    queryKey: ["pets", familyId],
    queryFn: () => apiRequest<PetPage>(`/api/families/${familyId}/pets`),
    enabled: !!familyId,
  });
}

export function useCreatePet(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; species?: string }) =>
      apiRequest<PetItem>(`/api/families/${familyId}/pets`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pets", familyId] });
    },
  });
}

export function useUpdatePet(familyId: number | null, petId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; isActive?: boolean }) =>
      apiRequest<PetItem>(`/api/families/${familyId}/pets/${petId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pets", familyId] });
    },
  });
}

export function useFeedPet(familyId: number | null, petId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ petId: number; gainedXp: number; levelUp: boolean; level: number; xp: number; stage: string; nextFeedAt: string }>(
        `/api/families/${familyId}/pets/${petId}/feed`,
        { method: "POST" },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pets", familyId] });
    },
  });
}
