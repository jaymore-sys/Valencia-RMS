const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authmiddleware");
const { requireRole } = require("../middleware/rolemiddleware");

const {
  getAdminDepartmentUsers,
  getAdminAssignableUsers,
  getAdminUserTimeSummary,
  getAdminDivisionReport,
} = require("../controllers/admincontroller");


// Every /api/admin route is department-admin only (previously any logged-in user).
router.use(authMiddleware, requireRole("admin"));

router.get("/division-report", getAdminDivisionReport);

const {
  createAdminProject,
  getAdminProjects,
  exportAdminProjectsCsv,
} = require("../controllers/adminprojectcontroller");
router.get("/users", getAdminDepartmentUsers);
router.get(
  "/users/:userId/time-summary",
  getAdminUserTimeSummary
);

router.get("/assignable-users", getAdminAssignableUsers);
router.get(
  "/projects",
  getAdminProjects
);

router.post(
  "/projects",
  createAdminProject
);

router.get(
  "/projects/export",
  exportAdminProjectsCsv
);
module.exports = router;