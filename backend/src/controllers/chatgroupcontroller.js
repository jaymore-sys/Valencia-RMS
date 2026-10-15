
"use strict";

const db = require("../config/db");
const config = require("../config/chatconfig");
const { parsePositiveId } = require("../utils/chatvalidators");

const errorResponse = (res, code, message) =>
  res.status(code).json({
    success: false,
    message,
  });

const serverError = (res, error) => {
  console.error("[CHAT GROUP]", error);
  return errorResponse(res, 500, "Group operation failed.");
};

const readHistoryAccess = (value) =>
  value === undefined || value === null ? "new" :
  (value === "new" || value === "all" ? value : null);

const readIds = (values) => {
  if (!Array.isArray(values)) return null;

  const ids = values.map(parsePositiveId);

  if (ids.some((id) => id === null)) return null;

  return [...new Set(ids)].sort((a, b) => a - b);
};

const getGroup = async (conn, id, userId, lock = false) => {
  const [rows] = await conn.execute(
    `SELECT
       c.conversation_id,
       c.conversation_type,
       c.group_name,
       p.participant_role
     FROM chat_conversations c
     JOIN chat_participants p
       ON p.conversation_id = c.conversation_id
     WHERE c.conversation_id = ?
       AND p.user_id = ?
       AND c.conversation_type = 'group'
     LIMIT 1 ${lock ? "FOR UPDATE" : ""}`,
    [id, userId]
  );

  return rows[0] || null;
};

const checkUsers = async (conn, ids) => {
  if (!ids.length) return true;

  const placeholders = ids.map(() => "?").join(",");

  const [rows] = await conn.query(
    `SELECT user_id
     FROM users
     WHERE user_id IN (${placeholders})
       AND status NOT IN ('blocked','deleted')`,
    ids
  );

  return rows.length === ids.length;
};

// CREATE GROUP
const createGroup = async (req, res) => {
  const creator = Number(req.user.user_id);
  const name = String(req.body?.group_name || "").trim();
  const inputIds = readIds(req.body?.member_ids);

  if (name.length < 2 || name.length > 150) {
    return errorResponse(res, 400, "Group name must be 2–150 characters.");
  }

  if (!inputIds) {
    return errorResponse(res, 400, "Invalid member list.");
  }

  const ids = [...new Set([creator, ...inputIds])]
    .sort((a, b) => a - b);

  if (ids.length < 2 || ids.length > config.groupMaxMembers) {
    return errorResponse(
      res, 400,
      `Group requires 2–${config.groupMaxMembers} members.`
    );
  }

  let conn;
  let active = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    active = true;

    if (!(await checkUsers(conn, ids))) {
      await conn.rollback();
      active = false;
      return errorResponse(res, 400, "Invalid or inactive group member.");
    }

    const [created] = await conn.execute(
      `INSERT INTO chat_conversations
       (conversation_type, group_name, created_by)
       VALUES ('group', ?, ?)`,
      [name, creator]
    );

    const groupId = created.insertId;

    for (const id of ids) {
      await conn.execute(
        `INSERT INTO chat_participants
         (conversation_id, user_id, participant_role)
         VALUES (?, ?, ?)`,
        [groupId, id, id === creator ? "admin" : "member"]
      );
    }

    await conn.commit();
    active = false;

    return res.status(201).json({
      success: true,
      conversation_id: groupId,
      group_name: name,
      member_count: ids.length,
    });
  } catch (error) {
    if (active && conn) {
      await conn.rollback().catch(console.error);
    }
    return serverError(res, error);
  } finally {
    if (conn) conn.release();
  }
};

// LIST MEMBERS
const getGroupMembers = async (req, res) => {
  const groupId = parsePositiveId(req.params.conversationId);
  if (!groupId) return errorResponse(res, 400, "Invalid group.");

  try {
    const group = await getGroup(db, groupId, req.user.user_id);

    if (!group) return errorResponse(res, 404, "Group not found.");

    const [members] = await db.execute(
      `SELECT
         p.user_id,
         p.participant_role,
         p.joined_at,
         p.history_access,
         p.joined_after_message_id,
         u.full_name,
         u.designation
       FROM chat_participants p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.conversation_id = ?
       ORDER BY
         (p.participant_role = 'admin') DESC,
         u.full_name`,
      [groupId]
    );

    return res.json({
      success: true,
      group,
      members,
    });
  } catch (error) {
    return serverError(res, error);
  }
};

// ADD MEMBERS
const addGroupMembers = async (req, res) => {
  const groupId = parsePositiveId(req.params.conversationId);
  const ids = readIds(req.body?.member_ids);
  const historyAccess = readHistoryAccess(req.body?.history_access);

  if (!groupId || !ids || !ids.length || !historyAccess) {
    return errorResponse(res, 400, "Invalid group or members.");
  }

  let conn;
  let active = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    active = true;

    const [groups] = await conn.execute(
      `SELECT conversation_id
       FROM chat_conversations
       WHERE conversation_id = ?
         AND conversation_type = 'group'
       FOR UPDATE`,
      [groupId]
    );

    const group = groups.length
      ? await getGroup(conn, groupId, req.user.user_id)
      : null;

    if (!group || group.participant_role !== "admin") {
      await conn.rollback();
      active = false;
      return errorResponse(res, 403, "Group admin access required.");
    }

    const [existing] = await conn.execute(
      `SELECT user_id
       FROM chat_participants
       WHERE conversation_id = ?`,
      [groupId]
    );

    const present = new Set(existing.map((row) => row.user_id));
    const newIds = ids.filter((id) => !present.has(id));

    if (existing.length + newIds.length > config.groupMaxMembers) {
      await conn.rollback();
      active = false;
      return errorResponse(res, 400, "Group member limit exceeded.");
    }

    if (!(await checkUsers(conn, newIds))) {
      await conn.rollback();
      active = false;
      return errorResponse(res, 400, "One or more users are unavailable.");
    }

    // The conversation row was locked above. sendMessage locks
    // the same row before inserting, so this boundary cannot race
    // a concurrent send. New members see ONLY later messages.
    const [boundaryRows] = await conn.execute(
      `SELECT COALESCE(MAX(message_id), 0) AS boundary
       FROM chat_messages
       WHERE conversation_id = ?`,
      [groupId]
    );
    const joinedAfterId = boundaryRows[0].boundary;

    for (const id of newIds) {
      await conn.execute(
        `INSERT INTO chat_participants
         (conversation_id, user_id, participant_role, joined_after_message_id, history_access)
         VALUES (?, ?, 'member', ?, ?)`,
        [groupId, id, joinedAfterId, historyAccess]
      );
      await conn.execute(
        `INSERT INTO chat_group_history_audit
           (conversation_id, target_user_id, changed_by, old_access, new_access)
         VALUES (?, ?, ?, NULL, ?)`,
        [groupId, id, Number(req.user.user_id), historyAccess]
      );
    }

    await conn.commit();
    active = false;

    return res.json({
      success: true,
      added: newIds.length,
    });
  } catch (error) {
    if (active && conn) {
      await conn.rollback().catch(console.error);
    }
    return serverError(res, error);
  } finally {
    if (conn) conn.release();
  }
};

// CHANGE ONE MEMBER'S HISTORY PERMISSION
// Group admins only. The immutable joined_after_message_id is NEVER
// changed, so "new" can be restored later without leaking older messages.
const setGroupMemberHistory = async (req, res) => {
  const groupId = parsePositiveId(req.params.conversationId);
  const targetId = parsePositiveId(req.params.userId);
  const actorId = Number(req.user.user_id);
  const access = readHistoryAccess(req.body?.history_access);

  if (!groupId || !targetId || !["new", "all"].includes(req.body?.history_access)) {
    return errorResponse(res, 400, "Choose only new messages or all history.");
  }

  let conn;
  let active = false;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    active = true;

    // Same lock order as sends, additions and removals.
    const [groups] = await conn.execute(
      `SELECT conversation_id FROM chat_conversations
       WHERE conversation_id = ? AND conversation_type = 'group'
       FOR UPDATE`,
      [groupId]
    );
    const actor = groups.length ? await getGroup(conn, groupId, actorId) : null;
    if (!actor || actor.participant_role !== "admin") {
      await conn.rollback();
      active = false;
      return errorResponse(res, 403, "Group admin access required.");
    }

    // The creator/admin's own founding history should remain unchanged.
    if (actorId === targetId) {
      await conn.rollback();
      active = false;
      return errorResponse(res, 400, "Use this setting for other group members.");
    }

    const [members] = await conn.execute(
      `SELECT history_access FROM chat_participants
       WHERE conversation_id = ? AND user_id = ? FOR UPDATE`,
      [groupId, targetId]
    );
    if (!members.length) {
      await conn.rollback();
      active = false;
      return errorResponse(res, 404, "Member not found.");
    }

    const previous = members[0].history_access;
    if (previous !== access) {
      await conn.execute(
        `UPDATE chat_participants SET history_access = ?
         WHERE conversation_id = ? AND user_id = ?`,
        [access, groupId, targetId]
      );
      await conn.execute(
        `INSERT INTO chat_group_history_audit
           (conversation_id, target_user_id, changed_by, old_access, new_access)
         VALUES (?, ?, ?, ?, ?)`,
        [groupId, targetId, actorId, previous, access]
      );
    }

    await conn.commit();
    active = false;
    return res.json({
      success: true,
      user_id: targetId,
      history_access: access,
      changed: previous !== access,
    });
  } catch (error) {
    if (active && conn) await conn.rollback().catch(console.error);
    return serverError(res, error);
  } finally {
    if (conn) conn.release();
  }
};

// REMOVE MEMBER / LEAVE GROUP
const removeGroupMember = async (req, res) => {
  const groupId = parsePositiveId(req.params.conversationId);
  const targetId = parsePositiveId(req.params.userId);
  const actorId = Number(req.user.user_id);

  if (!groupId || !targetId) {
    return errorResponse(res, 400, "Invalid group or user.");
  }

  let conn;
  let active = false;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    active = true;

    const [groups] = await conn.execute(
      `SELECT conversation_id
       FROM chat_conversations
       WHERE conversation_id = ?
         AND conversation_type = 'group'
       FOR UPDATE`,
      [groupId]
    );

    const actor = groups.length
      ? await getGroup(conn, groupId, actorId)
      : null;

    if (!actor) {
      await conn.rollback();
      active = false;
      return errorResponse(res, 404, "Group not found.");
    }

    if (
      actorId !== targetId &&
      actor.participant_role !== "admin"
    ) {
      await conn.rollback();
      active = false;
      return errorResponse(res, 403, "Group admin access required.");
    }

    const [targetRows] = await conn.execute(
      `SELECT participant_role
       FROM chat_participants
       WHERE conversation_id = ? AND user_id = ?`,
      [groupId, targetId]
    );

    if (!targetRows.length) {
      await conn.rollback();
      active = false;
      return errorResponse(res, 404, "Member not found.");
    }

    const [admins] = await conn.execute(
      `SELECT user_id
       FROM chat_participants
       WHERE conversation_id = ?
         AND participant_role = 'admin'
       ORDER BY user_id`,
      [groupId]
    );

    if (
      targetRows[0].participant_role === "admin" &&
      admins.length === 1
    ) {
      const [others] = await conn.execute(
        `SELECT user_id
         FROM chat_participants
         WHERE conversation_id = ?
           AND user_id <> ?
         ORDER BY joined_at, user_id
         LIMIT 1`,
        [groupId, targetId]
      );

      if (others.length) {
        await conn.execute(
          `UPDATE chat_participants
           SET participant_role = 'admin'
           WHERE conversation_id = ? AND user_id = ?`,
          [groupId, others[0].user_id]
        );
      }
    }

    await conn.execute(
      `DELETE FROM chat_participants
       WHERE conversation_id = ? AND user_id = ?`,
      [groupId, targetId]
    );

    await conn.commit();
    active = false;

    return res.json({
      success: true,
      removed_user_id: targetId,
    });
  } catch (error) {
    if (active && conn) {
      await conn.rollback().catch(console.error);
    }
    return serverError(res, error);
  } finally {
    if (conn) conn.release();
  }
};

// RENAME GROUP
const renameGroup = async (req, res) => {
  const groupId = parsePositiveId(req.params.conversationId);
  const name = String(req.body?.group_name || "").trim();

  if (!groupId || name.length < 2 || name.length > 150) {
    return errorResponse(res, 400, "Invalid group name.");
  }

  try {
    const group = await getGroup(db, groupId, req.user.user_id);

    if (!group || group.participant_role !== "admin") {
      return errorResponse(res, 403, "Group admin access required.");
    }

    await db.execute(
      `UPDATE chat_conversations
       SET group_name = ?
       WHERE conversation_id = ?
         AND conversation_type = 'group'`,
      [name, groupId]
    );

    return res.json({
      success: true,
      group_name: name,
    });
  } catch (error) {
    return serverError(res, error);
  }
};

module.exports = {
  createGroup,
  getGroupMembers,
  addGroupMembers,
  removeGroupMember,
  setGroupMemberHistory,
  renameGroup,
};
