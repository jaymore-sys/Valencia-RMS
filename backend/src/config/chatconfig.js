
"use strict";

/**
 * Valencia RMS - Text Chat Configuration
 *
 * Chat is disabled unless CHAT_ENABLED=true
 * is explicitly set in the environment.
 *
 * No separate database pool is created.
 * No existing RMS configuration is modified.
 */

const readPositiveInteger = (name, fallback, maximum) => {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < 1) {
    return fallback;
  }

  return Math.min(value, maximum);
};

const chatConfig = Object.freeze({
  enabled:
    String(process.env.CHAT_ENABLED || "")
      .trim()
      .toLowerCase() === "true",

  messageMaxLength: readPositiveInteger(
    "CHAT_MESSAGE_MAX_LENGTH",
    4000,
    10000
  ),

  groupMaxMembers: readPositiveInteger(
    "CHAT_GROUP_MAX_MEMBERS",
    100,
    500
  ),

  messagePageSize: readPositiveInteger(
    "CHAT_MESSAGE_PAGE_SIZE",
    30,
    100
  ),

  maxMessagePageSize: 100,

  sendRateLimit: readPositiveInteger(
    "CHAT_SEND_RATE_LIMIT",
    30,
    120
  ),

  sendRateWindowMs: 60 * 1000,

  allowAttachments: false,

  allowExternalUsers: false,

  allowMessageEmails: false,
});

module.exports = chatConfig;
