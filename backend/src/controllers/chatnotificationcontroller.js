
"use strict";

const db = require("../config/db");

const getChatUnreadSummary = async (req, res) => {
  try {
    const userId = Number(req.user.user_id);

    const [rows] = await db.execute(
      `SELECT
         cp.conversation_id,
         COUNT(m.message_id) AS unread_count
       FROM chat_participants cp
       LEFT JOIN chat_messages m
         ON m.conversation_id = cp.conversation_id
         AND m.message_id >
             GREATEST(
               COALESCE(cp.last_read_message_id, 0),
               cp.joined_after_message_id
             )
         AND m.deleted_at IS NULL
         AND m.sender_id <> cp.user_id
       WHERE cp.user_id = ?
       GROUP BY cp.conversation_id`,
      [userId]
    );

    const conversations = rows.map((row) => ({
      conversation_id: row.conversation_id,
      unread_count: Number(row.unread_count),
    }));

    const totalUnread = conversations.reduce(
      (sum, row) => sum + row.unread_count,
      0
    );

    return res.json({
      success: true,
      total_unread: totalUnread,
      conversations,
    });
  } catch (error) {
    console.error("[CHAT UNREAD SUMMARY]", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve chat notifications.",
    });
  }
};

module.exports = {
  getChatUnreadSummary,
};
