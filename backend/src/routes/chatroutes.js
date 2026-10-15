
"use strict";

const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");

const {
  requireChatEnabled,
  requireChatUser,
} = require("../middleware/chatmiddleware");

const {
  getChatUsers,
  createDirectConversation,
  getConversations,
  getMessages,
  sendMessage,
  markConversationRead,
} = require("../controllers/chatcontroller");

const {
  createGroup,
  getGroupMembers,
  addGroupMembers,
  removeGroupMember,
  setGroupMemberHistory,
  renameGroup,
} = require("../controllers/chatgroupcontroller");

const {
  getChatUnreadSummary,
} = require("../controllers/chatnotificationcontroller");

const {
  getMySpace,
} = require("../controllers/chatselfcontroller");

const router = express.Router();

// Chat is disabled unless explicitly enabled.
// All routes require a valid RMS JWT.
router.use(
  requireChatEnabled,
  authMiddleware,
  requireChatUser
);

// People and unread counts
router.get("/users", getChatUsers);
router.post("/my-space", getMySpace);
router.get("/unread-summary", getChatUnreadSummary);

// Conversations
router.get("/conversations", getConversations);

router.post(
  "/conversations/direct",
  createDirectConversation
);

router.post(
  "/conversations/group",
  createGroup
);

// Group operations
router.get(
  "/conversations/:conversationId/members",
  getGroupMembers
);

router.post(
  "/conversations/:conversationId/members",
  addGroupMembers
);

router.delete(
  "/conversations/:conversationId/members/:userId",
  removeGroupMember
);

router.patch(
  "/conversations/:conversationId/members/:userId/history",
  setGroupMemberHistory
);

router.patch(
  "/conversations/:conversationId/group",
  renameGroup
);

// Messages
router.get(
  "/conversations/:conversationId/messages",
  getMessages
);

router.post(
  "/conversations/:conversationId/messages",
  sendMessage
);

// Read tracking
router.patch(
  "/conversations/:conversationId/read",
  markConversationRead
);

module.exports = router;
