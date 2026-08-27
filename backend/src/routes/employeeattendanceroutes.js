const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");
const employeeAttendanceController = require("../controllers/employeeattendancecontroller");

const router = express.Router();

const employeeAttendanceAccess = (req, res, next) => {
  const roleName = String(req.user?.role_name || "")
    .toLowerCase()
    .trim();

  if (
    ![
      "employee",
      "administrator",
      "admin",
      "superadmin",
    ].includes(roleName)
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied.",
    });
  }

  next();
};

router.get(
  "/",
  authMiddleware,
  employeeAttendanceAccess,
  employeeAttendanceController.getEmployeeAttendance
);

router.get(
  "/my",
  authMiddleware,
  employeeAttendanceAccess,
  employeeAttendanceController.getEmployeeAttendance
);

module.exports = router;
