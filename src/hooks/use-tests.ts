import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export interface TestAssignedMember {
  userId: number;
  username: string;
  avatarColor: string | null;
  status: "pending" | "completed";
  completedAt: string | null;
}

export interface TestQuestionDraft {
  questionText: string;
  options: [string, string, string, string];
  correctOption: number;
  explanation: string | null;
}

export interface TestPreview {
  title: string;
  youtubeUrl: string;
  videoId: string;
  thumbnailUrl: string;
  subtitleSource: "youtube_auto" | "whisper";
  transcriptWordCount: number;
  transcriptPreview: string;
  rawTranscript: string;
  questions: TestQuestionDraft[];
}

export interface TestListItem {
  id: number;
  title: string;
  videoId: string;
  thumbnailUrl: string | null;
  questionCount: number;
  timeLimitMin: number;
  maxXp: number;
  status: "draft" | "published" | "completed" | "reopen_requested";
  subtitleSource: "youtube_auto" | "whisper";
  assignedMembers: TestAssignedMember[];
  reopenPendingCount: number;
  createdAt: string;
}

export interface TestPage {
  items: TestListItem[];
  nextCursor: string | null;
  total: number;
}

export interface TestQuestionForAttempt {
  id: number;
  questionOrder: number;
  questionText: string;
  options: [string, string, string, string];
}

export interface TestAttemptStart {
  testId: number;
  assignmentId: number;
  attemptId: number;
  title: string;
  questionCount: number;
  timeLimitSec: number;
  maxXp: number;
  questions: TestQuestionForAttempt[];
}

export interface TestSubmitResult {
  testId: number;
  attemptId: number;
  assignmentId: number;
  scoreRaw: number;
  scorePct: number;
  xpEarned: number;
  totalXp: number;
  level: number;
}

export interface TestReopenRequestItem {
  id: number;
  testId: number;
  attemptId: number;
  requestedBy: number;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  resolvedBy: number | null;
}

export interface TestReopenResolveResult {
  request: TestReopenRequestItem;
  assignmentStatus: "pending" | "completed";
  xpDelta: number;
  totalXp: number;
  level: number;
}

export function useTests(
  familyId: number | null,
  options?: {
    search?: string;
    status?: "all" | "draft" | "published" | "completed" | "reopen_requested";
  },
) {
  return useQuery({
    queryKey: ["tests", familyId, options?.search ?? "", options?.status ?? "all"],
    queryFn: () => {
      const params = new URLSearchParams();
      if (options?.search?.trim()) params.set("search", options.search.trim());
      if (options?.status && options.status !== "all") params.set("status", options.status);
      const qs = params.toString();
      return apiRequest<TestPage>(`/api/families/${familyId}/tests${qs ? `?${qs}` : ""}`);
    },
    enabled: !!familyId,
  });
}

export function usePreviewTest(familyId: number | null) {
  return useMutation({
    mutationFn: (body: { youtubeUrl: string; questionCount: number }) =>
      apiRequest<TestPreview>(`/api/families/${familyId}/tests/preview`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function usePublishTest(familyId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      youtubeUrl: string;
      videoId: string;
      thumbnailUrl: string | null;
      subtitleSource: "youtube_auto" | "whisper";
      rawTranscript: string;
      questionCount: number;
      timeLimitMin: number;
      maxXp: number;
      assignedUserIds: number[];
      questions: TestQuestionDraft[];
    }) =>
      apiRequest<TestListItem>(`/api/families/${familyId}/tests`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tests", familyId] });
    },
  });
}

export function useStartTest(familyId: number | null, testId: number | null) {
  return useMutation({
    mutationFn: () =>
      apiRequest<TestAttemptStart>(`/api/families/${familyId}/tests/${testId}/start`, {
        method: "POST",
      }),
  });
}

export function useSubmitTest(familyId: number | null, testId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      attemptId: number;
      answers: Array<{ questionId: number; selectedOption: number }>;
    }) =>
      apiRequest<TestSubmitResult>(`/api/families/${familyId}/tests/${testId}/submit`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tests", familyId] });
    },
  });
}

export function useRequestReopen(familyId: number | null, testId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { reason?: string }) =>
      apiRequest<{ id: number; status: string }>(
        `/api/families/${familyId}/tests/${testId}/reopen-request`,
        {
          method: "POST",
          body: JSON.stringify(body ?? {}),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tests", familyId] });
    },
  });
}

export function useReopenRequests(
  familyId: number | null,
  testId: number | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["test-reopen-requests", familyId, testId],
    queryFn: () =>
      apiRequest<TestReopenRequestItem[]>(
        `/api/families/${familyId}/tests/${testId}/reopen-requests?status=pending`,
      ),
    enabled: !!familyId && !!testId && enabled,
  });
}

export function useResolveReopenRequest(familyId: number | null, testId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { requestId: number; decision: "approve" | "reject" }) =>
      apiRequest<TestReopenResolveResult>(
        `/api/families/${familyId}/tests/${testId}/reopen-requests/${body.requestId}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({ decision: body.decision }),
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tests", familyId] });
      queryClient.invalidateQueries({ queryKey: ["test-reopen-requests", familyId, testId] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard", familyId] });
    },
  });
}
