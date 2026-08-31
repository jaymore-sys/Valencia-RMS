const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");

const {
  requireRole,
} = require("../middleware/rolemiddleware");

/* =========================================================
   EXISTING WORKING SUPERADMIN CONTROLLER
========================================================= */

const {
  getSuperadminOverview,
  getSuperadminUsers,
  getSuperadminUserDetails,
  getSuperadminTasks,
  getSuperadminProjects,
} = require("../controllers/superadmincontroller");

const router = express.Router();

const superadminOnly = [
  authMiddleware,
  requireRole("superadmin"),
];

/* =========================================================
   EXISTING WORKING ROUTES
   DO NOT REMOVE THESE
========================================================= */

router.get(
  "/overview",
  ...superadminOnly,
  getSuperadminOverview
);

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

router.get(
  "/tasks",
  ...superadminOnly,
  getSuperadminTasks
);

/*
  IMPORTANT:
  This is your original working Projects endpoint.
*/
router.get(
  "/projects",
  ...superadminOnly,
  getSuperadminProjects
);

/* =========================================================
   NEW PROJECT MANAGEMENT ROUTES

   Load safely so that if there is any problem inside the
   new controller, existing Superadmin routes STILL WORK.
========================================================= */

try {
  const projectManagementController = require(
    "../controllers/superadminprojectassignmentcontroller"
  );

  const {
    getSuperadminProjectOptions,
    createSuperadminProject,
    getSuperadminProjectContext,
    updateSuperadminProjectAssignees,
    createSuperadminMainTask,
    deleteOwnSuperadminProject,
  } = projectManagementController;

  /* =======================================================
     PROJECT OPTIONS
  ======================================================= */

  if (
    typeof getSuperadminProjectOptions === "function"
  ) {
    router.get(
      "/project-options",
      ...superadminOnly,
      getSuperadminProjectOptions
    );
  } else {
    console.error(
      "Superadmin project management: getSuperadminProjectOptions is missing."
    );
  }

  /* =======================================================
     CREATE PROJECT
  ======================================================= */

  if (
    typeof createSuperadminProject === "function"
  ) {
    router.post(
      "/projects/assign",
      ...superadminOnly,
      createSuperadminProject
    );
  } else {
    console.error(
      "Superadmin project management: createSuperadminProject is missing."
    );
  }

  /* =======================================================
     PROJECT CONTEXT
  ======================================================= */

  if (
    typeof getSuperadminProjectContext === "function"
  ) {
    router.get(
      "/projects/:projectId/context",
      ...superadminOnly,
      getSuperadminProjectContext
    );
  } else {
    console.error(
      "Superadmin project management: getSuperadminProjectContext is missing."
    );
  }

  /* =======================================================
     MANAGE PROJECT ASSIGNEES
  ======================================================= */

  if (
    typeof updateSuperadminProjectAssignees === "function"
  ) {
    router.put(
      "/projects/:projectId/assignees",
      ...superadminOnly,
      updateSuperadminProjectAssignees
    );
  } else {
    console.error(
      "Superadmin project management: updateSuperadminProjectAssignees is missing."
    );
  }

  /* =======================================================
     CREATE MAIN TASK
  ======================================================= */

  if (
    typeof createSuperadminMainTask === "function"
  ) {
    router.post(
      "/projects/:projectId/tasks",
      ...superadminOnly,
      createSuperadminMainTask
    );
  } else {
    console.error(
      "Superadmin project management: createSuperadminMainTask is missing."
    );
  }

  /* =======================================================
     DELETE OWN PROJECT
  ======================================================= */

  if (
    typeof deleteOwnSuperadminProject === "function"
  ) {
    router.delete(
      "/projects/:projectId",
      ...superadminOnly,
      deleteOwnSuperadminProject
    );
  } else {
    console.error(
      "Superadmin project management: deleteOwnSuperadminProject is missing."
    );
  }

  console.log(
    "Superadmin project management routes loaded."
  );
} catch (error) {
  /*
    VERY IMPORTANT:
    The existing Projects page will still work even if
    the new controller has an error.
  */

  console.error(
    "\n=============================================="
  );

  console.error(
    "SUPERADMIN PROJECT MANAGEMENT CONTROLLER FAILED"
  );

  console.error(
    "Existing Superadmin routes will continue working."
  );

  console.error(
    "Error:",
    error.message
  );

  console.error(
    error.stack
  );

  console.error(
    "==============================================\n"
  );
}

module.exports = router;