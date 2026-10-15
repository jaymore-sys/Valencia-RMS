
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Search,
  Send,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Loader2,
  UsersRound,
  Plus,
  Settings2,
  X,
  ChevronRight,
  Check,
  Pencil,
  UserRoundPlus,
  ArrowRight,
} from "lucide-react";
import { chatApi } from "../../api/chatApi";
import "./RMSChat.css";

const getError = (error) =>
  error?.response?.data?.message ||
  error?.message ||
  "Something went wrong.";

const formatTime = (date) => {
  if (!date) return "";
  const d = new Date(date);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
};

const displayName = (conversation) => {
  if (!conversation) return "Select a chat";
  if (conversation.conversation_type === "self") return "My Space (You)";
  if (conversation.conversation_type === "group") {
    return conversation.group_name?.trim() || `Group #${conversation.conversation_id}`;
  }
  return conversation.other_user_name?.trim() || `Chat #${conversation.conversation_id}`;
};

const getMyId = () => {
  try {
    const user = JSON.parse(
      sessionStorage.getItem("user") || localStorage.getItem("user") || "{}"
    );
    return Number(user.user_id);
  } catch {
    return 0;
  }
};

export default function RMSChat() {
  const [users, setUsers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [pendingMessage, setPendingMessage] = useState(null);
  // WhatsApp-style flow lives inside the chats column; no blocking popup.
  const [sidebarMode, setSidebarMode] = useState("chats");
  const [groupStep, setGroupStep] = useState("members");
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [pickedMembers, setPickedMembers] = useState([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupSettings, setGroupSettings] = useState(false);
  const [groupLoading, setGroupLoading] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [newMemberHistory, setNewMemberHistory] = useState("new");
  const [pendingHistoryChange, setPendingHistoryChange] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [groupRename, setGroupRename] = useState("");
  const myId = getMyId();
  const amGroupAdmin = groupMembers.some(
    (member) => Number(member.user_id) === myId && member.participant_role === "admin"
  );

  const activeId = useRef(null);
  const selectionVersion = useRef(0);
  const messagesRef = useRef([]);
  const polling = useRef(false);
  const bottomRef = useRef(null);
  const mounted = useRef(true);
  const sentLock = useRef(false);
  const groupInfoOpen = useRef(false);

  const updateMessages = (items) => {
    messagesRef.current = items;
    setMessages(items);
  };

  const loadSidebar = useCallback(async () => {
    const [people, chats] = await Promise.all([
      chatApi.getUsers(),
      chatApi.getConversations(),
    ]);
    if (!mounted.current) return;
    setUsers(people);
    setConversations(chats);
  }, []);

  const loadMessages = useCallback(
    async (conversationId, options = {}) => {
      // Don't mark messages read while the user is viewing Group Info.
      if (groupInfoOpen.current) return;
      const version = selectionVersion.current;

      try {
        if (!options.silent) setMessageLoading(true);

        const data = await chatApi.getMessages(conversationId);

        if (
          !mounted.current ||
          version !== selectionVersion.current ||
          activeId.current !== conversationId
        ) {
          return;
        }

        const previous = messagesRef.current;
        const incoming = data.messages || [];

        // Retain previously loaded older messages during polling.
        const visibleAfter = Number(data.visible_after_message_id || 0);
        const merged = (options.silent
          ? [...previous, ...incoming]
          : incoming).filter((message) =>
            Number(message.message_id) > visibleAfter
          );

        const unique = Array.from(
          new Map(
            merged.map((message) => [
              String(message.message_id),
              message,
            ])
          ).values()
        ).sort(
          (a, b) =>
            Number(a.message_id) - Number(b.message_id)
        );

        updateMessages(unique);

        if (!options.silent) {
          setHasMore(Boolean(data.has_more));
        }

        if (incoming.length) {
          const lastId =
            incoming[incoming.length - 1].message_id;

          await chatApi.markRead(conversationId, lastId);

          if (
            mounted.current &&
            activeId.current === conversationId
          ) {
            setConversations((previousChats) =>
              previousChats.map((chat) =>
                String(chat.conversation_id) ===
                String(conversationId)
                  ? { ...chat, unread_count: 0 }
                  : chat
              )
            );
          }
        }
      } catch (err) {
        if (!options.silent && mounted.current) {
          setError(getError(err));
        }
      } finally {
        if (mounted.current && !options.silent) {
          setMessageLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        await loadSidebar();
      } catch (err) {
        if (mounted.current) setError(getError(err));
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    const interval = setInterval(async () => {
      if (document.visibilityState !== "visible" || polling.current) {
        return;
      }

      polling.current = true;

      try {
        const chats = await chatApi.getConversations();
        if (mounted.current) setConversations(chats);

        if (activeId.current !== null) {
          await loadMessages(activeId.current, {
            silent: true,
          });
        }
      } catch {
        // Temporary network failure; next poll retries.
      } finally {
        polling.current = false;
      }
    }, 5000);

    return () => {
      mounted.current = false;
      clearInterval(interval);
      selectionVersion.current += 1;
    };
  }, [loadSidebar, loadMessages]);

  const openConversation = async (conversation) => {
   if (sentLock.current) return;

    const id = conversation.conversation_id;

    selectionVersion.current += 1;
    activeId.current = id;
    setSelected(conversation);
    groupInfoOpen.current = false;
    setGroupSettings(false);
    setPendingHistoryChange(null);
    setPendingRemoval(null);
    setConfirmLeave(false);
    updateMessages([]);
    setHasMore(false);
    setError("");
    setPendingMessage(null);

    await loadMessages(id);
  };

  const startConversation = async (user) => {
    if (opening || sending || sentLock.current) return;

    setOpening(true);
    setError("");

    try {
      const result = await chatApi.createDirect(user.user_id);
      const id = result.conversation_id;

      await openConversation({
        conversation_id: id,
        conversation_type: "direct",
        other_user_id: user.user_id,
        other_user_name: user.full_name,
        unread_count: 0,
      });

      const chats = await chatApi.getConversations();
      if (mounted.current) setConversations(chats);
    } catch (err) {
      if (mounted.current) setError(getError(err));
    } finally {
      if (mounted.current) setOpening(false);
    }
  };

  const createGroup = async (event) => {
    event.preventDefault();
    if (groupBusy || groupName.trim().length < 2 || pickedMembers.length === 0) return;
    setGroupBusy(true);
    setError("");
    try {
      const created = await chatApi.createGroup(groupName.trim(), pickedMembers);
      setSidebarMode("chats");
      setGroupStep("members");
      setGroupName("");
      setGroupSearch("");
      setPickedMembers([]);
      await openConversation({
        conversation_id: created.conversation_id,
        conversation_type: "group",
        group_name: created.group_name,
        unread_count: 0,
      });
      await loadSidebar();
    } catch (err) {
      setError(getError(err));
    } finally {
      setGroupBusy(false);
    }
  };

  const closeGroupSettings = () => {
    groupInfoOpen.current = false;
    setGroupSettings(false);
    setPendingHistoryChange(null);
    setPendingRemoval(null);
    setConfirmLeave(false);
    if (activeId.current !== null) {
      loadMessages(activeId.current, { silent: true });
    }
  };

  const openGroupSettings = async () => {
    if (!selected || selected.conversation_type !== "group") return;
    const conversationId = selected.conversation_id;
    // Show a normal in-page tab immediately, never a modal overlay.
    groupInfoOpen.current = true;
    setGroupSettings(true);
    setGroupLoading(true);
    setGroupMembers([]);
    setPendingHistoryChange(null);
    setPendingRemoval(null);
    setConfirmLeave(false);
    setNewMemberHistory("new");
    setGroupRename(displayName(selected));
    setError("");
    try {
      const data = await chatApi.getGroupMembers(conversationId);
      if (activeId.current !== conversationId || !groupInfoOpen.current) return;
      setGroupMembers(data.members || []);
      setGroupRename(data.group?.group_name || displayName(selected));
    } catch (err) {
      if (groupInfoOpen.current && activeId.current === conversationId) {
        setError(getError(err));
      }
    } finally {
      setGroupLoading(false);
    }
  };

  const refreshGroupMembers = async () => {
    const data = await chatApi.getGroupMembers(selected.conversation_id);
    setGroupMembers(data.members || []);
  };

  const modifyGroup = async (action) => {
    if (groupBusy || !selected) return;
    setGroupBusy(true);
    try {
      await action();
      await refreshGroupMembers();
      await loadSidebar();
      setError("");
    } catch (err) {
      setError(getError(err));
    } finally {
      setGroupBusy(false);
    }
  };

  const loadOlder = async () => {
    if (
      !selected ||
      !hasMore ||
      loadingOlder ||
      !messagesRef.current.length
    ) {
      return;
    }

    const id = selected.conversation_id;
    const version = selectionVersion.current;
    const cursor = messagesRef.current[0].message_id;

    setLoadingOlder(true);

    try {
      const data = await chatApi.getMessages(id, cursor);

      if (
        !mounted.current ||
        version !== selectionVersion.current
      ) {
        return;
      }

      const visibleAfter = Number(data.visible_after_message_id || 0);
      const unique = Array.from(
        new Map(
          [
            ...(data.messages || []),
            ...messagesRef.current,
          ].filter((m) => Number(m.message_id) > visibleAfter)
            .map((m) => [String(m.message_id), m])
        ).values()
      ).sort(
        (a, b) =>
          Number(a.message_id) - Number(b.message_id)
      );

      updateMessages(unique);
      setHasMore(Boolean(data.has_more));
    } catch (err) {
      setError(getError(err));
    } finally {
      if (mounted.current) setLoadingOlder(false);
    }
  };

  const send = async (event) => {
    event.preventDefault();

    if (!selected || sending || sentLock.current) return;

    const text = pendingMessage?.text || draft.trim();
    if (!text) return;

    const id = selected.conversation_id;

    const retry = pendingMessage?.text === text
      ? pendingMessage
      : {
          text,
          clientId: crypto.randomUUID().replace(/-/g, ""),
        };

    sentLock.current = true;
    setSending(true);
    setError("");

    try {
      const result = await chatApi.sendMessage(
        id,
        retry.text,
        retry.clientId
      );

if (
  mounted.current &&
  String(activeId.current) === String(id)
) {
  const existing = messagesRef.current;

  if (
    !existing.some(
      (m) =>
        String(m.message_id) ===
        String(result.message.message_id)
    )
  ) {
    updateMessages(
      [...existing, result.message].sort(
        (a, b) =>
          Number(a.message_id) - Number(b.message_id)
      )
    );
  }
}

      setDraft("");
      setPendingMessage(null);

      const chats = await chatApi.getConversations();
      if (mounted.current) setConversations(chats);
    } catch (err) {
      setPendingMessage(retry);
      setError(
        `${getError(err)} You can retry this message.`
      );
    } finally {
      sentLock.current = false;
      if (mounted.current) setSending(false);
    }
  };

  useEffect(() => {
    if (!loadingOlder) {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages.length, selected?.conversation_id]);

  const visibleChats = conversations.filter(
    (conversation) => conversation.conversation_type !== "self"
  );
  const query = search.trim().toLowerCase();
  const filteredUsers = users.filter((u) =>
    u.full_name?.toLowerCase().includes(query)
  );
  const filteredConversations = visibleChats.filter((c) =>
    displayName(c).toLowerCase().includes(query)
  );
  const selectedId = selected?.conversation_id;
  const selectedForNewGroup = users.filter((u) =>
    pickedMembers.includes(Number(u.user_id))
  );
  const selectableMembers = users.filter((u) =>
    u.full_name?.toLowerCase().includes(groupSearch.toLowerCase())
  );
  const groupMembershipIds = new Set(groupMembers.map((m) => Number(m.user_id)));
  const availableGroupMembers = users.filter((u) =>
    !groupMembershipIds.has(Number(u.user_id)) &&
    u.full_name?.toLowerCase().includes(groupMemberSearch.toLowerCase())
  );

  const closeBuilder = () => {
    if (groupBusy) return;
    setSidebarMode("chats");
    setGroupStep("members");
  };

  const openMySpace = async () => {
    try {
      setError("");
      const result = await chatApi.getMySpace();
      await openConversation({
        conversation_id: result.conversation_id,
        conversation_type: "self",
        other_user_name: "My Space (You)",
        unread_count: 0,
      });
      // My Space stays pinned; its database record never appears twice.
    } catch (err) {
      setError(getError(err));
    }
  };

  const renameSelectedGroup = async (event) => {
    event.preventDefault();
    const name = groupRename.trim();
    if (!amGroupAdmin || !selected || name.length < 2 || groupBusy) return;
    setGroupBusy(true);
    try {
      await chatApi.renameGroup(selected.conversation_id, name);
      setSelected((old) => ({ ...old, group_name: name }));
      setConversations((old) => old.map((c) =>
        String(c.conversation_id) === String(selected.conversation_id)
          ? { ...c, group_name: name }
          : c
      ));
      setError("");
    } catch (err) {
      setError(getError(err));
    } finally {
      setGroupBusy(false);
    }
  };

  const leaveSelectedGroup = async () => {
    if (!selected || groupBusy) return;
    setGroupBusy(true);
    try {
      await chatApi.removeGroupMember(selected.conversation_id, myId);
      selectionVersion.current += 1;
      activeId.current = null;
      groupInfoOpen.current = false;
      setGroupSettings(false);
      setSelected(null);
      updateMessages([]);
      await loadSidebar();
      setError("");
    } catch (err) {
      setError(getError(err));
    } finally {
      setGroupBusy(false);
    }
  };

  return (
    <div className="rms-chat vc-whatsapp-chat">
      <aside className={`rms-chat-sidebar ${selected && sidebarMode === "chats" ? "mobile-hidden" : ""}`}>
        {sidebarMode === "new-group" ? (
          <div className="vc-inline-flow" aria-label="Create a group">
            <header className="vc-flow-heading">
              <button
                type="button"
                className="vc-icon-btn"
                aria-label={groupStep === "details" ? "Back to members" : "Back to chats"}
                onClick={() => groupStep === "details" ? setGroupStep("members") : closeBuilder()}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h2>New group</h2>
                <p>{groupStep === "members" ? "Choose colleagues" : "Name your group"}</p>
              </div>
            </header>
            {groupStep === "members" ? (
              <>
                <div className="vc-selection-panel">
                  <label className="vc-field-label">Selected colleagues ({pickedMembers.length})</label>
                  <div className="vc-selection-chips">
                    {selectedForNewGroup.length ? selectedForNewGroup.map((u) => (
                      <button
                        type="button"
                        className="vc-chip"
                        key={u.user_id}
                        title={`Remove ${u.full_name}`}
                        onClick={() => setPickedMembers((prev) => prev.filter((id) => id !== Number(u.user_id)))}
                      >
                        {u.full_name}<X size={13} />
                      </button>
                    )) : <span className="vc-placeholder">Choose at least one colleague</span>}
                  </div>
                  <div className="rms-chat-search vc-builder-search">
                    <Search size={17} />
                    <input
                      aria-label="Search group members"
                      placeholder="Search employees..."
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                    />
                  </div>
                </div>
                <div className="vc-flow-list">
                  {selectableMembers.map((u) => {
                    const checked = pickedMembers.includes(Number(u.user_id));
                    return (
                      <button
                        type="button"
                        className={`vc-select-person ${checked ? "picked" : ""}`}
                        key={u.user_id}
                        onClick={() => setPickedMembers((previous) => checked
                          ? previous.filter((id) => id !== Number(u.user_id))
                          : [...previous, Number(u.user_id)]
                        )}
                        aria-pressed={checked}
                      >
                        <span className="rms-chat-avatar">{u.full_name?.charAt(0).toUpperCase() || "U"}</span>
                        <span className="rms-chat-person-text">
                          <strong>{u.full_name}</strong>
                          <small>{u.designation || "Colleague"}</small>
                        </span>
                        <span className={`vc-check ${checked ? "is-checked" : ""}`}>
                          {checked && <Check size={14} />}
                        </span>
                      </button>
                    );
                  })}
                  {!selectableMembers.length && <p className="rms-chat-hint">No matching colleagues.</p>}
                </div>
                <div className="vc-flow-footer">
                  <button
                    className="vc-next-btn"
                    type="button"
                    onClick={() => setGroupStep("details")}
                    disabled={!pickedMembers.length}
                  >
                    Next <ArrowRight size={17} />
                  </button>
                </div>
              </>
            ) : (
              <form className="vc-flow-details" onSubmit={createGroup}>
                <div className="vc-group-icon-big"><UsersRound size={30} /></div>
                <label className="vc-field-label" htmlFor="vc-group-name">Group name</label>
                <input
                  id="vc-group-name"
                  className="vc-inline-input"
                  maxLength={150}
                  minLength={2}
                  required
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="e.g. Vitalize Launch Team"
                />
                <p className="vc-small-hint">This name will appear in everyone's chat list and at the top of the group.</p>
                <div className="vc-member-summary"><UsersRound size={16} /> {pickedMembers.length + 1} members including you</div>
                <div className="vc-selected-preview">
                  {selectedForNewGroup.map((u) => <span key={u.user_id}>{u.full_name}</span>)}
                </div>
                {error && <p className="rms-chat-error">{error}</p>}
                <button className="vc-next-btn" type="submit" disabled={groupBusy || groupName.trim().length < 2 || !pickedMembers.length}>
                  {groupBusy ? "Creating..." : "Create group"} <Check size={17} />
                </button>
              </form>
            )}
          </div>
        ) : (
          <>
            <div className="rms-chat-sidebar-header">
              <div><h2>Messages</h2><p>Valencia Connect</p></div>
              <div className="vc-header-actions">
                <button
                  type="button"
                  title="New group"
                  aria-label="Create new group"
                  onClick={() => {
                    setError("");
                    setGroupStep("members");
                    setSidebarMode("new-group");
                  }}
                ><Plus size={19} /></button>
                <button type="button" title="Refresh" aria-label="Refresh conversations" onClick={() => loadSidebar().catch((err) => setError(getError(err)))}>
                  <RefreshCw size={18} />
                </button>
              </div>
            </div>
            <div className="rms-chat-search">
              <Search size={18} />
              <input
                aria-label="Search employees and chats"
                placeholder="Search people or chats..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="rms-chat-sidebar-scroll">
              <button type="button" className="rms-chat-person rms-chat-myspace" onClick={openMySpace}>
                <span className="rms-chat-avatar"><MessageCircle size={19} /></span>
                <span className="rms-chat-person-text"><strong>My Space (You)</strong><small>Private notes to yourself</small></span>
              </button>
              {loading && <p className="rms-chat-hint">Loading conversations...</p>}
              {filteredConversations.some((c) => c.conversation_type === "group") && (
                <div className="rms-chat-section-title">Groups</div>
              )}
              {filteredConversations.filter((c) => c.conversation_type === "group").map((chat) => (
                <button key={chat.conversation_id} type="button" className={`rms-chat-person ${String(selectedId) === String(chat.conversation_id) ? "selected" : ""}`} onClick={() => openConversation(chat)}>
                  <span className="rms-chat-avatar vc-group-avatar"><UsersRound size={19} /></span>
                  <span className="rms-chat-person-text"><strong>{displayName(chat)}</strong><small>{chat.last_message || "Group · Start chatting"}</small></span>
                  {Number(chat.unread_count) > 0 && <span className="rms-chat-unread">{chat.unread_count}</span>}
                </button>
              ))}
              {filteredConversations.some((c) => c.conversation_type !== "group") && (
                <div className="rms-chat-section-title">Direct messages</div>
              )}
              {filteredConversations.filter((c) => c.conversation_type !== "group").map((chat) => (
                <button key={chat.conversation_id} type="button" className={`rms-chat-person ${String(selectedId) === String(chat.conversation_id) ? "selected" : ""}`} onClick={() => openConversation(chat)}>
                  <span className="rms-chat-avatar">{displayName(chat).charAt(0).toUpperCase()}</span>
                  <span className="rms-chat-person-text"><strong>{displayName(chat)}</strong><small>{chat.last_message || "Start chatting"}</small></span>
                  {Number(chat.unread_count) > 0 && <span className="rms-chat-unread">{chat.unread_count}</span>}
                </button>
              ))}
              <div className="rms-chat-section-title">Start a conversation</div>
              {filteredUsers.map((user) => (
                <button type="button" key={user.user_id} className="rms-chat-person" disabled={opening} onClick={() => startConversation(user)}>
                  <span className="rms-chat-avatar">{user.full_name?.charAt(0).toUpperCase() || "U"}</span>
                  <span className="rms-chat-person-text"><strong>{user.full_name}</strong><small>{user.designation || "Colleague"}</small></span>
                </button>
              ))}
              {error && !selected && <div className="rms-chat-error" role="alert">{error}</div>}
            </div>
          </>
        )}
      </aside>

      <section className={`rms-chat-main ${(!selected || sidebarMode === "new-group") ? "mobile-hidden" : ""} ${groupSettings ? "vc-group-info-open" : ""}`}>
        {selected ? (
          <>
            <header className="rms-chat-header">
              <button type="button" className="rms-chat-back" aria-label="Back to chats" onClick={() => {
                selectionVersion.current += 1;
                activeId.current = null;
                setSelected(null);
                groupInfoOpen.current = false;
                setGroupSettings(false);
                updateMessages([]);
                setPendingMessage(null);
              }}><ArrowLeft size={20} /></button>
              <span className={`rms-chat-avatar ${selected.conversation_type === "group" ? "vc-group-avatar" : ""}`}>
                {selected.conversation_type === "group" ? <UsersRound size={19} /> : displayName(selected).charAt(0).toUpperCase()}
              </span>
              <div className="vc-chat-title">
                <strong>{displayName(selected)}</strong>
                <small>{selected.conversation_type === "group" ? (groupSettings ? "Group details · Return to messages to chat" : "Group · View members and information") : selected.conversation_type === "self" ? "Private · Only you" : "Direct message"}</small>
              </div>
              {selected.conversation_type === "group" && (
                <button type="button" className="vc-group-settings-trigger" onClick={() => {
                  if (groupSettings) closeGroupSettings();
                  else openGroupSettings();
                }} title="View group info" aria-label="Group info">
                  <Settings2 size={19} />
                </button>
              )}
            </header>
            {error && <div className="rms-chat-error" role="alert"><AlertCircle size={16}/>{error}</div>}
            <div className="rms-chat-messages">
              {hasMore && <button type="button" className="rms-chat-load" disabled={loadingOlder} onClick={loadOlder}>{loadingOlder ? "Loading..." : "Load older messages"}</button>}
              {messageLoading && <p className="rms-chat-hint">Loading messages...</p>}
              {!messageLoading && messages.length === 0 && (
                <div className="rms-chat-empty"><MessageCircle size={38}/><p>No messages yet. Say hello!</p></div>
              )}
              {messages.map((message) => (
                <div key={message.message_id} className={`rms-chat-message ${String(message.sender_id) === String(myId) ? "own" : "other"}`}>
                  {selected.conversation_type === "group" && String(message.sender_id) !== String(myId) && (
                    <strong className="vc-message-sender">{message.sender_name || "Colleague"}</strong>
                  )}
                  <span>{message.message_text}</span>
                  <small>{formatTime(message.created_at)}</small>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="rms-chat-compose" onSubmit={send}>
              <input
                value={draft}
                maxLength={4000}
                disabled={sending}
                placeholder={selected.conversation_type === "self" ? "Write a note to yourself..." : `Message ${displayName(selected)}...`}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (pendingMessage && event.target.value !== pendingMessage.text) setPendingMessage(null);
                }}
                aria-label="Message"
              />
              <button type="submit" disabled={sending || !(pendingMessage?.text || draft.trim())} aria-label="Send message">
                {sending ? <Loader2 size={18}/> : <Send size={18}/>}
              </button>
            </form>
          </>
        ) : (
          <div className="rms-chat-empty rms-chat-welcome">
            <MessageCircle size={48} />
            <h2>Valencia Connect</h2>
            <p>Choose a chat or create a group to get started.</p>
          </div>
        )}

        {groupSettings && selected?.conversation_type === "group" && (
          <aside className="vc-group-details" aria-label="Group details">
            <header className="vc-flow-heading">
              <button className="vc-icon-btn" type="button" onClick={closeGroupSettings} aria-label="Back to messages"><ArrowLeft size={20}/></button>
              <div><h2>Group info</h2><p>{displayName(selected)}</p></div>
            </header>
            <div className="vc-group-info-body">
              {groupLoading && <p className="rms-chat-hint">Loading group information...</p>}
              <div className="vc-group-icon-big"><UsersRound size={29}/></div>
              <h3>{displayName(selected)}</h3>
              <p className="vc-small-hint">{groupMembers.length} members</p>
              <div className="vc-history-info">
                <Check size={16} />
                <span>Each member has individual history access. Default: only messages after joining. Group admins may allow earlier messages.</span>
              </div>
              {amGroupAdmin && (
                <form className="vc-group-rename" onSubmit={renameSelectedGroup}>
                  <label className="vc-field-label" htmlFor="vc-rename-group">Group name</label>
                  <div className="vc-inline-edit">
                    <input id="vc-rename-group" className="vc-inline-input" minLength={2} maxLength={150} value={groupRename} onChange={(e) => setGroupRename(e.target.value)}/>
                    <button type="submit" title="Save name" aria-label="Save group name" disabled={groupBusy || groupRename.trim().length < 2}><Check size={18}/></button>
                  </div>
                </form>
              )}
              <div className="rms-chat-section-title">Members ({groupMembers.length})</div>
              <div className="vc-group-member-list">
                {groupMembers.map((member) => (
                  <div className="vc-group-member" key={member.user_id}>
                    <span className="rms-chat-avatar">{member.full_name?.charAt(0).toUpperCase() || "U"}</span>
                    <span className="rms-chat-person-text"><strong>{member.full_name}</strong><small>{member.participant_role === "admin" ? "Group admin" : "Member"} · {member.history_access === "all" ? "Full history" : "Since joining"}</small></span>
                    {amGroupAdmin && Number(member.user_id) !== myId && (
                      <select
                        className="vc-history-member-select"
                        aria-label={`History access for ${member.full_name}`}
                        disabled={groupBusy}
                        value={String(pendingHistoryChange?.userId) === String(member.user_id)
                          ? pendingHistoryChange.historyAccess
                          : (member.history_access || "new")}
                        onChange={(event) => setPendingHistoryChange({
                          userId: member.user_id,
                          name: member.full_name,
                          historyAccess: event.target.value,
                        })}
                      >
                        <option value="new">Only new</option>
                        <option value="all">All history</option>
                      </select>
                    )}
                    {amGroupAdmin && Number(member.user_id) !== myId && (
                      <button type="button" title={`Remove ${member.full_name}`} aria-label={`Remove ${member.full_name}`} disabled={groupBusy} onClick={() => { setPendingHistoryChange(null); setPendingRemoval({ userId: member.user_id, name: member.full_name }); }}><X size={16}/></button>
                    )}
                  </div>
                ))}
              </div>
              {pendingRemoval && (
                <div className="vc-history-confirm" role="alert">
                  <strong>Remove {pendingRemoval.name} from this group?</strong>
                  <p>They will stop receiving new messages and lose group access. This cannot undo messages they previously viewed or saved.</p>
                  <div className="vc-history-confirm-actions">
                    <button type="button" disabled={groupBusy} onClick={() => setPendingRemoval(null)}>Cancel</button>
                    <button type="button" disabled={groupBusy} onClick={async () => {
                      const target = pendingRemoval;
                      await modifyGroup(() => chatApi.removeGroupMember(selected.conversation_id, target.userId));
                      setPendingRemoval(null);
                    }}>{groupBusy ? "Removing..." : "Remove member"}</button>
                  </div>
                </div>
              )}
              {pendingHistoryChange && (
                <div className="vc-history-confirm" role="status">
                  <strong>{pendingHistoryChange.historyAccess === "all" ? "Share earlier messages?" : "Restrict history access?"}</strong>
                  <p>
                    {pendingHistoryChange.historyAccess === "all"
                      ? `${pendingHistoryChange.name} will be able to read older messages. Only grant this when appropriate; access already seen cannot be erased.`
                      : `${pendingHistoryChange.name} will see only messages from their most recent join onward. This cannot erase messages already viewed or saved.`}
                  </p>
                  <div className="vc-history-confirm-actions">
                    <button type="button" disabled={groupBusy} onClick={() => setPendingHistoryChange(null)}>Cancel</button>
                    <button
                      type="button"
                      disabled={groupBusy}
                      onClick={async () => {
                        const change = pendingHistoryChange;
                        if (groupBusy) return;
                        setGroupBusy(true);
                        try {
                          await chatApi.setGroupMemberHistory(
                            selected.conversation_id, change.userId, change.historyAccess
                          );
                          await refreshGroupMembers();
                          setPendingHistoryChange(null);
                          setError("");
                        } catch (err) {
                          setError(getError(err));
                        } finally {
                          setGroupBusy(false);
                        }
                      }}
                    >{groupBusy ? "Saving..." : "Confirm change"}</button>
                  </div>
                </div>
              )}
              {amGroupAdmin && (
                <div className="vc-add-members">
                  <label className="vc-field-label">Add a colleague</label>
                  <div className="vc-history-choice" role="group" aria-label="History access for newly added members">
                    <span className="vc-field-label">What can this colleague see?</span>
                    <label><input type="radio" name="new-member-history" value="new" checked={newMemberHistory === "new"} onChange={() => setNewMemberHistory("new")}/> Only messages after joining</label>
                    <label><input type="radio" name="new-member-history" value="all" checked={newMemberHistory === "all"} onChange={() => setNewMemberHistory("all")}/> All previous messages</label>
                    {newMemberHistory === "all" && <p className="vc-history-warning">This person can read previous group messages. Share only if the history is appropriate.</p>}
                  </div>
                  <div className="rms-chat-search vc-builder-search"><Search size={17}/><input aria-label="Search to add group members" placeholder="Search employees..." value={groupMemberSearch} onChange={(e) => setGroupMemberSearch(e.target.value)}/></div>
                  <div className="vc-group-member-list">
                    {availableGroupMembers.slice(0,30).map((u) => (
                      <button className="vc-group-member vc-add-person" type="button" key={u.user_id} disabled={groupBusy} onClick={() => modifyGroup(async () => {
                        await chatApi.addGroupMembers(selected.conversation_id, [u.user_id], newMemberHistory);
                        setNewMemberHistory("new");
                      })}>
                        <span className="rms-chat-avatar">{u.full_name?.charAt(0).toUpperCase() || "U"}</span>
                        <span className="rms-chat-person-text"><strong>{u.full_name}</strong><small>{u.designation || "Colleague"}</small></span><Plus size={16}/>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {confirmLeave && (
                <div className="vc-history-confirm" role="alert">
                  <strong>Leave this group?</strong>
                  <p>You will lose access to this conversation. If you are its only group admin, another member will become admin.</p>
                  <div className="vc-history-confirm-actions">
                    <button type="button" disabled={groupBusy} onClick={() => setConfirmLeave(false)}>Cancel</button>
                    <button type="button" disabled={groupBusy} onClick={leaveSelectedGroup}>{groupBusy ? "Leaving..." : "Confirm leave"}</button>
                  </div>
                </div>
              )}
              {!confirmLeave && <button type="button" className="vc-leave-group" disabled={groupBusy} onClick={() => setConfirmLeave(true)}>Leave group</button>}
              <button type="button" className="vc-next-btn vc-return-chat" onClick={closeGroupSettings}>Back to messages <ArrowRight size={16}/></button>
              {error && <p className="rms-chat-error">{error}</p>}
            </div>
          </aside>
        )}
      </section>
    </div>
  );
}
