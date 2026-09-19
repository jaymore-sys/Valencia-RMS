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
  getEmployeeLeaveSummary,
  applyEmployeeLeave,
  requestLeaveRevert,
  getEmployeeHolidayCalendar,
  toggleEmployeeOptionalHoliday,
} = require(
  "../controllers/employeeleavecontroller"
);

const router = express.Router();

/*
========================================================
LEAVE SUMMARY
========================================================
*/

router.get(
  "/summary",

  authMiddleware,

  requireRole(
    "employee",
    "administrator",
    "admin",
    "superadmin"
  ),

  getEmployeeLeaveSummary
);

/*
========================================================
HOLIDAY CALENDAR
========================================================
*/

router.get(
  "/holidays",

  authMiddleware,

  requireRole(
    "employee",
    "administrator",
    "admin",
    "superadmin"
  ),

  getEmployeeHolidayCalendar
);

/*
========================================================
OPTIONAL HOLIDAY
========================================================
*/

router.post(
  "/holidays/toggle",

  authMiddleware,

  requireRole(
    "employee",
    "administrator",
    "admin",
    "superadmin"
  ),

  toggleEmployeeOptionalHoliday
);

/*
========================================================
APPLY LEAVE
========================================================
*/

router.post(
  "/apply",

  authMiddleware,

  requireRole(
    "employee",
    "administrator",
    "admin",
    "superadmin"
  ),

  applyEmployeeLeave
);

/*
========================================================
REQUEST LEAVE REVERT

Employee / Administrator / Admin
can request revert only for their own Leave.
Ownership is validated again inside controller.
========================================================
*/

router.patch(
  "/:leaveId/revert-request",

  authMiddleware,

  requireRole(
    "employee",
    "administrator",
    "admin",
    "superadmin"
  ),

  requestLeaveRevert
);

module.exports = router;