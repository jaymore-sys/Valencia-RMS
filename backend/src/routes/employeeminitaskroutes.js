const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");

const {
  requireRole,
} = require("../middleware/rolemiddleware");

const {
  getMiniTaskDivisions,
  getMiniTaskDepartments,
  createEmployeeMiniTask,
  getMyMiniTasks,
  updateEmployeeMiniTask,
  getMiniTaskEditHistory,
} = require("../controllers/minitaskcontroller");

const router = express.Router();

const workerAccess = [
  authMiddleware,

  requireRole(
    "employee",
    "administrator",
    "admin",
    "superadmin"
  ),
];

/* =========================================================
   MINI TASK DIVISIONS
========================================================= */

router.get(
  "/divisions",
  ...workerAccess,
  getMiniTaskDivisions
);

/*
Backward compatibility.

Existing frontend may still call /departments.
It now returns Division data through the compatibility
handler in minitaskcontroller.js.
*/

router.get(
  "/departments",
  ...workerAccess,
  getMiniTaskDepartments
);

/* =========================================================
   MY MINI TASKS
========================================================= */

router.get(
  "/my",
  ...workerAccess,
  getMyMiniTasks
);

/* =========================================================
   CREATE MINI TASK
========================================================= */

router.post(
  "/",
  ...workerAccess,
  createEmployeeMiniTask
);

/* =========================================================
   UPDATE MINI TASK
========================================================= */

router.put(
  "/:miniTaskId",
  ...workerAccess,
  updateEmployeeMiniTask
);

/* =========================================================
   MINI TASK EDIT HISTORY
========================================================= */

router.get(
  "/:miniTaskId/edit-history",
  ...workerAccess,
  getMiniTaskEditHistory
);

module.exports = router;