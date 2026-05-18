export interface Family {
  id: number;
  name: string;
  motto: string;
  colorHex: string;
  memberCount: number;
  role: "parent" | "child";
}

export const families: Family[] = [
  {
    id: 1,
    name: "The Rivera Squad",
    motto: "Learning together, growing together",
    colorHex: "#58CC02",
    memberCount: 5,
    role: "parent",
  },
  {
    id: 2,
    name: "Sunshine Crew",
    motto: "Adventure every day",
    colorHex: "#FF9600",
    memberCount: 3,
    role: "parent",
  },
];

export interface Child {
  id: number;
  name: string;
  avatarColor: string;
  level: number;
  xp: number;
  streak: number;
}

export const children: Child[] = [
  { id: 11, name: "Mia", avatarColor: "#58CC02", level: 8, xp: 1820, streak: 14 },
  { id: 12, name: "Leo", avatarColor: "#1CB0F6", level: 5, xp: 940, streak: 7 },
  { id: 13, name: "Sofia", avatarColor: "#CE82FF", level: 6, xp: 1230, streak: 21 },
];

export type QuestCategory = "Daily" | "Learning" | "Creative" | "Epic";
export type QuestStatus = "pending" | "completed";

export interface Quest {
  id: number;
  title: string;
  description: string;
  category: QuestCategory;
  xp: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Epic";
  dueDate?: string;
  status: QuestStatus;
  assignedTo: number[];
  recurring?: boolean;
}

export const quests: Quest[] = [
  {
    id: 1,
    title: "Read for 20 minutes",
    description: "Curl up with your favorite book and read for at least 20 minutes.",
    category: "Daily",
    xp: 30,
    difficulty: "Easy",
    dueDate: "2026-05-19",
    status: "pending",
    assignedTo: [11, 12],
    recurring: true,
  },
  {
    id: 2,
    title: "Draw your dream dinosaur",
    description: "Use any medium to draw your wildest dino imagination.",
    category: "Creative",
    xp: 50,
    difficulty: "Medium",
    dueDate: "2026-05-20",
    status: "pending",
    assignedTo: [13],
  },
  {
    id: 3,
    title: "Master the times tables",
    description: "Practice multiplication tables 1–10.",
    category: "Learning",
    xp: 80,
    difficulty: "Hard",
    status: "completed",
    assignedTo: [11],
  },
  {
    id: 4,
    title: "Build a backyard fort",
    description: "Construct an epic fort using whatever you can find.",
    category: "Epic",
    xp: 150,
    difficulty: "Epic",
    dueDate: "2026-05-25",
    status: "pending",
    assignedTo: [11, 12, 13],
  },
  {
    id: 5,
    title: "Make your bed",
    description: "Start the day with a clean slate.",
    category: "Daily",
    xp: 10,
    difficulty: "Easy",
    status: "completed",
    assignedTo: [12],
    recurring: true,
  },
  {
    id: 6,
    title: "Learn 5 Spanish words",
    description: "Add to your vocabulary with five new words.",
    category: "Learning",
    xp: 40,
    difficulty: "Medium",
    dueDate: "2026-05-18",
    status: "pending",
    assignedTo: [11, 13],
  },
];

export interface Test {
  id: number;
  title: string;
  videoId: string;
  thumbnailUrl: string;
  questionCount: number;
  timeLimit: number;
  xp: number;
  status: "draft" | "published" | "completed" | "reopen_requested";
  assignedTo: number[];
  subtitleSource: "youtube_auto" | "whisper";
}

export const tests: Test[] = [
  {
    id: 1,
    title: "How Volcanoes Work",
    videoId: "ZCkn3l_RtgU",
    thumbnailUrl: "https://img.youtube.com/vi/ZCkn3l_RtgU/hqdefault.jpg",
    questionCount: 10,
    timeLimit: 30,
    xp: 100,
    status: "published",
    assignedTo: [11, 12],
    subtitleSource: "youtube_auto",
  },
  {
    id: 2,
    title: "The Solar System Explained",
    videoId: "libKVRa01L8",
    thumbnailUrl: "https://img.youtube.com/vi/libKVRa01L8/hqdefault.jpg",
    questionCount: 8,
    timeLimit: 20,
    xp: 80,
    status: "completed",
    assignedTo: [13],
    subtitleSource: "youtube_auto",
  },
  {
    id: 3,
    title: "Photosynthesis 101",
    videoId: "D1Ymc311XS8",
    thumbnailUrl: "https://img.youtube.com/vi/D1Ymc311XS8/hqdefault.jpg",
    questionCount: 12,
    timeLimit: 25,
    xp: 120,
    status: "reopen_requested",
    assignedTo: [11],
    subtitleSource: "whisper",
  },
];

export interface Pet {
  id: number;
  name: string;
  species: string;
  stage: "egg" | "hatchling" | "adult" | "evolved";
  level: number;
  xp: number;
  xpToNext: number;
  active: boolean;
  lastFed: string;
  emoji: string;
}

export const pets: Pet[] = [
  {
    id: 1,
    name: "Rex",
    species: "T-Rex",
    stage: "adult",
    level: 12,
    xp: 340,
    xpToNext: 500,
    active: true,
    lastFed: "2 hours ago",
    emoji: "🦖",
  },
  {
    id: 2,
    name: "Spike",
    species: "Stegosaurus",
    stage: "hatchling",
    level: 3,
    xp: 80,
    xpToNext: 150,
    active: false,
    lastFed: "1 day ago",
    emoji: "🦕",
  },
  {
    id: 3,
    name: "Mystery",
    species: "Unknown",
    stage: "egg",
    level: 1,
    xp: 10,
    xpToNext: 100,
    active: false,
    lastFed: "—",
    emoji: "🥚",
  },
];

export interface Reward {
  id: number;
  title: string;
  description: string;
  xpCost: number;
  emoji: string;
}

export const rewards: Reward[] = [
  { id: 1, title: "Extra screen time", description: "30 minutes of bonus screen time", xpCost: 100, emoji: "📱" },
  { id: 2, title: "Pick movie night", description: "You choose tonight's movie", xpCost: 200, emoji: "🎬" },
  { id: 3, title: "Ice cream trip", description: "A trip to the local ice cream shop", xpCost: 350, emoji: "🍦" },
  { id: 4, title: "Stay up late", description: "30 minutes past bedtime", xpCost: 150, emoji: "🌙" },
  { id: 5, title: "New book", description: "Pick out a brand new book", xpCost: 500, emoji: "📚" },
  { id: 6, title: "Theme park day", description: "Family day at the theme park", xpCost: 2000, emoji: "🎢" },
];

export interface ActivityEvent {
  id: number;
  type: "quest" | "test" | "level" | "xp" | "join";
  who: string;
  message: string;
  time: string;
}

export const activity: ActivityEvent[] = [
  { id: 1, type: "quest", who: "Mia", message: "completed 'Read for 20 minutes' and earned 30 XP", time: "5 min ago" },
  { id: 2, type: "level", who: "Leo", message: "reached Level 5!", time: "1 hr ago" },
  { id: 3, type: "test", who: "Sofia", message: "scored 90% on 'The Solar System'", time: "3 hr ago" },
  { id: 4, type: "quest", who: "Mia", message: "completed 'Make your bed'", time: "Today" },
  { id: 5, type: "xp", who: "Leo", message: "earned 80 XP this morning", time: "Today" },
];

export interface NotificationItem {
  id: number;
  type: "quest" | "test" | "xp" | "achievement" | "family";
  title: string;
  description: string;
  time: string;
  unread: boolean;
}

export const notifications: NotificationItem[] = [
  { id: 1, type: "quest", title: "New quest assigned", description: "Mom assigned you 'Read for 20 minutes'", time: "2 min ago", unread: true },
  { id: 2, type: "achievement", title: "Level up!", description: "You reached Level 7 🎉", time: "1 hr ago", unread: true },
  { id: 3, type: "test", title: "Reopen approved", description: "Your reopen for 'Photosynthesis 101' was approved", time: "Yesterday", unread: false },
  { id: 4, type: "family", title: "New family member", description: "Sofia joined The Rivera Squad", time: "2 days ago", unread: false },
];

export interface LeaderboardEntry {
  rank: number;
  name: string;
  avatarColor: string;
  level: number;
  xp: number;
  isYou?: boolean;
}

export const familyLeaderboard: LeaderboardEntry[] = [
  { rank: 1, name: "Mia", avatarColor: "#58CC02", level: 8, xp: 1820 },
  { rank: 2, name: "Alex (You)", avatarColor: "#1CB0F6", level: 7, xp: 1240, isYou: true },
  { rank: 3, name: "Sofia", avatarColor: "#CE82FF", level: 6, xp: 1230 },
  { rank: 4, name: "Leo", avatarColor: "#FF9600", level: 5, xp: 940 },
  { rank: 5, name: "Dad", avatarColor: "#FF86C5", level: 4, xp: 620 },
];

export const globalLeaderboard: LeaderboardEntry[] = [
  { rank: 1, name: "DinoMaster42", avatarColor: "#58CC02", level: 24, xp: 12480 },
  { rank: 2, name: "SkyLearner", avatarColor: "#CE82FF", level: 22, xp: 11240 },
  { rank: 3, name: "QuestQueen", avatarColor: "#FF9600", level: 21, xp: 10980 },
  { rank: 4, name: "Mia", avatarColor: "#58CC02", level: 8, xp: 1820 },
  { rank: 5, name: "Alex (You)", avatarColor: "#1CB0F6", level: 7, xp: 1240, isYou: true },
];
