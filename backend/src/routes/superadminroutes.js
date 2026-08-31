const express =
  require("express");

const authMiddleware =
  require(
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
} = require(
  "../controllers/superadmincontroller"
);

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
   PROJECT OPTIONS

   IMPORTANT:
   Must remain ABOVE /projects/:projectId
========================================================= */

router.get(
  "/project-options",
  ...superadminOnly,
  getSuperadminProjectOptions
);

/* =========================================================
   PROJECT LIST
========================================================= */

router.get(
  "/projects",
  ...superadminOnly,
  getSuperadminProjects
);

/* =========================================================
   CREATE / ASSIGN PROJECT
========================================================= */

router.post(
  "/projects/assign",
  ...superadminOnly,
  createSuperadminProject
);

/* =========================================================
   PROJECT COMPLETE CONTEXT
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
   ADD MAIN TASK
========================================================= */

router.post(
  "/projects/:projectId/tasks",
  ...superadminOnly,
  createSuperadminMainTask
);

/* =========================================================
   DELETE OWN PROJECT ONLY
========================================================= */

router.delete(
  "/projects/:projectId",
  ...superadminOnly,
  deleteOwnSuperadminProject
);

module.exports = router;