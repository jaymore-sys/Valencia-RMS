
"use strict";

const db = require("../config/db");

const fail = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

const getMySpace = async (req, res) => {
  const userId = Number(req.user.user_id);

  let connection;
  let inTransaction = false;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();
    inTransaction = true;

    // Serialize concurrent first-time creation
    // requests using the existing users row.
    const [users] = await connection.execute(
      `SELECT user_id, status
       FROM users
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (
      users.length !== 1 ||
      ["blocked", "deleted"].includes(users[0].status)
    ) {
      await connection.rollback();
      inTransaction = false;

      return fail(res, 403, "User unavailable.");
    }

    const [existing] = await connection.execute(
      `SELECT conversation_id
       FROM chat_self_conversations
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (existing.length) {
      await connection.commit();
      inTransaction = false;

      return res.json({
        success: true,
        conversation_id: existing[0].conversation_id,
        conversation_type: "self",
        created: false,
      });
    }

    const [result] = await connection.execute(
      `INSERT INTO chat_conversations
         (conversation_type, group_name, created_by)
       VALUES ('self', NULL, ?)`,
      [userId]
    );

    const conversationId = result.insertId;

    await connection.execute(
      `INSERT INTO chat_participants
         (conversation_id, user_id, participant_role)
       VALUES (?, ?, 'admin')`,
      [conversationId, userId]
    );

    await connection.execute(
      `INSERT INTO chat_self_conversations
         (user_id, conversation_id)
       VALUES (?, ?)`,
      [userId, conversationId]
    );

    await connection.commit();
    inTransaction = false;

    return res.status(201).json({
      success: true,
      conversation_id: conversationId,
      conversation_type: "self",
      created: true,
    });
  } catch (error) {
    if (inTransaction && connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "[MY SPACE ROLLBACK]",
          rollbackError
        );
      }
    }

    console.error("[MY SPACE]", error);

    return fail(res, 500, "Unable to open My Space.");
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  getMySpace,
};
