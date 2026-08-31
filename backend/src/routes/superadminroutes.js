const express = require("express");

const authMiddleware = require(
  "../middleware/authmiddleware"
);

const {
  requireRole,
} = require(
  "../middleware/rolemiddleware"
);

/* =========================================================
   MAIN SUPERADMIN CONTROLLER
========================================================= */

const {
  getSuperadminOverview,

  getSuperadminUsers,

  getSuperadminUserDetails,

  getSuperadminTasks,

  getSuperadminProjects,

  getSuperadminProjectOptions,

  getSuperadminProjectContext,

  createSuperadminProject,

  updateSuperadminProjectAssignees,

  createSuperadminMainTask,

  deleteOwnSuperadminProject,
} = require(
  "../controllers/superadmincontroller"
);

/* =========================================================
   ATTENDANCE
========================================================= */

const {
  getSuperadminAttendance,
} = require(
  "../controllers/superadminattendancecontroller"
);

/* =========================================================
   CALENDAR
========================================================= */

const {
  getSuperadminCalendar,

  getSuperadminMeetingEmployees,

  createSuperadminMeeting,

  updateSuperadminMeeting,

  cancelSuperadminMeeting,
} = require(
  "../controllers/superadmincalendarcontroller"
);

const router =
  express.Router();

const superadminOnly = [
  authMiddleware,
  requireRole("superadmin"),
];

/* =========================================================
   OVERVIEW
========================================================= */

router.get(
  "/overview",
  ...superadminOnly,
  getSuperadminOverview
);

/* =========================================================
   USERS
========================================================= */

router.get(
  "/users",
  ...superadminOnly,
  getSuperadminUsers
);

router.get(
  "/users/:userId",
  ...superadminOnly,
  getSuperadminUserDetails
);

/* =========================================================
   TASKS
========================================================= */

router.get(
  "/tasks",
  ...superadminOnly,
  getSuperadminTasks
);

/* =========================================================
   PROJECTS
========================================================= */

router.get(
  "/projects",
  ...superadminOnly,
  getSuperadminProjects
);

router.get(
  "/project-options",
  ...superadminOnly,
  getSuperadminProjectOptions
);

router.post(
  "/projects/assign",
  ...superadminOnly,
  createSuperadminProject
);

router.get(
  "/projects/:projectId/context",
  ...superadminOnly,
  getSuperadminProjectContext
);

router.put(
  "/projects/:projectId/assignees",
  ...superadminOnly,
  updateSuperadminProjectAssignees
);

router.post(
  "/projects/:projectId/tasks",
  ...superadminOnly,
  createSuperadminMainTask
);

router.delete(
  "/projects/:projectId",
  ...superadminOnly,
  deleteOwnSuperadminProject
);

/* =========================================================
   ATTENDANCE — ALL ORGANIZATION DATA
========================================================= */

router.get(
  "/attendance",
  ...superadminOnly,
  getSuperadminAttendance
);

/* =========================================================
   CALENDAR — ALL ORGANIZATION DATA
========================================================= */

router.get(
  "/calendar",
  ...superadminOnly,
  getSuperadminCalendar
);

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

module.exports = router;