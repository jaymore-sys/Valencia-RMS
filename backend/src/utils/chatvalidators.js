
"use strict";

const chatConfig = require("../config/chatconfig");

const parsePositiveId = (value) => {
  if (
    typeof value !== "string" &&
    typeof value !== "number"
  ) {
    return null;
  }

  const raw = String(value).trim();

  if (!/^[1-9]\d*$/.test(raw)) {
    return null;
  }

  const id = Number(raw);

  return Number.isSafeInteger(id) ? id : null;
};

const validateMessage = (value) => {
  if (typeof value !== "string") {
    return {
      valid: false,
      message: "Message must be text.",
    };
  }

  const text = value.trim();

  if (!text) {
    return {
      valid: false,
      message: "Message cannot be empty.",
    };
  }

  if (text.length > chatConfig.messageMaxLength) {
    return {
      valid: false,
      message: `Message exceeds ${chatConfig.messageMaxLength} characters.`,
    };
  }

  return {
    valid: true,
    text,
  };
};

const parsePageSize = (value) => {
  if (value === undefined || value === null || value === "") {
    return chatConfig.messagePageSize;
  }

  const parsed = parsePositiveId(value);

  if (parsed === null) {
    return null;
  }

  return Math.min(
    parsed,
    chatConfig.maxMessagePageSize
  );
};

module.exports = {
  parsePositiveId,
  validateMessage,
  parsePageSize,
};
