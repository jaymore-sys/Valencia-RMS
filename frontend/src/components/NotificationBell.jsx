import {
  Bell,
  CheckCheck,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FolderKanban,
  MapPin,
} from "lucide-react";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import api from "../api/axios";


const getTypeIcon = (type) => {
  switch (
    String(type || "").toLowerCase()
  ) {
    case "leave_pending":
      return <ClipboardCheck size={17} />;

    case "field_visit_pending":
    case "field_visit_today":
      return <MapPin size={17} />;

    case "meeting":
      return <CalendarDays size={17} />;

    case "project_deadline":
    case "project_overdue":
      return <FolderKanban size={17} />;

    case "task_review":
    case "task_overdue":
      return <Clock3 size={17} />;

    default:
      return <Bell size={17} />;
  }
};


const formatRelativeTime = (
  value
) => {
  if (!value) return "";

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const seconds =
    Math.floor(
      (
        Date.now() -
        date.getTime()
      ) / 1000
    );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  if (hours < 24) {
    return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  }

  const days =
    Math.floor(
      hours / 24
    );

  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return date.toLocaleDateString();
};


const NotificationBell = () => {
  const navigate =
    useNavigate();

  const wrapperRef =
    useRef(null);

  const [
    open,
    setOpen
  ] = useState(false);

  const [
    loading,
    setLoading
  ] = useState(false);

  const [
    notifications,
    setNotifications
  ] = useState([]);

  const [
    unreadCount,
    setUnreadCount
  ] = useState(0);

  const [
    error,
    setError
  ] = useState("");


  const fetchNotifications =
    async (
      showLoader = false
    ) => {

    try {

      if (showLoader) {
        setLoading(true);
      }

      setError("");

      const response =
        await api.get(
          "/notifications"
        );

      setNotifications(
        response.data
          ?.notifications ||
        []
      );

      setUnreadCount(
        Number(
          response.data
            ?.unread_count ||
          0
        )
      );

    } catch (error) {

      console.error(
        "Notification fetch error:",
        error
      );

      setError(
        error?.response
          ?.data?.message ||
        "Failed to load notifications."
      );

    } finally {

      if (showLoader) {
        setLoading(false);
      }
    }
  };


  const fetchUnreadCount =
    async () => {

    try {

      const response =
        await api.get(
          "/notifications/unread-count"
        );

      setUnreadCount(
        Number(
          response.data
            ?.unread_count ||
          0
        )
      );

    } catch (error) {

      console.error(
        "Notification count error:",
        error
      );
    }
  };


  useEffect(() => {

    fetchUnreadCount();

    const interval =
      setInterval(
        () => {
          fetchUnreadCount();
        },
        60000
      );

    return () =>
      clearInterval(
        interval
      );

  }, []);


  useEffect(() => {

    const handleClickOutside =
      (event) => {

      if (
        wrapperRef.current &&
        !wrapperRef.current
          .contains(
            event.target
          )
      ) {
        setOpen(false);
      }
    };


    document.addEventListener(
      "mousedown",
      handleClickOutside
    );


    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };

  }, []);


  const toggleBell =
    async () => {

    const nextOpen =
      !open;

    setOpen(
      nextOpen
    );

    if (nextOpen) {
      await fetchNotifications(
        true
      );
    }
  };


  const openNotification =
    async (
      notification
    ) => {

    try {

      if (
        !notification.is_read
      ) {

        await api.patch(
          `/notifications/${notification.notification_id}/read`
        );

        setUnreadCount(
          (previous) =>
            Math.max(
              0,
              previous - 1
            )
        );

        setNotifications(
          (previous) =>
            previous.map(
              (item) =>
                item.notification_id ===
                notification.notification_id
                  ? {
                      ...item,
                      is_read: 1,
                    }
                  : item
            )
        );
      }

    } catch (error) {

      console.error(
        "Mark notification read error:",
        error
      );
    }


    setOpen(false);


    if (
      notification.target_url
    ) {
      navigate(
        notification.target_url
      );
    }
  };


  const markAllRead =
    async () => {

    try {

      await api.patch(
        "/notifications/read-all"
      );

      setUnreadCount(0);

      setNotifications(
        (previous) =>
          previous.map(
            (item) => ({
              ...item,
              is_read: 1,
            })
          )
      );

    } catch (error) {

      console.error(
        "Mark all notifications error:",
        error
      );
    }
  };


  const actionItems =
    notifications.filter(
      (item) =>
        item.category ===
        "action"
    );


  const updateItems =
    notifications.filter(
      (item) =>
        item.category !==
        "action"
    );


  const renderItem =
    (item) => {

    const unread =
      !Number(
        item.is_read
      );


    return (
      <button
        key={
          item.notification_id
        }
        type="button"
        onClick={() =>
          openNotification(
            item
          )
        }
        style={{
          ...styles.item,

          background:
            unread
              ? "#fff8f5"
              : "#ffffff",
        }}
      >

        <div
          style={{
            ...styles.itemIcon,

            color:
              item.priority ===
              "high"
                ? "#ff5733"
                : "#475467",

            background:
              item.priority ===
              "high"
                ? "#fff1ed"
                : "#f2f4f7",
          }}
        >
          {getTypeIcon(
            item.notification_type
          )}
        </div>


        <div
          style={
            styles.itemContent
          }
        >

          <div
            style={
              styles.itemTitleRow
            }
          >

            <strong
              style={
                styles.itemTitle
              }
            >
              {item.title ||
                "Notification"}
            </strong>


            {unread && (
              <span
                style={
                  styles.unreadDot
                }
              />
            )}

          </div>


          <p
            style={
              styles.itemMessage
            }
          >
            {item.message}
          </p>


          <span
            style={
              styles.itemTime
            }
          >
            {formatRelativeTime(
              item.created_at
            )}
          </span>

        </div>

      </button>
    );
  };


  return (
    <div
      ref={wrapperRef}
      style={
        styles.wrapper
      }
    >

      <button
        type="button"
        onClick={
          toggleBell
        }
        style={
          styles.bellButton
        }
        title="Notifications"
      >

        <Bell size={21} />

        {unreadCount > 0 && (
          <span
            style={
              styles.badge
            }
          >
            {unreadCount > 99
              ? "99+"
              : unreadCount}
          </span>
        )}

      </button>


      {open && (

        <div
          style={
            styles.dropdown
          }
        >

          <div
            style={
              styles.header
            }
          >

            <div>

              <h3
                style={
                  styles.heading
                }
              >
                Notifications
              </h3>

              <p
                style={
                  styles.subheading
                }
              >
                {unreadCount}
                {" "}
                unread
              </p>

            </div>


            {unreadCount > 0 && (

              <button
                type="button"
                onClick={
                  markAllRead
                }
                style={
                  styles.markAll
                }
              >
                <CheckCheck
                  size={15}
                />

                Mark all read
              </button>

            )}

          </div>


          <div
            style={
              styles.list
            }
          >

            {loading ? (

              <div
                style={
                  styles.empty
                }
              >
                Loading notifications...
              </div>

            ) : error ? (

              <div
                style={{
                  ...styles.empty,
                  color: "#b42318",
                }}
              >
                {error}
              </div>

            ) : notifications.length ===
              0 ? (

              <div
                style={
                  styles.empty
                }
              >
                No notifications.
              </div>

            ) : (

              <>

                {actionItems.length >
                  0 && (
                  <>

                    <div
                      style={
                        styles.groupTitle
                      }
                    >
                      Needs Action
                    </div>

                    {actionItems.map(
                      renderItem
                    )}

                  </>
                )}


                {updateItems.length >
                  0 && (
                  <>

                    <div
                      style={
                        styles.groupTitle
                      }
                    >
                      Upcoming & Updates
                    </div>

                    {updateItems.map(
                      renderItem
                    )}

                  </>
                )}

              </>

            )}

          </div>

        </div>

      )}

    </div>
  );
};


const styles = {

  wrapper: {
    position: "relative",
    zIndex: 100,
  },

  bellButton: {
    position: "relative",
    width: "48px",
    height: "48px",
    borderRadius: "15px",
    border:
      "1px solid #e5e7eb",
    background: "#ffffff",
    color: "#111827",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    boxShadow:
      "0 8px 24px rgba(15,23,42,0.06)",
  },

  badge: {
    position: "absolute",
    top: "-6px",
    right: "-6px",
    minWidth: "21px",
    height: "21px",
    padding: "0 5px",
    borderRadius: "999px",
    background: "#ff5733",
    color: "#ffffff",
    border:
      "2px solid #f6f7fb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "10px",
    fontWeight: 900,
  },

  dropdown: {
    position: "absolute",
    top: "58px",
    right: 0,
    width: "390px",
    maxWidth:
      "calc(100vw - 40px)",
    background: "#ffffff",
    border:
      "1px solid #e5e7eb",
    borderRadius: "22px",
    boxShadow:
      "0 24px 60px rgba(15,23,42,0.16)",
    overflow: "hidden",
  },

  header: {
    padding: "20px",
    borderBottom:
      "1px solid #eef0f3",
    display: "flex",
    alignItems: "center",
    justifyContent:
      "space-between",
    gap: "14px",
  },

  heading: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 900,
    color: "#111827",
  },

  subheading: {
    margin: "4px 0 0",
    fontSize: "12px",
    color: "#667085",
    fontWeight: 700,
  },

  markAll: {
    border: 0,
    background:
      "transparent",
    color: "#ff5733",
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "12px",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  list: {
    maxHeight: "520px",
    overflowY: "auto",
  },

  groupTitle: {
    padding:
      "12px 18px 8px",
    color: "#98a2b3",
    fontSize: "11px",
    fontWeight: 900,
    textTransform:
      "uppercase",
    letterSpacing: "0.05em",
  },

  item: {
    width: "100%",
    border: 0,
    borderBottom:
      "1px solid #f0f2f5",
    padding: "14px 18px",
    display: "flex",
    alignItems:
      "flex-start",
    gap: "12px",
    textAlign: "left",
    cursor: "pointer",
  },

  itemIcon: {
    width: "36px",
    height: "36px",
    minWidth: "36px",
    borderRadius: "11px",
    display: "grid",
    placeItems: "center",
  },

  itemContent: {
    flex: 1,
    minWidth: 0,
  },

  itemTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent:
      "space-between",
    gap: "10px",
  },

  itemTitle: {
    color: "#111827",
    fontSize: "13px",
    fontWeight: 900,
  },

  unreadDot: {
    width: "8px",
    height: "8px",
    minWidth: "8px",
    borderRadius: "50%",
    background: "#ff5733",
  },

  itemMessage: {
    margin: "5px 0 0",
    color: "#475467",
    fontSize: "12px",
    lineHeight: 1.45,
    fontWeight: 600,
  },

  itemTime: {
    display: "block",
    marginTop: "7px",
    color: "#98a2b3",
    fontSize: "11px",
    fontWeight: 700,
  },

  empty: {
    padding: "34px 20px",
    color: "#667085",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: 800,
  },

};


export default NotificationBell;