const express =
  require("express");

const authMiddleware =
  require(
    "../middleware/authmiddleware"
  );

const {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} = require(
  "../controllers/notificationcontroller"
);


const router =
  express.Router();


router.get(
  "/",
  authMiddleware,
  getNotifications
);


router.get(
  "/unread-count",
  authMiddleware,
  getUnreadCount
);


router.patch(
  "/read-all",
  authMiddleware,
  markAllNotificationsRead
);


router.patch(
  "/:notificationId/read",
  authMiddleware,
  markNotificationRead
);


module.exports =
  router;