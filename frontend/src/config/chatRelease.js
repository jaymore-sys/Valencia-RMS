// Frontend release switch. Local Vite development may test Chat.
// A production build must opt in explicitly, and the backend
// CHAT_ENABLED switch must also be enabled for release.
export const CHAT_UI_ENABLED =
  import.meta.env.DEV ||
  import.meta.env.VITE_CHAT_ENABLED === "true";
