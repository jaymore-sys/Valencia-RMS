const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");
const { requireRole } = require("../middleware/rolemiddleware");

const {
  getEmployeeOverview,
} = require("../controllers/employeeoverviewcontroller");

const router = express.Router();

const overviewAccess = [
  authMiddleware,
  requireRole(
    "employee",
    "administrator",
    "admin",
    "superadmin"
  ),
];

router.get(
  "/",
  ...overviewAccess,
  getEmployeeOverview
);

router.get(
  "/overview",
  ...overviewAccess,
  getEmployeeOverview
);

module.exports = router;
