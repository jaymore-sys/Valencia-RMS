
import api from "./axios";

const base = "/chat";

export const chatApi = {
  getUsers: async () => {
    const { data } = await api.get(`${base}/users`);
    return data.users || [];
  },

  getMySpace: async () => {
  const { data } = await api.post("/chat/my-space");
  return data;
},

  getConversations: async () => {
    const { data } = await api.get(
      `${base}/conversations`
    );
    return data.conversations || [];
  },

  createGroup: async (name, memberIds) => {
    const { data } = await api.post(`${base}/conversations/group`, {
      group_name: name,
      member_ids: memberIds,
    });
    return data;
  },

  getGroupMembers: async (id) => {
    const { data } = await api.get(`${base}/conversations/${id}/members`);
    return data;
  },

  addGroupMembers: async (id, memberIds, historyAccess = "new") => {
    const { data } = await api.post(`${base}/conversations/${id}/members`, {
      member_ids: memberIds,
      history_access: historyAccess,
    });
    return data;
  },

  setGroupMemberHistory: async (id, userId, historyAccess) => {
    const { data } = await api.patch(
      `${base}/conversations/${id}/members/${userId}/history`,
      { history_access: historyAccess }
    );
    return data;
  },

  removeGroupMember: async (id, userId) => {
    const { data } = await api.delete(`${base}/conversations/${id}/members/${userId}`);
    return data;
  },

  renameGroup: async (id, name) => {
    const { data } = await api.patch(`${base}/conversations/${id}/group`, {
      group_name: name,
    });
    return data;
  },

  createDirect: async (userId) => {
    const { data } = await api.post(
      `${base}/conversations/direct`,
      { user_id: userId }
    );
    return data;
  },

  getMessages: async (conversationId, before) => {
    const { data } = await api.get(
      `${base}/conversations/${conversationId}/messages`,
      {
        params: {
          limit: 30,
          ...(before ? { before } : {}),
        },
      }
    );
    return data;
  },

  sendMessage: async (
    conversationId,
    message,
    clientMessageId
  ) => {
    const { data } = await api.post(
      `${base}/conversations/${conversationId}/messages`,
      {
        message_text: message,
        client_message_id: clientMessageId,
      }
    );
    return data;
  },

  markRead: async (conversationId, messageId) => {
    const { data } = await api.patch(
      `${base}/conversations/${conversationId}/read`,
      { message_id: messageId }
    );
    return data;
  },
};
