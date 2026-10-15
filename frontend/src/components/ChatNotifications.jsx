
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, MessageCircle, X } from "lucide-react";
import api from "../api/axios";
import "./ChatNotifications.css";

const getUser = () => {
  try {
    return JSON.parse(
      sessionStorage.getItem("user") ||
      localStorage.getItem("user") ||
      "{}"
    );
  } catch {
    return {};
  }
};

const playSound = () => {
  try {
    const AudioContext =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return;

    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      880,
      ctx.currentTime + 0.14
    );

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.07,
      ctx.currentTime + 0.025
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + 0.24
    );

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.25);

    oscillator.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Sound is optional and must never break chat.
  }
};

export default function ChatNotifications({ role = "employee" }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(null);
  const [permission, setPermission] = useState(
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported"
  );

  const previousMessages = useRef(new Map());
  const initialized = useRef(false);
  const busy = useRef(false);
  const toastTimer = useRef(null);

  const user = getUser();
  const myId = Number(user.user_id);
  const chatPath = `/${role}/chat`;
 const onChatPage =
  /^\/(employee|admin|administrator|superadmin)\/chat\/?$/.test(
    location.pathname
  );

  const showToast = (name, text) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);

    setToast({
      title: name || "New chat message",
      text: text || "You have a new message.",
    });

    toastTimer.current = setTimeout(() => {
      setToast(null);
    }, 6000);
  };

  useEffect(() => {
    let alive = true;

    const refresh = async () => {
      if (!alive || busy.current) return;

      busy.current = true;

      try {
        const [unreadResponse, conversationsResponse] =
          await Promise.all([
            api.get("/chat/unread-summary"),
            api.get("/chat/conversations"),
          ]);

        if (!alive) return;

        const unreadTotal =
          Number(unreadResponse.data?.total_unread) || 0;

        setUnread(unreadTotal);

        const conversations =
          conversationsResponse.data?.conversations || [];

        for (const conversation of conversations) {
          const id = String(conversation.conversation_id);
          const messageId = Number(
            conversation.last_message_id || 0
          );

          const previous = previousMessages.current.get(id);
          const isNew =
            initialized.current &&
            previous !== undefined &&
            messageId > previous;

          const isIncoming =
            Number(conversation.last_sender_id) !== myId;

          if (
            isNew &&
            isIncoming &&
            Number(conversation.unread_count) > 0 &&
            !onChatPage
          ) {
            const title =
              conversation.group_name ||
              conversation.other_user_name ||
              "Valencia Connect";

            showToast(title, conversation.last_message);
            playSound();

            if (
              typeof Notification !== "undefined" &&
              Notification.permission === "granted" &&
              document.visibilityState !== "visible"
            ) {
              try {
                const notification = new Notification(
                  `Valencia Connect — ${title}`,
                  {
                    body: "You have a new message.",
                    tag: `valencia-chat-${id}`,
                  }
                );

                notification.onclick = () => {
                  window.focus();
                  navigate(chatPath);
                  notification.close();
                };
              } catch {
                // Some browsers prohibit desktop notifications.
              }
            }
          }

          previousMessages.current.set(
            id,
            Math.max(messageId, previous || 0)
          );
        }

        initialized.current = true;
      } catch (error) {
        // Skip failures while network is unavailable.
        // No notification count is fabricated.
        if (error?.response?.status === 503 && alive) {
          setUnread(0);
        }
      } finally {
        busy.current = false;
      }
    };

    refresh();

    const interval = setInterval(refresh, 12000);

    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [chatPath, myId, navigate, onChatPage]);

  const enableDesktop = async () => {
    if (
      typeof Notification === "undefined" ||
      !window.isSecureContext
    ) {
      setPermission("unsupported");
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
    } catch {
      setPermission("unsupported");
    }
  };

  if (onChatPage) return null;

  return (
    <>
      <div className="vc-floating-tools">
        <button
          type="button"
          className="vc-chat-shortcut"
          onClick={() => navigate(chatPath)}
          title={`${unread} unread chat messages`}
        >
          <MessageCircle size={21} />
          {unread > 0 && (
            <span className="vc-unread-badge">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        {permission === "default" && (
          <button
            type="button"
            className="vc-notification-toggle"
            title="Enable desktop notifications"
            onClick={enableDesktop}
          >
            <Bell size={17} />
          </button>
        )}
      </div>

      {toast && !onChatPage && (
        <div className="vc-chat-toast" role="status">
          <div className="vc-toast-icon">
            <MessageCircle size={20} />
          </div>

          <button
            type="button"
            className="vc-toast-content"
            onClick={() => {
              setToast(null);
              navigate(chatPath);
            }}
          >
            <strong>{toast.title}</strong>
            <span>{toast.text}</span>
            <small>Open conversation</small>
          </button>

          <button
            type="button"
            className="vc-toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <X size={17} />
          </button>
        </div>
      )}
    </>
  );
}
