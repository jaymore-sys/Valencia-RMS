
const express = require("express");
const authMiddleware = require("../middleware/authmiddleware");
const { requireRole } = require("../middleware/rolemiddleware");

const {
  getSuperadminLeaves,
  reviewSuperadminLeave,
  getSuperadminProjects,
  getSuperadminTasks,
  getSuperadminUsers,
  getSuperadminUserById,
  getSuperadminProjectOptions,
  getSuperadminOverview,
} = require("../controllers/superadmincontroller");

const {
  getSuperadminAttendance,
  getSuperadminFieldVisits,
  reviewSuperadminFieldVisit,
} = require("../controllers/superadminattendancecontroller");

const {
  getSuperadminCalendar,
  getSuperadminMeetingEmployees,
  createSuperadminMeeting,
  updateSuperadminMeeting,
  cancelSuperadminMeeting,
} = require("../controllers/superadmincalendarcontroller");

const router = express.Router();
const superadminOnly = [authMiddleware, requireRole("superadmin")];
const fieldVisitReviewerAccess = [authMiddleware];

router.get("/overview", ...superadminOnly, getSuperadminOverview);

router.get("/projects", ...superadminOnly, getSuperadminProjects);
router.get(
  "/project-options",
  ...superadminOnly,
  getSuperadminProjectOptions
);

router.get("/tasks", ...superadminOnly, getSuperadminTasks);

router.get("/users", ...superadminOnly, getSuperadminUsers);
router.get("/users/:userId", ...superadminOnly, getSuperadminUserById);

router.get("/attendance", ...superadminOnly, getSuperadminAttendance);

router.get("/calendar", ...superadminOnly, getSuperadminCalendar);
router.get(
  "/calendar/employees",
  ...superadminOnly,
  getSuperadminMeetingEmployees
);
router.post(
  "/calendar/meetings",
  ...superadminOnly,
  createSuperadminMeeting
);
router.put(
  "/calendar/meetings/:meetingId",
  ...superadminOnly,
  updateSuperadminMeeting
);
router.patch(
  "/calendar/meetings/:meetingId/cancel",
  ...superadminOnly,
  cancelSuperadminMeeting
);

router.get("/leaves", ...superadminOnly, getSuperadminLeaves);
router.patch(
  "/leaves/:leaveId/status",
  ...superadminOnly,
  reviewSuperadminLeave
);

console.log("FIELD VISIT ROUTE CHECK:", {
  authMiddleware: typeof authMiddleware,
  getSuperadminFieldVisits: typeof getSuperadminFieldVisits,
  reviewSuperadminFieldVisit: typeof reviewSuperadminFieldVisit,
});

router.get(
  "/field-visits",
  ...fieldVisitReviewerAccess,
  getSuperadminFieldVisits
);

router.patch(
  "/field-visits/:visitId/review",
  ...fieldVisitReviewerAccess,
  reviewSuperadminFieldVisit
);

module.exports = router;
