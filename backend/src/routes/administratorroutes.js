const express = require("express");
const multer = require("multer");

const authMiddleware = require("../middleware/authmiddleware");
const { requireJayAdministrator } = require("../middleware/rolemiddleware");
const employeeAttendanceController = require("../controllers/employeeattendancecontroller");

const {
  getAdministratorOverview,

  getAdministratorMyProjects,
  getAdministratorAllProjects,
  exportAdministratorProjectsCsv,
  importAdministratorProjectsCsv,

  getAdministratorMyTasks,
  getAdministratorAllTasks,
  exportAdministratorTasksCsv,
  importAdministratorTasksCsv,

  getAdministratorReports,

  getAdministratorProfile,
  updateAdministratorSkills,
  changeAdministratorPassword,

  getAdministratorUsersMeta,
  createAdministratorDepartment,
  getAdministratorDivisions,
createAdministratorDivision,
updateAdministratorDivision,
  getAdministratorUsers,
  createAdministratorUser,
  importAdministratorUsersCsv,
  updateAdministratorUserRole,
  updateAdministratorUserDetails,
  updateAdministratorUserStatus,
  resetAdministratorUserPassword,
  setAdministratorUserPassword,
  deleteAdministratorUser,

  getAdministratorUserMailRecipients,
  updateAdministratorUserMailRecipients,

  getAdministratorUserLeaveBalances,
  addAdministratorUserExtraLeave,
  reduceAdministratorUserLeave,

  getAdministratorAttendance,
  importAdministratorAttendanceCsv,
  exportAdministratorAttendanceCsv,
} = require("../controllers/administratorcontroller");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

/* =========================================================
   OVERVIEW
========================================================= */

router.get(
  "/overview",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorOverview
);

/* =========================================================
   PROJECTS
========================================================= */

router.get(
  "/projects/my",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorMyProjects
);

router.get(
  "/projects/all",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorAllProjects
);

router.get(
  "/projects/export",
  authMiddleware,
  requireJayAdministrator,
  exportAdministratorProjectsCsv
);

router.post(
  "/projects/import",
  authMiddleware,
  requireJayAdministrator,
  upload.single("file"),
  importAdministratorProjectsCsv
);

/* =========================================================
   TASKS
========================================================= */

router.get(
  "/tasks/my",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorMyTasks
);

router.get(
  "/tasks/all",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorAllTasks
);

router.get(
  "/tasks/export",
  authMiddleware,
  requireJayAdministrator,
  exportAdministratorTasksCsv
);

router.post(
  "/tasks/import",
  authMiddleware,
  requireJayAdministrator,
  upload.single("file"),
  importAdministratorTasksCsv
);

/* =========================================================
   REPORTS
========================================================= */

router.get(
  "/reports",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorReports
);

/* =========================================================
   PROFILE
========================================================= */

router.get(
  "/profile",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorProfile
);

router.put(
  "/profile/skills",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorSkills
);

router.put(
  "/profile/change-password",
  authMiddleware,
  requireJayAdministrator,
  changeAdministratorPassword
);

/* =========================================================
   USERS META
========================================================= */

router.get(
  "/users/meta",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorUsersMeta
);

/* =========================================================
   DEPARTMENTS
========================================================= */

router.post(
  "/departments",
  authMiddleware,
  requireJayAdministrator,
  createAdministratorDepartment
);

/* =========================================================
   DIVISIONS
========================================================= */

router.get(
  "/divisions",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorDivisions
);

router.post(
  "/divisions",
  authMiddleware,
  requireJayAdministrator,
  createAdministratorDivision
);

router.put(
  "/divisions/:divisionId",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorDivision
);

/* =========================================================
   USERS
========================================================= */

router.get(
  "/users",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorUsers
);

router.post(
  "/users",
  authMiddleware,
  requireJayAdministrator,
  createAdministratorUser
);

router.post(
  "/users/import",
  authMiddleware,
  requireJayAdministrator,
  upload.single("file"),
  importAdministratorUsersCsv
);

router.put(
  "/users/:userId/details",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorUserDetails
);

router.put(
  "/users/:userId/role",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorUserRole
);

router.put(
  "/users/:userId/status",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorUserStatus
);

router.put(
  "/users/:userId/reset-password",
  authMiddleware,
  requireJayAdministrator,
  resetAdministratorUserPassword
);

router.put(
  "/users/:userId/password",
  authMiddleware,
  requireJayAdministrator,
  setAdministratorUserPassword
);

router.delete(
  "/users/:userId",
  authMiddleware,
  requireJayAdministrator,
  deleteAdministratorUser
);

/* =========================================================
   USER MAIL RECIPIENT MANAGEMENT
========================================================= */

router.get(
  "/users/:userId/mail-recipients",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorUserMailRecipients
);

router.put(
  "/users/:userId/mail-recipients",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorUserMailRecipients
);

/* =========================================================
   USER LEAVE MANAGEMENT
========================================================= */

router.get(
  "/users/:userId/leave-balances",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorUserLeaveBalances
);

router.post(
  "/users/:userId/leave-extra",
  authMiddleware,
  requireJayAdministrator,
  addAdministratorUserExtraLeave
);

router.post(
  "/users/:userId/leave-reduction",
  authMiddleware,
  requireJayAdministrator,
  reduceAdministratorUserLeave
);

/* =========================================================
   ATTENDANCE
========================================================= */

router.get(
  "/attendance/my",
  authMiddleware,
  requireJayAdministrator,
  employeeAttendanceController.getEmployeeAttendance
);

router.get(
  "/attendance",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorAttendance
);

router.post(
  "/attendance/import",
  authMiddleware,
  requireJayAdministrator,
  upload.single("file"),
  importAdministratorAttendanceCsv
);

router.get(
  "/attendance/export",
  authMiddleware,
  requireJayAdministrator,
  exportAdministratorAttendanceCsv
);

module.exports = router;
