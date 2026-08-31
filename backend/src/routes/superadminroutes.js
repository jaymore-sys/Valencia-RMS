const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");

const {
  requireRole,
} = require("../middleware/rolemiddleware");

/* =========================================================
   EXISTING SUPERADMIN CONTROLLER
========================================================= */

const {
  getSuperadminOverview,
  getSuperadminUsers,
  getSuperadminUserDetails,
  getSuperadminTasks,
  getSuperadminProjects,
} = require("../controllers/superadmincontroller");

/* =========================================================
   NEW SUPERADMIN PROJECT MANAGEMENT CONTROLLER
========================================================= */

const {
  getSuperadminProjectOptions,
  createSuperadminProject,
  getSuperadminProjectContext,
  updateSuperadminProjectAssignees,
  createSuperadminMainTask,
  deleteOwnSuperadminProject,
} = require(
  "../controllers/superadminprojectassignmentcontroller"
);

const router = express.Router();

/* =========================================================
   SUPERADMIN AUTH
========================================================= */

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
   PROJECT OPTIONS

   Used for:
   - Department dropdown
   - Division dropdown
   - Employee/Admin assignee list
========================================================= */

router.get(
  "/project-options",
  ...superadminOnly,
  getSuperadminProjectOptions
);

/* =========================================================
   PROJECTS

   IMPORTANT:
   Keep your existing working project GET controller.
========================================================= */

router.get(
  "/projects",
  ...superadminOnly,
  getSuperadminProjects
);

/* =========================================================
   CREATE + ASSIGN PROJECT
========================================================= */

router.post(
  "/projects/assign",
  ...superadminOnly,
  createSuperadminProject
);

/* =========================================================
   COMPLETE PROJECT CONTEXT

   Gives frontend:
   - project assignees
   - ownership/can_delete
========================================================= */

router.get(
  "/projects/:projectId/context",
  ...superadminOnly,
  getSuperadminProjectContext
);

/* =========================================================
   CHANGE PROJECT ASSIGNEES
========================================================= */

router.put(
  "/projects/:projectId/assignees",
  ...superadminOnly,
  updateSuperadminProjectAssignees
);

/* =========================================================
   CREATE MAIN TASK
========================================================= */

router.post(
  "/projects/:projectId/tasks",
  ...superadminOnly,
  createSuperadminMainTask
);

/* =========================================================
   DELETE PROJECT

   Backend controller must enforce:
   Superadmin can delete ONLY projects created by them.
========================================================= */

router.delete(
  "/projects/:projectId",
  ...superadminOnly,
  deleteOwnSuperadminProject
);

module.exports = router;