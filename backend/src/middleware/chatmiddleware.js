
"use strict";

const chatConfig = require("../config/chatconfig");

const requireChatEnabled = (req, res, next) => {
  if (!chatConfig.enabled) {
    return res.status(503).json({
      success: false,
      message: "Chat is currently unavailable.",
    });
  }

  return next();
};

const requireChatUser = (req, res, next) => {
  const userId = Number(req.user?.user_id);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  return next();
};

module.exports = {
  requireChatEnabled,
  requireChatUser,
};
