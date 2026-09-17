const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");
const { requireRole } = require("../middleware/rolemiddleware");

const {
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

router.get(
  "/my",
  ...workerAccess,
  getMyMiniTasks
);

router.post(
  "/",
  ...workerAccess,
  createEmployeeMiniTask
);
router.put(
  "/:miniTaskId",
  ...workerAccess,
  updateEmployeeMiniTask
);

router.get(
  "/:miniTaskId/edit-history",
  ...workerAccess,
  getMiniTaskEditHistory
);
module.exports = router;
