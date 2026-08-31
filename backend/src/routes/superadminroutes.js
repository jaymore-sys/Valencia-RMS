const express = require("express");

const authMiddleware = require(
  "../middleware/authmiddleware"
);

const {
  requireRole,
} = require(
  "../middleware/rolemiddleware"
);

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

/*
Existing working project list.
*/

router.get(
  "/projects",
  ...superadminOnly,
  getSuperadminProjects
);

/* =========================================================
   PROJECT OPTIONS

   Returns:
   - Departments
   - Divisions
   - Assignable users
========================================================= */

router.get(
  "/project-options",
  ...superadminOnly,
  getSuperadminProjectOptions
);

/* =========================================================
   CREATE PROJECT
========================================================= */

router.post(
  "/projects/assign",
  ...superadminOnly,
  createSuperadminProject
);

/* =========================================================
   PROJECT COMPLETE DETAILS

   IMPORTANT:
   Includes:
   - Project
   - Assignees
   - Main Tasks
   - Subtasks
   - Delete permission
========================================================= */

router.get(
  "/projects/:projectId/context",
  ...superadminOnly,
  getSuperadminProjectContext
);

/* =========================================================
   MANAGE PROJECT ASSIGNEES
========================================================= */

router.put(
  "/projects/:projectId/assignees",
  ...superadminOnly,
  updateSuperadminProjectAssignees
);

/* =========================================================
   ASSIGN MAIN TASK
========================================================= */

router.post(
  "/projects/:projectId/tasks",
  ...superadminOnly,
  createSuperadminMainTask
);

/* =========================================================
   DELETE OWN PROJECT

   Controller blocks deleting
   projects created by somebody else.
========================================================= */

router.delete(
  "/projects/:projectId",
  ...superadminOnly,
  deleteOwnSuperadminProject
);

module.exports = router;