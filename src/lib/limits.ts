/** Central limits for desk panels (easy to bump later). */
export const LIMITS = {
  folders: 20,
  savedConversations: 20,
  /** Max saved chats counted inside a single project */
  projectSavedConversations: 20,
  /** Max chat threads kept per project (saved + recent) */
  projectConversations: 40,
  recentConversations: 10,
  projects: 10,
  tasks: 10,
  displayItems: 80,
} as const;
