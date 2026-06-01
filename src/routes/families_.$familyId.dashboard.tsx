import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, format } from "date-fns";
import {
  Image as ImageIcon,
  Smile,
  AtSign,
  X,
  Trash2,
  Plus,
  Pin,
  Send,
  Sparkles,
  Flame,
  Target,
  Star,
  Zap,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  ChevronRight,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn, formatXp } from "@/lib/utils";
import { apiRequest } from "@/lib/api";
import { MOOD_ICON_OPTIONS } from "@/lib/mood-icons";
import { FAMILY_REALTIME_MESSAGE_EVENT, FAMILY_REALTIME_STATUS_EVENT } from "@/hooks/use-realtime";
import { useAuthStore, useFamilyStore } from "@/store";
import { useAwardParentReward } from "@/hooks/use-families";

export const Route = createFileRoute("/families_/$familyId/dashboard")({
  head: () => ({
    meta: [
      { title: "Family Yard — DinoQuest" },
      { name: "description", content: "The Rivera Squad's shared dashboard." },
    ],
  }),
  component: FamilyDashboardPage,
});

// ============================================================
// Types & mock data
// ============================================================

type PostType = "activity" | "shoutout" | "photo" | "boost" | "weekly_recap";
const EMOJIS = ["🔥", "⭐", "💪", "🎉", "👏", "😮"] as const;
const STICKERS = ["🦖", "🦕", "🥚", "🌋", "☄️", "🌴", "🪨", "🦴"];

interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}
interface Tag {
  userId: number;
  nickname: string;
}
interface WallPost {
  id: number;
  authorId: number | null;
  authorNickname: string | null;
  authorEmoji?: string;
  authorColor?: string;
  postType: PostType;
  content: string;
  imageUrl: string | null;
  stickerUrl: string | null;
  isBoosted: boolean;
  tags: Tag[];
  reactionCounts: Reaction[];
  commentCount: number;
  createdAt: string;
}
interface Comment {
  id: number;
  postId: number;
  authorId: number;
  authorNickname: string;
  authorColor: string;
  text: string;
  createdAt: string;
}
interface Member {
  id: number;
  nickname: string;
  color: string;
  role: "parent" | "child" | "superadmin";
}
interface ApiMember {
  userId: number;
  username: string;
  role: "parent" | "child" | "superadmin";
  nickname: string | null;
  avatarColor: string | null;
}
interface Pin {
  id: number;
  message: string;
  createdBy: string;
  expiresAt: string | null;
  acknowledgements: { userId: number; nickname: string }[];
  totalMembers: number;
}
interface DashboardStats {
  questsCompletedThisWeek?: number;
  familyXpThisWeek?: number;
  bestStreakActive?: number;
  testsTakenThisWeek?: number;
}

interface FamilyDashboardFamily {
  name: string;
  motto?: string | null;
  colorHex: string;
  myRole?: "parent" | "child" | "superadmin";
}

interface PostPayload {
  text: string;
  sticker: string | null;
  imageFile: File | null;
  tags: Tag[];
  postType: PostType;
}

const MAX_PARENT_REWARD_VALUE = 10_000_000;
const REWARD_QUICK_ADD = [10_000, 25_000, 50_000, 100_000];

const giveXpSchema = z.object({
  childUserId: z.coerce.number().int().positive(),
  xp: z.coerce.number().int().min(1, "XP must be at least 1").max(MAX_PARENT_REWARD_VALUE),
  reason: z
    .string()
    .max(100, "Reason must be 100 characters or fewer")
    .optional()
    .or(z.literal("")),
});

type GiveXpValues = z.infer<typeof giveXpSchema>;
// ============================================================
// Page root
// ============================================================

function FamilyDashboardPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { familyId: familyIdParam } = Route.useParams();
  const { activeFamilyRole } = useFamilyStore();
  const familyId = Number(familyIdParam);
  const hasValidFamilyId = Number.isFinite(familyId) && familyId > 0;
  const currentUserId = user?.id ?? 0;
  const [page, setPage] = useState(1);
  const [commentsByPost, setCommentsByPost] = useState<Record<number, Comment[]>>({});
  const [openThreads, setOpenThreads] = useState<Set<number>>(new Set());
  const openThreadsRef = useRef(openThreads);
  const [pendingPosts, setPendingPosts] = useState<WallPost[]>([]);
  const [wsConnected, setWsConnected] = useState(true);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; caption: string } | null>(null);
  const [rewardDialogOpen, setRewardDialogOpen] = useState(false);
  const [selectedRewardChildId, setSelectedRewardChildId] = useState<number | null>(null);

  useEffect(() => {
    openThreadsRef.current = openThreads;
  }, [openThreads]);

  const { data: familyData } = useQuery({
    queryKey: ["family", familyId],
    queryFn: () => apiRequest<FamilyDashboardFamily>(`/api/families/${familyId}`),
    enabled: hasValidFamilyId && !!user,
  });
  const family = familyData
    ? { ...familyData, motto: familyData.motto ?? "" }
    : { name: "", motto: "", colorHex: "#58CC02" };
  const familyRole = familyData?.myRole ?? activeFamilyRole;
  const isParent = familyRole === "parent" || familyRole === "superadmin";

  const { data: membersData } = useQuery({
    queryKey: ["family-members", familyId],
    queryFn: () =>
      apiRequest<ApiMember[] | { members: Member[] }>(`/api/families/${familyId}/members`),
    enabled: hasValidFamilyId && !!user,
  });
  const members: Member[] = Array.isArray(membersData)
    ? membersData.map((member) => ({
        id: member.userId,
        nickname: member.nickname ?? member.username,
        color: member.avatarColor ?? "#1CB0F6",
        role: member.role,
      }))
    : (membersData?.members ?? []);
  const childMembers = members.filter((member) => member.role === "child");
  const awardParentReward = useAwardParentReward(familyId, selectedRewardChildId);

  useEffect(() => {
    if (childMembers.length === 0) {
      setSelectedRewardChildId(null);
      return;
    }
    if (
      selectedRewardChildId == null ||
      !childMembers.some((child) => child.id === selectedRewardChildId)
    ) {
      setSelectedRewardChildId(childMembers[0].id);
    }
  }, [childMembers, selectedRewardChildId]);

  const memberById = (id: number | null) =>
    id == null ? null : (members.find((m) => m.id === id) ?? null);

  const { data: feedData, isLoading: feedLoading } = useQuery({
    queryKey: ["wall-feed", familyId, page],
    queryFn: () =>
      apiRequest<{ posts: WallPost[]; hasMore: boolean }>(
        `/api/families/${familyId}/dashboard/feed?page=${page}&limit=20`,
      ),
    enabled: hasValidFamilyId && !!user,
  });
  const posts = feedData?.posts ?? [];
  const hasMore = feedData?.hasMore ?? false;

  const { data: moodData, refetch: refetchMoods } = useQuery({
    queryKey: ["mood-today", familyId],
    queryFn: () =>
      apiRequest<{ checkins: { userId: number; mood: string | null }[] }>(
        `/api/families/${familyId}/mood-checkins/today`,
      ),
    enabled: hasValidFamilyId && !!user,
  });
  const moods: Record<number, string | null> = Object.fromEntries(
    (moodData?.checkins ?? []).map((c) => [c.userId, c.mood]),
  );
  const myMood = moods[currentUserId] ?? null;

  const { data: pinsData, refetch: refetchPins } = useQuery({
    queryKey: ["pins", familyId],
    queryFn: () => apiRequest<{ pins: Pin[] }>(`/api/families/${familyId}/pins`),
    enabled: hasValidFamilyId && !!user,
  });
  const pins = pinsData?.pins ?? [];

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", familyId],
    queryFn: () => apiRequest<DashboardStats>(`/api/families/${familyId}/dashboard/stats`),
    enabled: hasValidFamilyId && !!user,
  });

  const setPosts = useCallback((updater: (prev: WallPost[]) => WallPost[]) => {
    queryClient.setQueryData(
      ["wall-feed", familyId, page],
      (old: { posts: WallPost[]; hasMore: boolean } | undefined) => ({
        posts: updater(old?.posts ?? []),
        hasMore: old?.hasMore ?? hasMore,
      }),
    );
  }, [familyId, hasMore, page, queryClient]);

  const prependPostOnce = useCallback((post: WallPost) => {
    setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
  }, [setPosts]);

  const postMutation = useMutation({
    mutationFn: async ({ text, sticker, imageFile, tags, postType }: PostPayload) => {
      if (imageFile) {
        const form = new FormData();
        form.append("image", imageFile);
        form.append("content", text);
        form.append("postType", postType);
        form.append("tags", JSON.stringify(tags.map((t) => t.userId)));
        return apiRequest<WallPost>(`/api/families/${familyId}/wall-posts`, {
          method: "POST",
          body: form,
        });
      }
      return apiRequest<WallPost>(`/api/families/${familyId}/wall-posts`, {
        method: "POST",
        body: JSON.stringify({
          postType,
          content: text,
          stickerUrl: sticker,
          taggedUserIds: tags.map((t) => t.userId),
        }),
      });
    },
    onSuccess: (savedPost) => {
      prependPostOnce(savedPost);
      setPendingPosts((pending) => pending.filter((post) => post.id !== savedPost.id));
      queryClient.invalidateQueries({ queryKey: ["wall-feed", familyId] });
      toast.success("Posted!");
    },
    onError: () => toast.error("Could not post. Please try again."),
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId: number) =>
      apiRequest<void>(`/api/families/${familyId}/wall-posts/${postId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, postId) => {
      queryClient.setQueryData(
        ["wall-feed", familyId, page],
        (old: { posts?: WallPost[]; hasMore?: boolean } | undefined) => ({
          posts: old?.posts?.filter((p) => p.id !== postId) ?? [],
          hasMore: old?.hasMore ?? hasMore,
        }),
      );
      toast.success("Post deleted");
    },
    onError: () => toast.error("Could not delete post."),
  });

  const reactMutation = useMutation({
    mutationFn: ({
      postId,
      emoji,
      isRemoving,
    }: {
      postId: number;
      emoji: string;
      isRemoving: boolean;
    }) =>
      isRemoving
        ? apiRequest<void>(`/api/families/${familyId}/wall-posts/${postId}/reactions`, {
            method: "DELETE",
          })
        : apiRequest<void>(`/api/families/${familyId}/wall-posts/${postId}/reactions`, {
            method: "POST",
            body: JSON.stringify({ emoji }),
          }),
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["wall-feed", familyId] });
      toast.error("Could not react.");
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: ({ postId, text }: { postId: number; text: string; optimisticComment: Comment }) =>
      apiRequest<Comment>(`/api/families/${familyId}/wall-posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onMutate: async ({ postId, optimisticComment }) => {
      setCommentsByPost((m) => ({ ...m, [postId]: [...(m[postId] ?? []), optimisticComment] }));
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)),
      );
      return { postId, optimisticId: optimisticComment.id };
    },
    onSuccess: (saved, vars, ctx) => {
      setCommentsByPost((m) => ({
        ...m,
        [vars.postId]: (() => {
          let replaced = false;
          const next = (m[vars.postId] ?? []).map((c) => {
            if (c.id === ctx?.optimisticId) {
              replaced = true;
              return saved;
            }
            return c;
          });
          const withSaved = replaced ? next : [...next, saved];
          return withSaved.filter(
            (comment, index, list) =>
              list.findIndex((candidate) => candidate.id === comment.id) === index,
          );
        })(),
      }));
    },
    onError: (_, vars, ctx) => {
      setCommentsByPost((m) => ({
        ...m,
        [vars.postId]: (m[vars.postId] ?? []).filter((c) => c.id !== ctx?.optimisticId),
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === vars.postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["wall-feed", familyId] });
      toast.error("Could not post comment.");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({ postId, commentId }: { postId: number; commentId: number }) =>
      apiRequest<void>(`/api/families/${familyId}/wall-posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
      }),
    onMutate: async ({ postId, commentId }) => {
      setCommentsByPost((m) => ({
        ...m,
        [postId]: (m[postId] ?? []).filter((c) => c.id !== commentId),
      }));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p,
        ),
      );
    },
    onError: () => toast.error("Could not delete comment."),
  });

  const boostMutation = useMutation({
    mutationFn: ({ postId, xp, message }: { postId: number; xp: number; message: string }) =>
      apiRequest<void>(`/api/families/${familyId}/wall-posts/${postId}/boost`, {
        method: "POST",
        body: JSON.stringify({ xp, message }),
      }),
    onSuccess: (_, { xp }) => {
      toast.success(`Boost sent! +${formatXp(xp)} XP`);
      queryClient.invalidateQueries({ queryKey: ["wall-feed", familyId] });
    },
    onError: () => toast.error("Could not send boost."),
  });

  const moodMutation = useMutation({
    mutationFn: ({ mood }: { mood: string }) =>
      apiRequest<void>(`/api/families/${familyId}/mood-checkins`, {
        method: "POST",
        body: JSON.stringify({ mood, shared: true }),
      }),
    onSuccess: () => {
      refetchMoods();
      toast.success("Mood saved!");
    },
    onError: () => toast.error("Could not save mood."),
  });

  const ackPinMutation = useMutation({
    mutationFn: (pinId: number) =>
      apiRequest<void>(`/api/families/${familyId}/pins/${pinId}/acknowledge`, {
        method: "POST",
      }),
    onSuccess: () => refetchPins(),
    onError: () => toast.error("Could not acknowledge."),
  });

  const removePinMutation = useMutation({
    mutationFn: (pinId: number) =>
      apiRequest<void>(`/api/families/${familyId}/pins/${pinId}`, {
        method: "DELETE",
      }),
    onSuccess: () => refetchPins(),
    onError: () => toast.error("Could not remove pin."),
  });

  const createPinMutation = useMutation({
    mutationFn: ({ message, expiresAt }: { message: string; expiresAt: string | null }) =>
      apiRequest<void>(`/api/families/${familyId}/pins`, {
        method: "POST",
        body: JSON.stringify({ message, expiresAt }),
      }),
    onSuccess: () => {
      refetchPins();
      toast.success("Pin added");
    },
    onError: () => toast.error("Could not add pin."),
  });

  const newPostsCount = pendingPosts.length;
  const acceptPending = () => {
    setPosts((p) => [
      ...pendingPosts.filter((post) => !p.some((existing) => existing.id === post.id)),
      ...p,
    ]);
    setPendingPosts([]);
  };

  const handleReact = (postId: number, emoji: string) => {
    const existing = posts
      .find((p) => p.id === postId)
      ?.reactionCounts.find((r) => r.emoji === emoji);
    const isRemoving = !!existing?.reactedByMe;
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        let updated = p.reactionCounts.map((r) =>
          r.reactedByMe && r.emoji !== emoji
            ? { ...r, count: Math.max(0, r.count - 1), reactedByMe: false }
            : r,
        );
        const target = p.reactionCounts.find((r) => r.emoji === emoji);
        if (target) {
          updated = updated.map((r) =>
            r.emoji === emoji
              ? r.reactedByMe
                ? { ...r, count: Math.max(0, r.count - 1), reactedByMe: false }
                : { ...r, count: r.count + 1, reactedByMe: true }
              : r,
          );
        } else {
          updated = [...updated, { emoji, count: 1, reactedByMe: true }];
        }
        return { ...p, reactionCounts: updated.filter((r) => r.count > 0) };
      }),
    );
    reactMutation.mutate({ postId, emoji, isRemoving });
  };

  const toggleThread = async (postId: number) => {
    let willOpen = false;
    setOpenThreads((s) => {
      const ns = new Set(s);
      if (ns.has(postId)) {
        ns.delete(postId);
      } else {
        ns.add(postId);
        willOpen = true;
      }
      return ns;
    });

    const post = posts.find((p) => p.id === postId);
    const cachedComments = commentsByPost[postId];
    const needsFetch = !cachedComments || (post && post.commentCount > cachedComments.length);

    if (willOpen && needsFetch) {
      try {
        const data = await apiRequest<{ comments: Comment[] } | Comment[]>(
          `/api/families/${familyId}/wall-posts/${postId}/comments`,
        );
        setCommentsByPost((m) => ({
          ...m,
          [postId]: Array.isArray(data) ? data : (data.comments ?? []),
        }));
      } catch {
        toast.error("Could not load comments.");
      }
    }
  };

  const handleAddComment = (postId: number, text: string) => {
    const optimisticComment: Comment = {
      id: -Date.now(),
      postId,
      authorId: currentUserId,
      authorNickname: memberById(currentUserId)?.nickname ?? "You",
      authorColor: memberById(currentUserId)?.color ?? "#1CB0F6",
      text,
      createdAt: new Date().toISOString(),
    };
    addCommentMutation.mutate({ postId, text, optimisticComment });
  };

  const handleDeleteComment = (postId: number, commentId: number) => {
    deleteCommentMutation.mutate({ postId, commentId });
  };

  const handleBoost = (postId: number, xp: number, message: string) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, isBoosted: true } : p)));
    boostMutation.mutate({ postId, xp, message });
  };

  useEffect(() => {
    if (!hasValidFamilyId || !isAuthenticated) return;

    const onStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{ familyId: number; connected: boolean }>;
      if (customEvent.detail.familyId !== familyId) return;
      setWsConnected(customEvent.detail.connected);
    };

    const onMessage = (event: Event) => {
      const customEvent = event as CustomEvent<{
        familyId: number;
        message: { event: string; payload?: unknown };
      }>;
      if (customEvent.detail.familyId !== familyId) return;
      const msg = customEvent.detail.message;

      if (msg.event === "wall_post_created" || msg.event === "weekly_recap_posted") {
        const post = msg.payload as WallPost;
        if (post.authorId === currentUserId) {
          prependPostOnce(post);
          setPendingPosts((pending) => pending.filter((item) => item.id !== post.id));
          return;
        }
        setPendingPosts((pending) =>
          pending.some((item) => item.id === post.id) ? pending : [...pending, post],
        );
        return;
      }

      if (msg.event === "wall_reaction_updated") {
        const { postId, emoji, count, reactedByMe } = msg.payload as {
          postId: number;
          emoji: string;
          count: number;
          reactedByMe: boolean;
        };
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const next = [...p.reactionCounts];
            const idx = next.findIndex((r) => r.emoji === emoji);
            if (count <= 0) {
              return { ...p, reactionCounts: next.filter((r) => r.emoji !== emoji) };
            }
            if (idx >= 0) {
              next[idx] = { ...next[idx], count, reactedByMe };
            } else {
              next.push({ emoji, count, reactedByMe });
            }
            return { ...p, reactionCounts: next };
          }),
        );
        return;
      }

      if (msg.event === "wall_comment_added") {
        const { postId, comment } = msg.payload as { postId: number; comment: Comment };
        if (comment.authorId === currentUserId) {
          return;
        }
        let shouldIncrement = true;
        if (openThreadsRef.current.has(postId)) {
          setCommentsByPost((m) => ({
            ...m,
            [postId]: (() => {
              const existing = m[postId] ?? [];
              shouldIncrement = !existing.some((item) => item.id === comment.id);
              return shouldIncrement ? [...existing, comment] : existing;
            })(),
          }));
        }
        if (shouldIncrement) {
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p)),
          );
        }
        return;
      }

      if (msg.event === "mood_checkin") {
        refetchMoods();
        return;
      }

      if (msg.event === "pin_created" || msg.event === "pin_removed") {
        refetchPins();
      }
    };

    window.addEventListener(FAMILY_REALTIME_STATUS_EVENT, onStatus);
    window.addEventListener(FAMILY_REALTIME_MESSAGE_EVENT, onMessage);

    return () => {
      window.removeEventListener(FAMILY_REALTIME_STATUS_EVENT, onStatus);
      window.removeEventListener(FAMILY_REALTIME_MESSAGE_EVENT, onMessage);
    };
  }, [
    currentUserId,
    familyId,
    hasValidFamilyId,
    isAuthenticated,
    prependPostOnce,
    refetchMoods,
    refetchPins,
    setPosts,
  ]);

  if (!hasValidFamilyId) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 p-4">
        <h1 className="font-display font-extrabold text-2xl">Invalid family</h1>
        <p className="text-muted-foreground">Family id is missing from the URL.</p>
        <Button asChild>
          <Link to="/families">Choose family</Link>
        </Button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 p-4">
        <div className="text-sm text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-3 md:p-6 space-y-4 pb-24">
      {!wsConnected && <ReconnectingBanner />}

      <DashboardHeader family={family} />

      <StatsSnapshot stats={stats ?? {}} />

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <MoodCheckin
          myMood={myMood}
          onSubmit={(m) => {
            moodMutation.mutate({ mood: m });
          }}
        />
        <FamilyMoodPanel members={members} moods={moods} />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        {/* LEFT — wall */}
        <div className="space-y-4 min-w-0">
          <ShoutoutComposer
            currentUser={
              memberById(currentUserId) ?? {
                id: currentUserId,
                nickname: "You",
                color: "#1CB0F6",
                role: "parent",
              }
            }
            members={members.filter((m) => m.id !== currentUserId)}
            onPost={async (payload) => {
              await postMutation.mutateAsync(payload);
            }}
            posting={postMutation.isPending}
          />

          {newPostsCount > 0 && <NewPostsBanner count={newPostsCount} onClick={acceptPending} />}

          {feedLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full rounded-3xl" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <EmptyFeed />
          ) : (
            <ul className="space-y-3">
              {posts.map((p) => (
                <li key={p.id}>
                  <WallPostCard
                    post={p}
                    familyId={familyId}
                    isParent={isParent}
                    currentUserId={currentUserId}
                    onReact={(e) => handleReact(p.id, e)}
                    onDelete={() => deletePostMutation.mutate(p.id)}
                    onBoost={(xp, message) => handleBoost(p.id, xp, message)}
                    threadOpen={openThreads.has(p.id)}
                    onToggleThread={() => void toggleThread(p.id)}
                    comments={commentsByPost[p.id] ?? []}
                    onAddComment={(t) => handleAddComment(p.id, t)}
                    onDeleteComment={(cid) => handleDeleteComment(p.id, cid)}
                    onOpenImage={(src) => setLightboxImage({ src, caption: p.content })}
                  />
                </li>
              ))}
            </ul>
          )}

          {hasMore && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => setPage((v) => v + 1)}>
                Load more
              </Button>
            </div>
          )}

        </div>

        {/* RIGHT — side rail */}
        <aside className="space-y-4">
          <Pinboard
            pins={pins}
            isParent={isParent}
            currentUserId={currentUserId}
            onAck={(id) => ackPinMutation.mutate(id)}
            onRemove={(id) => removePinMutation.mutate(id)}
            onCreate={(msg, exp) => createPinMutation.mutate({ message: msg, expiresAt: exp })}
          />
          {isParent && (
            <ParentRewardCard
              childMembers={childMembers}
              open={rewardDialogOpen}
              onOpenChange={setRewardDialogOpen}
              selectedChildId={selectedRewardChildId}
              onSelectChild={setSelectedRewardChildId}
              isPending={awardParentReward.isPending}
              onSubmit={async (values) => {
                const result = await awardParentReward.mutateAsync(values);
                toast.success(`Awarded ${result.xpAwarded.toLocaleString()} XP.`);
                setRewardDialogOpen(false);
              }}
            />
          )}
        </aside>
      </div>

      {lightboxImage && (
        <PhotoLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  );
}

// ============================================================
// Header & banners
// ============================================================

function DashboardHeader({
  family,
}: {
  family: { name: string; motto: string; colorHex: string };
}) {
  return (
    <div
      className="rounded-3xl p-5 md:p-6 shadow-pop-sm border-2 border-foreground/5 relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${family.colorHex}20, ${family.colorHex}05)`,
        ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)",
      }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className="size-14 rounded-2xl grid place-items-center text-2xl shadow-pop-sm border-2 border-card"
            style={{
              backgroundColor: family.colorHex,
              ["--shadow-color" as any]: "oklch(0 0 0 / 0.12)",
            }}
          >
            🦖
          </div>
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
              Family Yard
            </div>
            <h1 className="font-display font-black text-2xl md:text-3xl">{family.name}</h1>
            <div className="text-sm text-muted-foreground font-medium">{family.motto}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReconnectingBanner() {
  return (
    <div className="rounded-2xl bg-warning/20 border-2 border-warning/40 px-4 py-2 flex items-center gap-2 text-sm font-bold">
      <WifiOff className="size-4" /> Reconnecting…
    </div>
  );
}

function NewPostsBanner({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      role="status"
      aria-live="polite"
      onClick={onClick}
      className="sticky top-2 z-10 w-full rounded-full bg-primary text-primary-foreground py-2 px-4 font-display font-extrabold text-sm shadow-pop hover:scale-[1.01] transition"
      style={{ ["--shadow-color" as any]: "oklch(0.55 0.18 142)" }}
    >
      ✨ {count} new post{count === 1 ? "" : "s"} — tap to load
    </button>
  );
}

function EmptyFeed() {
  return (
    <div className="rounded-3xl border-2 border-dashed border-foreground/10 p-10 text-center space-y-2">
      <div className="text-5xl">📭</div>
      <div className="font-display font-extrabold">No activity yet. Be the first to post!</div>
    </div>
  );
}

// ============================================================
// Stats strip
// ============================================================

function StatsSnapshot({ stats }: { stats: DashboardStats }) {
  const nav = useNavigate();
  const Tile = ({
    icon,
    label,
    value,
    color,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color: string;
  }) => (
    <div className="flex items-center gap-3 min-w-0">
      <div className={cn("size-10 rounded-2xl grid place-items-center shrink-0", color)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-display font-black text-xl tabular-nums leading-none">{value}</div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground truncate">
          {label}
        </div>
      </div>
    </div>
  );
  return (
    <button
      onClick={() => nav({ to: "/leaderboard" })}
      className="w-full rounded-3xl bg-card border-2 border-foreground/5 shadow-pop-sm p-4 md:p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-left hover:bg-secondary/40 transition"
      style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
    >
      <Tile
        icon={<Sparkles className="size-5 text-success-foreground" />}
        label="Quests this week"
        value={stats.questsCompletedThisWeek ?? 0}
        color="bg-success/20"
      />
      <Tile
        icon={<Star className="size-5 text-warning-foreground" />}
        label="Family XP"
        value={stats.familyXpThisWeek ?? 0}
        color="bg-warning/20"
      />
      <Tile
        icon={<Flame className="size-5 text-pink" />}
        label="Best streak"
        value={`${stats.bestStreakActive ?? 0}d`}
        color="bg-pink/20"
      />
      <Tile
        icon={<Target className="size-5 text-info" />}
        label="Video quizzes this week"
        value={stats.testsTakenThisWeek ?? 0}
        color="bg-info/20"
      />
    </button>
  );
}

// ============================================================
// Mood
// ============================================================

function MoodCheckin({
  myMood,
  onSubmit,
}: {
  myMood: string | null;
  onSubmit: (m: string) => void;
}) {
  const [editing, setEditing] = useState(!isMoodIconValue(myMood));
  const [choices, setChoices] = useState(() => MOOD_ICON_OPTIONS.slice(0, 5));

  useEffect(() => {
    setChoices(pickMoodIcons());
  }, []);
  useEffect(() => {
    if (!isMoodIconValue(myMood)) setEditing(true);
  }, [myMood]);

  const pick = (m: string) => {
    onSubmit(m);
    setEditing(false);
  };
  const shuffle = () => setChoices(pickMoodIcons());

  return (
    <div
      className="rounded-3xl bg-card border-2 border-foreground/5 shadow-pop-sm p-4 flex items-center justify-between gap-3 flex-wrap"
      style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
    >
      {editing ? (
        <>
          <div className="font-display font-extrabold text-sm">How are you feeling today?</div>
          <div className="flex items-center gap-2 flex-wrap">
            {choices.map((m) => (
              <button
                key={m.value}
                aria-label={m.label}
                onClick={() => pick(m.value)}
                className={cn(
                  "size-12 rounded-2xl grid place-items-center bg-secondary/60 hover:scale-110 transition shadow-pop-sm border-2 p-1.5",
                  myMood === m.value ? "border-primary bg-primary/15" : "border-foreground/5",
                )}
                style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
              >
                <MoodIcon value={m.value} label={m.label} sizeClass="size-8" />
              </button>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={shuffle}
              className="rounded-xl font-bold"
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="font-display font-extrabold text-sm flex items-center gap-2">
            You're feeling{" "}
            <MoodIcon value={myMood} label={moodIconLabel(myMood)} sizeClass="size-9" /> today
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-bold text-primary-dark hover:underline"
          >
            Change
          </button>
        </>
      )}
    </div>
  );
}

function FamilyMoodPanel({
  members,
  moods,
}: {
  members: Member[];
  moods: Record<number, string | null>;
}) {
  return (
    <div
      className="rounded-3xl bg-card border-2 border-foreground/5 shadow-pop-sm p-4 space-y-3"
      style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
    >
      <h3 className="font-display font-extrabold text-sm uppercase tracking-wide flex items-center gap-2">
        Family vibes today
      </h3>
      <div className="grid grid-cols-5 gap-2">
        {members.map((m) => (
          <div key={m.id} className="flex flex-col items-center gap-1.5">
            <div className="relative">
              <Avatar nickname={m.nickname} color={m.color} size={44} />
              <span className="absolute -bottom-1 -right-1 bg-card rounded-full size-7 grid place-items-center border-2 border-card shadow-pop-sm p-0.5">
                {isMoodIconValue(moods[m.id]) ? (
                  <MoodIcon
                    value={moods[m.id]}
                    label={moodIconLabel(moods[m.id])}
                    sizeClass="size-5"
                  />
                ) : (
                  "?"
                )}
              </span>
            </div>
            <div className="text-[10px] font-extrabold uppercase truncate w-full text-center">
              {m.nickname}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pickMoodIcons() {
  return [...MOOD_ICON_OPTIONS].sort(() => Math.random() - 0.5).slice(0, 5);
}

function moodIconLabel(value: string | null) {
  return MOOD_ICON_OPTIONS.find((icon) => icon.value === value)?.label ?? "Mood";
}

function isMoodIconValue(value: string | null): value is string {
  return typeof value === "string" && value.startsWith("/mood-icons/");
}

function MoodIcon({
  value,
  label,
  sizeClass,
}: {
  value: string | null;
  label: string;
  sizeClass: string;
}) {
  if (!isMoodIconValue(value)) return null;
  return (
    <img src={value} alt={label} className={cn(sizeClass, "object-contain")} draggable={false} />
  );
}

// ============================================================
// Avatar
// ============================================================

function Avatar({
  nickname,
  color,
  size = 36,
}: {
  nickname: string | null;
  color?: string;
  size?: number;
}) {
  const initial = nickname?.[0]?.toUpperCase() ?? "?";
  return (
    <div
      className="rounded-2xl grid place-items-center font-display font-black text-primary-foreground shrink-0 shadow-pop-sm border-2 border-card"
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? "#1CB0F6",
        fontSize: size * 0.42,
        ["--shadow-color" as any]: "oklch(0 0 0 / 0.1)",
      }}
    >
      {nickname == null ? "🦖" : initial}
    </div>
  );
}

// ============================================================
// Composer
// ============================================================

function ShoutoutComposer({
  currentUser,
  members,
  onPost,
  posting,
}: {
  currentUser: Member;
  members: Member[];
  onPost: (payload: PostPayload) => Promise<void> | void;
  posting: boolean;
}) {
  const [text, setText] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [sticker, setSticker] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canPost = (text.trim().length > 0 || sticker || imageFile) && !imageError && !posting;

  const handleFile = (f: File | undefined) => {
    setImageError(null);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
      setImageError("Only JPG, PNG, WEBP, or GIF images are supported.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setImageError("Image too large. Maximum size is 5 MB.");
      return;
    }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };
  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setImageError(null);
  };

  const insertMention = (m: Member) => {
    setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}@${m.nickname} `);
    if (!tags.find((t) => t.userId === m.id))
      setTags((t) => [...t, { userId: m.id, nickname: m.nickname }]);
  };

  const submit = async () => {
    const postType: PostType = imageFile ? (text.trim() ? "shoutout" : "photo") : "shoutout";
    try {
      await onPost({
        text,
        sticker,
        imageFile,
        tags,
        postType,
      });
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setText("");
      setTags([]);
      setSticker(null);
      setImageFile(null);
      setImagePreview(null);
    } catch {
      // mutation errors are handled by parent
    }
  };

  return (
    <div
      className="rounded-3xl bg-card border-2 border-foreground/5 shadow-pop-sm p-4 space-y-3"
      style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
    >
      <div className="flex gap-3">
        <Avatar nickname={currentUser.nickname} color={currentUser.color} size={40} />
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 200))}
          placeholder="Say something to the family…"
          rows={2}
          className="resize-none border-2 rounded-2xl"
          maxLength={200}
        />
      </div>

      {(imagePreview || sticker || tags.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap pl-13">
          {imagePreview && (
            <div className="relative">
              <img
                src={imagePreview}
                alt=""
                className="h-20 rounded-xl object-cover border-2 border-foreground/10"
              />
              <button
                onClick={clearImage}
                aria-label="Remove image"
                className="absolute -top-2 -right-2 size-6 rounded-full bg-destructive text-destructive-foreground grid place-items-center shadow-pop-sm"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {sticker && (
            <button
              onClick={() => setSticker(null)}
              className="text-3xl bg-secondary/60 rounded-xl size-12 grid place-items-center border-2 border-foreground/10 hover:bg-destructive/20"
            >
              {sticker}
            </button>
          )}
          {tags.map((t) => (
            <span
              key={t.userId}
              className="rounded-full bg-info/15 text-info font-bold text-xs px-2 py-1"
            >
              @{t.nickname}
            </span>
          ))}
        </div>
      )}

      {imageError && (
        <div className="text-xs font-bold text-destructive flex items-center gap-1.5">
          <AlertCircle className="size-3.5" /> {imageError}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Mention member">
                <AtSign className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-1">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => insertMention(m)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/60 text-left"
                >
                  <Avatar nickname={m.nickname} color={m.color} size={28} />
                  <span className="font-bold text-sm">@{m.nickname}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Add sticker">
                <Smile className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60">
              <div className="grid grid-cols-4 gap-2">
                {STICKERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSticker(sticker === s ? null : s)}
                    className={cn(
                      "text-3xl rounded-xl size-12 grid place-items-center bg-secondary/60 hover:scale-110 transition border-2",
                      sticker === s ? "border-primary bg-primary/15" : "border-transparent",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Attach image"
            onClick={() => fileRef.current?.click()}
          >
            <ImageIcon className="size-4" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <span className="text-[11px] font-bold text-muted-foreground ml-1 tabular-nums">
            {text.length}/200
          </span>
        </div>
        <Button
          onClick={submit}
          disabled={!canPost}
          className="rounded-2xl shadow-pop-sm h-10 px-5 font-display font-extrabold uppercase"
        >
          {posting ? (
            "Posting…"
          ) : (
            <>
              <Send className="size-4" /> Post
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Post card
// ============================================================

const BADGE_META: Record<PostType, { label: string; cls: string } | null> = {
  activity: null,
  shoutout: { label: "✍️ Shoutout", cls: "bg-info/15 text-info border-info/30" },
  photo: { label: "📷 Photo", cls: "bg-purple/15 text-purple border-purple/30" },
  boost: { label: "⚡ Boost", cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  weekly_recap: { label: "📊 Weekly Recap", cls: "bg-pink/15 text-pink border-pink/30" },
};

function WallPostCard({
  post,
  familyId,
  isParent,
  currentUserId,
  onReact,
  onDelete,
  onBoost,
  threadOpen,
  onToggleThread,
  comments,
  onAddComment,
  onDeleteComment,
  onOpenImage,
}: {
  post: WallPost;
  familyId: number;
  isParent: boolean;
  currentUserId: number;
  onReact: (e: string) => void;
  onDelete: () => void;
  onBoost: (xp: number, message: string) => void;
  threadOpen: boolean;
  onToggleThread: () => void;
  comments: Comment[];
  onAddComment: (text: string) => void;
  onDeleteComment: (id: number) => void;
  onOpenImage: (src: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const canDelete = currentUserId === post.authorId || isParent;
  const canBoost =
    isParent &&
    (post.postType === "activity" || post.postType === "boost") &&
    post.authorId !== currentUserId;
  const badge = BADGE_META[post.postType];
  const isRecap = post.postType === "weekly_recap";

  return (
    <article
      className={cn(
        "rounded-3xl bg-card border-2 border-foreground/5 shadow-pop-sm p-4 md:p-5 space-y-3 transition",
        isRecap && "border-pink/30 bg-gradient-to-br from-pink/5 to-transparent",
        post.isBoosted && "ring-2 ring-warning/40",
      )}
      style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
    >
      {isRecap && (
        <div className="rounded-xl bg-pink/15 px-3 py-1.5 font-display font-extrabold text-sm text-pink inline-flex items-center gap-2">
          📊 Weekly Recap
        </div>
      )}

      <header className="flex items-start gap-3">
        <Avatar nickname={post.authorNickname} color={post.authorColor} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-extrabold truncate">
              {post.authorNickname ?? "DinoQuest"}
            </span>
            {badge && (
              <span
                className={cn(
                  "text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md border",
                  badge.cls,
                )}
              >
                {badge.label}
              </span>
            )}
            {post.isBoosted && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md bg-warning text-warning-foreground">
                <Zap className="size-3" /> Boosted
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </div>
        </div>
        {canDelete && (
          <button
            onClick={() => setConfirming(true)}
            aria-label="Delete post"
            className="size-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </header>

      {post.imageUrl && (
        <button
          type="button"
          onClick={() => onOpenImage(post.imageUrl!)}
          className="block w-full rounded-2xl overflow-hidden border-2 border-foreground/5"
        >
          <img src={post.imageUrl} alt="Photo post" className="w-full h-auto object-cover" />
        </button>
      )}

      {post.content && <p className="text-sm leading-relaxed font-medium">{post.content}</p>}

      {post.stickerUrl && <div className="text-5xl">{post.stickerUrl}</div>}

      {post.tags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {post.tags.map((t) => (
            <span
              key={t.userId}
              className="text-xs rounded-full bg-secondary/60 px-2 py-0.5 font-bold"
            >
              @{t.nickname}
            </span>
          ))}
        </div>
      )}

      <ReactionBar
        familyId={familyId}
        postId={post.id}
        reactions={post.reactionCounts}
        onReact={onReact}
      />

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-foreground/5">
        <button
          onClick={onToggleThread}
          className="text-xs font-extrabold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          💬 {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
        </button>
        {canBoost && <BoostButton recipient={post.authorNickname ?? "kid"} onBoost={onBoost} />}
      </div>

      {threadOpen && (
        <CommentThread
          comments={comments}
          currentUserId={currentUserId}
          isParent={isParent}
          onAdd={onAddComment}
          onDelete={onDeleteComment}
        />
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                onDelete();
              }}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

// ============================================================
// Reactions
// ============================================================

const EMOJI_NAMES: Record<string, string> = {
  "🔥": "fire",
  "⭐": "star",
  "💪": "strong",
  "🎉": "party",
  "👏": "clap",
  "😮": "wow",
};

function ReactionBar({
  familyId,
  postId,
  reactions,
  onReact,
}: {
  familyId: number;
  postId: number;
  reactions: Reaction[];
  onReact: (e: string) => void;
}) {
  const [whoOpen, setWhoOpen] = useState<string | null>(null);
  const { data: whoData } = useQuery({
    queryKey: ["reaction-who", familyId, postId, whoOpen],
    queryFn: () =>
      apiRequest<{ nicknames: string[] }>(
        `/api/families/${familyId}/wall-posts/${postId}/reactions/${encodeURIComponent(whoOpen ?? "")}/users`,
      ),
    enabled: !!whoOpen,
  });

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {reactions
        .filter((r) => r.count > 0)
        .map((r) => {
          const isOpen = whoOpen === r.emoji;
          return (
            <div
              key={r.emoji}
              className={cn(
                "inline-flex items-center rounded-full text-sm font-bold transition border-2 overflow-hidden",
                r.reactedByMe
                  ? "bg-primary/15 border-primary text-primary-dark"
                  : "bg-secondary/60 border-transparent hover:border-foreground/10",
              )}
            >
              <button
                aria-label={`React with ${EMOJI_NAMES[r.emoji] ?? r.emoji}`}
                aria-pressed={r.reactedByMe}
                onClick={() => onReact(r.emoji)}
                className="inline-flex items-center gap-1 px-2 h-8"
              >
                <span className="text-base leading-none">{r.emoji}</span>
              </button>
              <Popover open={isOpen} onOpenChange={(open) => setWhoOpen(open ? r.emoji : null)}>
                <PopoverTrigger asChild>
                  <button
                    aria-label={`View who reacted with ${EMOJI_NAMES[r.emoji] ?? r.emoji}`}
                    className="h-8 px-2 border-l border-foreground/10 hover:bg-secondary/70 tabular-nums"
                  >
                    {r.count}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3">
                  <div className="text-xs font-extrabold uppercase text-muted-foreground mb-2">
                    Reacted
                  </div>
                  {(whoData?.nicknames?.length ?? 0) === 0 ? (
                    <div className="text-sm text-muted-foreground">No reactions yet.</div>
                  ) : (
                    <ul className="space-y-1">
                      {(whoData?.nicknames ?? []).map((name) => (
                        <li key={name} className="text-sm font-medium">
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          );
        })}
      <Popover>
        <PopoverTrigger asChild>
          <button
            aria-label="Add reaction"
            className="inline-flex items-center justify-center size-8 rounded-full bg-secondary/60 hover:bg-secondary border-2 border-transparent hover:border-foreground/10"
          >
            <Plus className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-1.5">
          <div className="flex items-center gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                aria-label={`React with ${EMOJI_NAMES[e]}`}
                onClick={() => onReact(e)}
                className="text-2xl rounded-lg size-9 hover:bg-secondary/60 transition"
              >
                {e}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================================
// Comments
// ============================================================

function CommentThread({
  comments,
  currentUserId,
  isParent,
  onAdd,
  onDelete,
}: {
  comments: Comment[];
  currentUserId: number;
  isParent: boolean;
  onAdd: (t: string) => void;
  onDelete: (id: number) => void;
}) {
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };
  return (
    <div className="rounded-2xl bg-secondary/30 p-3 space-y-2.5">
      {comments.map((c) => (
        <div key={c.id} className="flex items-start gap-2.5 group">
          <Avatar nickname={c.authorNickname} color={c.authorColor} size={28} />
          <div className="flex-1 min-w-0">
            <div className="rounded-2xl bg-card border-2 border-foreground/5 px-3 py-2">
              <div className="text-xs font-extrabold">{c.authorNickname}</div>
              <div className="text-sm">{c.text}</div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 ml-1">
              {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
            </div>
          </div>
          {(c.authorId === currentUserId || isParent) && (
            <button
              onClick={() => onDelete(c.id)}
              aria-label="Delete comment"
              className="opacity-0 group-hover:opacity-100 size-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center transition"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Input
          aria-label="Write a comment"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 280))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Write a comment…"
          className="rounded-full border-2"
        />
        <Button
          size="icon"
          disabled={!text.trim()}
          onClick={send}
          aria-label="Send"
          className="rounded-full"
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Boost
// ============================================================

function BoostButton({
  recipient,
  onBoost,
}: {
  recipient: string;
  onBoost: (xp: number, message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [xp, setXp] = useState(25);
  const [msg, setMsg] = useState("");

  const send = () => {
    onBoost(xp, msg.trim());
    setOpen(false);
    setXp(25);
    setMsg("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-xs font-extrabold uppercase px-3 h-8 rounded-full bg-warning text-warning-foreground shadow-pop-sm hover:scale-[1.03] transition"
          style={{ ["--shadow-color" as any]: "oklch(0.55 0.16 60)" }}
        >
          <Zap className="size-3.5" /> Boost
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3">
        <div className="font-display font-extrabold text-sm">Give {recipient} a bonus boost!</div>
        <div className="grid grid-cols-4 gap-1.5">
          {[10, 25, 50, 100].map((v) => (
            <button
              key={v}
              onClick={() => setXp(v)}
              className={cn(
                "py-2 rounded-xl text-sm font-extrabold border-2 transition",
                xp === v
                  ? "bg-warning text-warning-foreground border-warning shadow-pop-sm"
                  : "bg-secondary/50 border-transparent hover:border-foreground/10",
              )}
              style={{ ["--shadow-color" as any]: "oklch(0.55 0.16 60)" }}
            >
              +{v}
            </button>
          ))}
        </div>
        <Input
          maxLength={100}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Add a personal message…"
        />
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-xl font-display font-extrabold uppercase"
            onClick={send}
          >
            <Zap className="size-4" /> Send
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// Pinboard
// ============================================================

function ParentRewardCard({
  childMembers,
  open,
  onOpenChange,
  selectedChildId,
  onSelectChild,
  isPending,
  onSubmit,
}: {
  childMembers: Member[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedChildId: number | null;
  onSelectChild: (id: number | null) => void;
  isPending: boolean;
  onSubmit: (values: {
    childUserId: number;
    xp: number;
    reason?: string;
  }) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<GiveXpValues>({
    resolver: zodResolver(giveXpSchema),
    defaultValues: {
      childUserId: selectedChildId ?? 0,
      xp: 10_000,
      reason: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      childUserId: selectedChildId ?? 0,
      xp: 10_000,
      reason: "",
    });
  }, [open, reset, selectedChildId]);

  const xp = watch("xp") ?? 0;
  const selectedChild =
    childMembers.find((child) => child.id === Number(watch("childUserId") || selectedChildId)) ??
    null;

  const submit = handleSubmit(async (values) => {
    const reason = values.reason?.trim();
    await onSubmit({
      childUserId: values.childUserId,
      xp: values.xp,
      reason: reason ? reason : undefined,
    });
  });

  return (
    <div
      className="rounded-3xl bg-card border-2 border-foreground/5 shadow-pop-sm p-4 space-y-3"
      style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
    >
      <Button
        type="button"
        className="w-full rounded-2xl h-11 font-display font-extrabold uppercase bg-purple hover:bg-purple/90 text-white"
        onClick={() => onOpenChange(true)}
        disabled={childMembers.length === 0}
      >
        <Gift className="size-4" /> Give XP
      </Button>
      {childMembers.length === 0 && (
        <p className="text-xs text-muted-foreground text-center">No child member available.</p>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6">
            <div className="flex items-center gap-3">
              <div
                className="size-11 rounded-2xl text-white grid place-items-center font-display font-black text-lg"
                style={{ backgroundColor: selectedChild?.color ?? "#1CB0F6" }}
              >
                {(selectedChild?.nickname ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <DialogTitle className="font-display font-black text-xl">Give XP</DialogTitle>
                <DialogDescription>{selectedChild?.nickname ?? "Choose a child"}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={submit} className="px-6 pb-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                Child
              </Label>
              <select
                value={selectedChildId ?? ""}
                onChange={(e) => {
                  const nextId = Number(e.target.value);
                  onSelectChild(Number.isFinite(nextId) ? nextId : null);
                  setValue("childUserId", nextId, { shouldValidate: true, shouldDirty: true });
                }}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-bold"
              >
                {childMembers.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.nickname}
                  </option>
                ))}
              </select>
              {errors.childUserId?.message && (
                <p className="text-xs font-bold text-destructive">{errors.childUserId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                XP amount
              </Label>
              <Input type="number" min={1} max={MAX_PARENT_REWARD_VALUE} {...register("xp")} />
              <div className="flex flex-wrap gap-2">
                {REWARD_QUICK_ADD.map((value) => (
                  <button
                    key={`xp-${value}`}
                    type="button"
                    onClick={() =>
                      setValue(
                        "xp",
                        Math.min(MAX_PARENT_REWARD_VALUE, Math.max(1, Number(xp || 0) + value)),
                        { shouldValidate: true, shouldDirty: true },
                      )
                    }
                    className="rounded-full border-2 border-border bg-secondary/60 px-3 py-1 text-xs font-extrabold"
                  >
                    +{value.toLocaleString()}
                  </button>
                ))}
              </div>
              {errors.xp?.message && (
                <p className="text-xs font-bold text-destructive">{errors.xp.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                Reason / note
              </Label>
              <Textarea
                rows={2}
                maxLength={100}
                placeholder="e.g. Helped carry groceries 🛒"
                {...register("reason")}
              />
              {errors.reason?.message && (
                <p className="text-xs font-bold text-destructive">{errors.reason.message}</p>
              )}
            </div>

            <DialogFooter className="px-0 pb-0">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-purple hover:bg-purple/90 text-white"
                  disabled={isPending}
                >
                  {isPending ? "Awarding..." : "Award XP"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pinboard({
  pins,
  isParent,
  currentUserId,
  onAck,
  onRemove,
  onCreate,
}: {
  pins: Pin[];
  isParent: boolean;
  currentUserId: number;
  onAck: (id: number) => void;
  onRemove: (id: number) => void;
  onCreate: (msg: string, expiresAt: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const atMax = pins.length >= 5;

  return (
    <div
      className="rounded-3xl bg-card border-2 border-foreground/5 shadow-pop-sm p-5 space-y-3"
      style={{ ["--shadow-color" as any]: "oklch(0 0 0 / 0.06)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display font-extrabold uppercase tracking-wide text-sm flex items-center gap-2">
          <Pin className="size-4 text-pink" /> Pinboard
        </h3>
        {isParent && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs"
            disabled={atMax}
            onClick={() => setCreating(true)}
            title={atMax ? "Maximum 5 pins reached. Remove one to add a new pin." : undefined}
          >
            <Plus className="size-3.5" /> Pin
          </Button>
        )}
      </div>

      {pins.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">No pins yet</div>
      ) : (
        <ul className="space-y-2">
          {pins.map((p) => {
            const acked = p.acknowledgements.some((a) => a.userId === currentUserId);
            return (
              <li
                key={p.id}
                className="rounded-2xl bg-warning/10 border-2 border-warning/25 p-3 space-y-2 relative"
              >
                <div className="text-sm font-bold leading-snug">📌 {p.message}</div>
                <div className="text-[11px] text-muted-foreground font-bold flex items-center justify-between gap-2 flex-wrap">
                  <span>Pinned by {p.createdBy}</span>
                  {p.expiresAt && <span>Expires {format(new Date(p.expiresAt), "MMM d")}</span>}
                </div>
                {isParent && (
                  <div className="text-[11px] font-bold text-muted-foreground">
                    ✓ {p.acknowledgements.length}/{p.totalMembers} members seen this
                  </div>
                )}
                <div className="flex items-center justify-between">
                  {!acked ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Acknowledge pin: ${p.message.slice(0, 20)}`}
                      onClick={() => onAck(p.id)}
                      className="rounded-full h-7 px-3 text-xs font-extrabold"
                    >
                      <CheckCircle2 className="size-3.5" /> Got it
                    </Button>
                  ) : (
                    <span className="text-xs font-bold text-success-foreground flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" /> Acknowledged
                    </span>
                  )}
                  {isParent && (
                    <button
                      onClick={() => onRemove(p.id)}
                      aria-label="Remove pin"
                      className="size-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive grid place-items-center"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CreatePinModal
        open={creating}
        onOpenChange={setCreating}
        onCreate={(m, e) => {
          onCreate(m, e);
          setCreating(false);
        }}
      />
    </div>
  );
}

function CreatePinModal({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (msg: string, expiresAt: string | null) => void;
}) {
  const [msg, setMsg] = useState("");
  const [exp, setExp] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display font-black text-xl">📌 New pin</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Message</Label>
            <Textarea
              rows={3}
              value={msg}
              onChange={(e) => setMsg(e.target.value.slice(0, 300))}
              maxLength={300}
            />
            <div className="text-[10px] text-muted-foreground tabular-nums text-right">
              {msg.length}/300
            </div>
          </div>
          <div>
            <Label>Expires on (optional)</Label>
            <Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!msg.trim()}
            onClick={() => {
              onCreate(msg.trim(), exp ? new Date(exp).toISOString() : null);
              setMsg("");
              setExp("");
            }}
            className="rounded-xl font-display font-extrabold uppercase"
          >
            Pin it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Lightbox
// ============================================================

function PhotoLightbox({
  image,
  onClose,
}: {
  image: { src: string; caption: string };
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 size-10 rounded-full bg-white/15 hover:bg-white/25 text-white grid place-items-center"
      >
        <X className="size-5" />
      </button>
      <img
        src={image.src}
        alt={image.caption || "Photo"}
        className="max-w-full max-h-[80vh] object-contain rounded-xl"
        onClick={(e) => e.stopPropagation()}
      />
      {image.caption && (
        <div
          className="mt-4 text-white/90 text-sm max-w-2xl text-center font-medium"
          onClick={(e) => e.stopPropagation()}
        >
          {image.caption}
        </div>
      )}
    </div>
  );
}
