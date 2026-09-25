const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");

const {
  requireRole,
} = require("../middleware/rolemiddleware");

const {
  getDepartmentMiniTasks,
  markMiniTaskReviewed,
} = require("../controllers/minitaskcontroller");

const router = express.Router();

/* =========================================================
   ADMIN MINI TASK VIEW

   Returns:
   - Mini Tasks of employees under Admin Department access
   - Mini Tasks belonging to Admin Division access

   can_review = 1 only when Admin has that Division.
========================================================= */

router.get(
  "/department",
  authMiddleware,
  requireRole("admin"),
  getDepartmentMiniTasks
);

/* =========================================================
   REVIEW MINI TASK

   Review permission is Division-based only.
========================================================= */

router.put(
  "/:miniTaskId/reviewed",
  authMiddleware,
  requireRole("admin"),
  markMiniTaskReviewed
);

module.exports = router;