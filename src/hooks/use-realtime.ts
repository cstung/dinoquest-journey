import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

type RealtimeMessage = {
  event: string;
  payload?: Record<string, unknown>;
};

function wsBaseUrl(): string {
  const explicit = import.meta.env.VITE_WS_BASE_URL as string | undefined;
  if (explicit && explicit.trim()) return explicit.replace(/\/$/, "");

  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (apiBase) {
    const normalized = apiBase.replace(/\/$/, "");
    if (normalized.startsWith("https://")) return normalized.replace("https://", "wss://");
    if (normalized.startsWith("http://")) return normalized.replace("http://", "ws://");
  }

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

async function fetchWsToken(): Promise<string> {
  const data = await apiRequest<{ wsToken: string }>("/api/auth/ws-token");
  return data.wsToken;
}

export function useFamilyRealtime(
  familyId: number | null,
  isAuthenticated: boolean,
  queryClient: QueryClient,
) {
  useEffect(() => {
    if (!isAuthenticated || !familyId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let reconnectTimer: number | null = null;

    const connect = async () => {
      try {
        const token = await fetchWsToken();
        if (closed) return;
        const url = `${wsBaseUrl()}/ws/families/${familyId}?token=${encodeURIComponent(token)}`;
        ws = new WebSocket(url);
        ws.onmessage = (ev) => {
          let msg: RealtimeMessage | null = null;
          try {
            msg = JSON.parse(ev.data) as RealtimeMessage;
          } catch {
            return;
          }
          if (!msg?.event) return;
          if (msg.event === "pong") return;

          if (
            msg.event === "xp_earned" ||
            msg.event === "leaderboard_update" ||
            msg.event === "test_completed" ||
            msg.event === "reopen_resolved" ||
            msg.event === "reward_claim_resolved"
          ) {
            queryClient.invalidateQueries({ queryKey: ["leaderboard", familyId] });
          }
          if (
            msg.event === "quest_updated" ||
            msg.event === "quest_cycle_created" ||
            msg.event === "quest_missed" ||
            msg.event === "xp_earned"
          ) {
            queryClient.invalidateQueries({ queryKey: ["quests", familyId] });
            queryClient.invalidateQueries({ queryKey: ["family-activity", "activity", familyId] });
          }
          if (
            msg.event === "test_assigned" ||
            msg.event === "test_completed" ||
            msg.event === "reopen_requested" ||
            msg.event === "reopen_resolved"
          ) {
            queryClient.invalidateQueries({ queryKey: ["tests", familyId] });
            queryClient.invalidateQueries({ queryKey: ["family-activity", "activity", familyId] });
          }
          if (msg.event === "pet_updated") {
            queryClient.invalidateQueries({ queryKey: ["pets", familyId] });
          }
          if (
            msg.event === "reward_updated" ||
            msg.event === "reward_claimed" ||
            msg.event === "reward_claim_resolved"
          ) {
            queryClient.invalidateQueries({ queryKey: ["rewards", familyId] });
            queryClient.invalidateQueries({ queryKey: ["reward-claims", familyId] });
            queryClient.invalidateQueries({ queryKey: ["family-activity", "activity", familyId] });
          }
        };
        ws.onclose = () => {
          if (closed) return;
          reconnectTimer = window.setTimeout(connect, 2000);
        };
      } catch {
        if (!closed) reconnectTimer = window.setTimeout(connect, 3000);
      }
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
    };
  }, [familyId, isAuthenticated, queryClient]);
}
