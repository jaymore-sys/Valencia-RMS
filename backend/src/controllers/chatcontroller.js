
"use strict";

const db = require("../config/db");
const {
  parsePositiveId,
  validateMessage,
  parsePageSize,
} = require("../utils/chatvalidators");

const fail = (res, status, message) =>
  res.status(status).json({
    success: false,
    message,
  });

const internalError = (res, error) => {
  console.error("[RMS CHAT]", error);
  return fail(res, 500, "Unable to process chat request.");
};

const rollback = async (connection) => {
  try {
    await connection.rollback();
  } catch (error) {
    console.error("[RMS CHAT ROLLBACK]", error);
  }
};

const getMember = async (conn, conversationId, userId) => {
  const [rows] = await conn.execute(
    `SELECT
       conversation_id,
       user_id,
       last_read_message_id,
       joined_after_message_id,
       history_access
     FROM chat_participants
     WHERE conversation_id = ?
       AND user_id = ?
     LIMIT 1`,
    [conversationId, userId]
  );

  return rows[0] || null;
};

// =====================================================
// GET CHAT USERS
// =====================================================

const getChatUsers = async (req, res) => {
  try {
    const [users] = await db.execute(
      `SELECT
         user_id,
         full_name,
         designation,
         department_id
       FROM users
       WHERE user_id <> ?
         AND status NOT IN ('blocked', 'deleted')
       ORDER BY full_name ASC, user_id ASC
       LIMIT 500`,
      [req.user.user_id]
    );

    return res.json({
      success: true,
      users,
    });
  } catch (error) {
    return internalError(res, error);
  }
};

// =====================================================
// CREATE OR RETRIEVE DIRECT CONVERSATION
// =====================================================

const createDirectConversation = async (req, res) => {
  const myId = Number(req.user.user_id);
  const otherId = parsePositiveId(req.body?.user_id);

  if (!otherId || myId === otherId) {
    return fail(res, 400, "Invalid recipient.");
  }

  const lowId = Math.min(myId, otherId);
  const highId = Math.max(myId, otherId);

  let connection;
  let inTransaction = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    inTransaction = true;

    const [users] = await connection.execute(
      `SELECT user_id, status
       FROM users
       WHERE user_id IN (?, ?)
       ORDER BY user_id
       FOR UPDATE`,
      [lowId, highId]
    );

    if (
      users.length !== 2 ||
      users.some(
        (user) =>
          user.status === "blocked" ||
          user.status === "deleted"
      )
    ) {
      await rollback(connection);
      inTransaction = false;
      return fail(res, 400, "Recipient unavailable.");
    }

    const [existing] = await connection.execute(
      `SELECT conversation_id
       FROM chat_direct_pairs
       WHERE user_low_id = ?
         AND user_high_id = ?
       LIMIT 1`,
      [lowId, highId]
    );

    if (existing.length) {
      await connection.commit();
      inTransaction = false;

      return res.json({
        success: true,
        conversation_id: existing[0].conversation_id,
        created: false,
      });
    }

    const [created] = await connection.execute(
      `INSERT INTO chat_conversations
       (conversation_type, created_by)
       VALUES ('direct', ?)`,
      [myId]
    );

    const conversationId = created.insertId;

    await connection.execute(
      `INSERT INTO chat_participants
       (conversation_id, user_id)
       VALUES (?, ?), (?, ?)`,
      [
        conversationId,
        lowId,
        conversationId,
        highId,
      ]
    );

    await connection.execute(
      `INSERT INTO chat_direct_pairs
       (user_low_id, user_high_id, conversation_id)
       VALUES (?, ?, ?)`,
      [lowId, highId, conversationId]
    );

    await connection.commit();
    inTransaction = false;

    return res.status(201).json({
      success: true,
      conversation_id: conversationId,
      created: true,
    });
  } catch (error) {
    if (inTransaction && connection) {
      await rollback(connection);
    }

    return internalError(res, error);
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// GET CONVERSATIONS
// =====================================================

const getConversations = async (req, res) => {
  try {
    const userId = Number(req.user.user_id);

    const [conversations] = await db.execute(
      `SELECT
         c.conversation_id,
         c.conversation_type,
         c.group_name,
         c.updated_at,
         cp.last_read_message_id,
         u.user_id AS other_user_id,
         u.full_name AS other_user_name,
         lm.message_id AS last_message_id,
         lm.message_text AS last_message,
         lm.sender_id AS last_sender_id,
         lm.created_at AS last_message_at,
         (
           SELECT COUNT(*)
           FROM chat_messages unread
           WHERE unread.conversation_id =
                 c.conversation_id
             AND unread.message_id >
                 GREATEST(
                   COALESCE(cp.last_read_message_id, 0),
                   cp.joined_after_message_id
                 )
             AND unread.sender_id <> ?
             AND unread.deleted_at IS NULL
         ) AS unread_count
       FROM chat_participants cp
       JOIN chat_conversations c
         ON c.conversation_id = cp.conversation_id
       LEFT JOIN chat_direct_pairs pair
         ON pair.conversation_id = c.conversation_id
       LEFT JOIN users u
         ON u.user_id =
           CASE
             WHEN pair.user_low_id = ?
               THEN pair.user_high_id
             ELSE pair.user_low_id
           END
       LEFT JOIN chat_messages lm
         ON lm.message_id = (
           SELECT MAX(m.message_id)
           FROM chat_messages m
           WHERE m.conversation_id = c.conversation_id
             AND m.deleted_at IS NULL
             AND m.message_id > IF(
               cp.history_access = 'all', 0, cp.joined_after_message_id
             )
         )
       WHERE cp.user_id = ?
       ORDER BY
         COALESCE(lm.created_at, c.created_at) DESC,
         c.conversation_id DESC
       LIMIT 100`,
      [userId, userId, userId]
    );

    return res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    return internalError(res, error);
  }
};

// =====================================================
// GET MESSAGES WITH PAGINATION
// =====================================================

const getMessages = async (req, res) => {
  const conversationId = parsePositiveId(
    req.params.conversationId
  );

  const limit = parsePageSize(req.query.limit);

  const before =
    req.query.before === undefined
      ? null
      : parsePositiveId(req.query.before);

  if (
    !conversationId ||
    limit === null ||
    (req.query.before !== undefined && !before)
  ) {
    return fail(res, 400, "Invalid pagination parameters.");
  }

  try {
    const member = await getMember(
      db,
      conversationId,
      req.user.user_id
    );

    if (!member) {
      return fail(res, 404, "Conversation not found.");
    }

    // An admin may grant group-history access to an individual member.
    // Keep their immutable join boundary to restore "new only" later.
    const visibleAfter = member.history_access === "all"
      ? 0 : member.joined_after_message_id;
    const params = [conversationId, visibleAfter];
    let cursorCondition = "";

    if (before !== null) {
      cursorCondition = "AND m.message_id < ?";
      params.push(before);
    }

    // Validated numeric limit; avoids driver LIMIT
    // placeholder incompatibilities.
    const fetchLimit = limit + 1;

    const [rows] = await db.execute(
      `SELECT
         m.message_id,
         m.conversation_id,
         m.sender_id,
         u.full_name AS sender_name,
         m.message_text,
         m.client_message_id,
         m.created_at,
         m.edited_at
       FROM chat_messages m
       LEFT JOIN users u
         ON u.user_id = m.sender_id
       WHERE m.conversation_id = ?
         AND m.deleted_at IS NULL
         AND m.message_id > ?
         ${cursorCondition}
       ORDER BY m.message_id DESC
       LIMIT ${fetchLimit}`,
      params
    );

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const nextCursor =
      hasMore && page.length
        ? page[page.length - 1].message_id
        : null;

    return res.json({
      success: true,
      messages: page.reverse(),
      has_more: hasMore,
      next_cursor: nextCursor,
      // Client must discard cached messages if history is revoked.
      visible_after_message_id: visibleAfter,
    });
  } catch (error) {
    return internalError(res, error);
  }
};

// =====================================================
// SEND MESSAGE
// =====================================================

const sendMessage = async (req, res) => {
  const conversationId = parsePositiveId(
    req.params.conversationId
  );

  const userId = Number(req.user.user_id);
  const checked = validateMessage(req.body?.message_text);
  const retryId = req.body?.client_message_id;

  if (!conversationId) {
    return fail(res, 400, "Invalid conversation.");
  }

  if (!checked.valid) {
    return fail(res, 400, checked.message);
  }

  if (
    typeof retryId !== "string" ||
    !/^[A-Za-z0-9_-]{8,64}$/.test(retryId)
  ) {
    return fail(res, 400, "Invalid client message ID.");
  }

  let connection;
  let inTransaction = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    inTransaction = true;

    const [conversations] = await connection.execute(
      `SELECT conversation_id, conversation_type
       FROM chat_conversations
       WHERE conversation_id = ?
       FOR UPDATE`,
      [conversationId]
    );

    if (!conversations.length) {
      await rollback(connection);
      inTransaction = false;
      return fail(res, 404, "Conversation not found.");
    }

    const member = await getMember(
      connection,
      conversationId,
      userId
    );

    if (!member) {
      await rollback(connection);
      inTransaction = false;
      return fail(res, 404, "Conversation not found.");
    }

    const [existing] = await connection.execute(
      `SELECT
         message_id,
         conversation_id,
         sender_id,
         message_text,
         client_message_id,
         created_at,
         deleted_at
       FROM chat_messages
       WHERE conversation_id = ?
         AND sender_id = ?
         AND client_message_id = ?
       LIMIT 1`,
      [conversationId, userId, retryId]
    );

    if (existing.length) {
      const previous = existing[0];

      if (
        previous.deleted_at !== null ||
        previous.message_text !== checked.text
      ) {
        await rollback(connection);
        inTransaction = false;
        return fail(res, 409, "Message retry conflict.");
      }

      await connection.commit();
      inTransaction = false;

      delete previous.deleted_at;

      return res.json({
        success: true,
        message: previous,
        duplicate: true,
      });
    }

    const [inserted] = await connection.execute(
      `INSERT INTO chat_messages
       (
         conversation_id,
         sender_id,
         message_text,
         client_message_id
       )
       VALUES (?, ?, ?, ?)`,
      [
        conversationId,
        userId,
        checked.text,
        retryId,
      ]
    );

    await connection.execute(
      `UPDATE chat_conversations
       SET updated_at = CURRENT_TIMESTAMP(6)
       WHERE conversation_id = ?`,
      [conversationId]
    );

    const [messages] = await connection.execute(
      `SELECT
         message_id,
         conversation_id,
         sender_id,
         message_text,
         client_message_id,
         created_at
       FROM chat_messages
       WHERE message_id = ?
       LIMIT 1`,
      [inserted.insertId]
    );

    await connection.commit();
    inTransaction = false;

    return res.status(201).json({
      success: true,
      message: messages[0],
      duplicate: false,
    });
  } catch (error) {
    if (inTransaction && connection) {
      await rollback(connection);
    }

    return internalError(res, error);
  } finally {
    if (connection) connection.release();
  }
};

// =====================================================
// MARK CONVERSATION AS READ
// =====================================================

const markConversationRead = async (req, res) => {
  const conversationId = parsePositiveId(
    req.params.conversationId
  );

  const messageId = parsePositiveId(
    req.body?.message_id
  );

  const userId = Number(req.user.user_id);

  if (!conversationId || !messageId) {
    return fail(res, 400, "Invalid conversation or message.");
  }

  let connection;
  let inTransaction = false;

  try {
    connection = await db.getConnection();

    await connection.beginTransaction();
    inTransaction = true;

    const [participants] = await connection.execute(
      `SELECT last_read_message_id, joined_after_message_id, history_access
       FROM chat_participants
       WHERE conversation_id = ?
         AND user_id = ?
       FOR UPDATE`,
      [conversationId, userId]
    );

    if (!participants.length) {
      await rollback(connection);
      inTransaction = false;
      return fail(res, 404, "Conversation not found.");
    }

    const [messages] = await connection.execute(
      `SELECT message_id
       FROM chat_messages
       WHERE message_id = ?
         AND conversation_id = ?
         AND deleted_at IS NULL
         AND message_id > ?
       LIMIT 1`,
      [messageId, conversationId,
       participants[0].history_access === "all"
         ? 0 : participants[0].joined_after_message_id]
    );

    if (!messages.length) {
      await rollback(connection);
      inTransaction = false;
      return fail(res, 400, "Message not found.");
    }

    await connection.execute(
      `UPDATE chat_participants
       SET last_read_message_id =
         GREATEST(
           COALESCE(last_read_message_id, 0),
           ?
         )
       WHERE conversation_id = ?
         AND user_id = ?`,
      [messageId, conversationId, userId]
    );

    await connection.commit();
    inTransaction = false;

    return res.json({
      success: true,
      message: "Read position updated.",
    });
  } catch (error) {
    if (inTransaction && connection) {
      await rollback(connection);
    }

    return internalError(res, error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  getChatUsers,
  createDirectConversation,
  getConversations,
  getMessages,
  sendMessage,
  markConversationRead,
};
