const express = require("express");

const authMiddleware = require(
  "../middleware/authmiddleware"
);

const {
  getAdminLeaveApplications,
  reviewLeaveApplication,
  furtherApproveLeaveApplication,
} = require(
  "../controllers/adminleavecontroller"
);

const router = express.Router();

/*
========================================================
LEAVE VIEW ACCESS

Can VIEW:
1. Normal Admin
2. Premal
3. Rathika

Rathika = VIEW ONLY

Manish does not use this Admin route
for normal Employee / Administrator leave.
========================================================
*/

const PREMAL_LEAVE_EMAIL =
  "premal.mehta@valencianutrition.com";

const RATHIKA_LEAVE_EMAIL =
  "rathika.haleangadi@valencianutrition.com";

/*
========================================================
VIEW ACCESS
========================================================
*/

const allowLeaveViewer = (
  req,
  res,
  next
) => {
  const roleName = String(
    req.user?.role_name || ""
  )
    .trim()
    .toLowerCase();

  const email = String(
    req.user?.email || ""
  )
    .trim()
    .toLowerCase();

  const isAdmin =
    roleName === "admin";

  const isPremal =
    email ===
    PREMAL_LEAVE_EMAIL;

  const isRathika =
    email ===
    RATHIKA_LEAVE_EMAIL;

  if (
    !isAdmin &&
    !isPremal &&
    !isRathika
  ) {
    return res
      .status(403)
      .json({
        success: false,
        message:
          "You are not authorized to access leave applications.",
      });
  }

  next();
};

/*
========================================================
APPROVE / REJECT ACCESS

Can ACT:
1. Normal Admin
2. Premal

Rathika = NO ACTION
========================================================
*/

const allowLeaveApprover = (
  req,
  res,
  next
) => {
  const roleName = String(
    req.user?.role_name || ""
  )
    .trim()
    .toLowerCase();

  const email = String(
    req.user?.email || ""
  )
    .trim()
    .toLowerCase();

  const isAdmin =
    roleName === "admin";

  const isPremal =
    email ===
    PREMAL_LEAVE_EMAIL;

  if (
    !isAdmin &&
    !isPremal
  ) {
    return res
      .status(403)
      .json({
        success: false,
        message:
          "You are not authorized to review leave applications.",
      });
  }

  next();
};

/*
========================================================
FURTHER APPROVAL ACCESS

Only Department Admin initiates
Further Approval.

Final department validation is also
handled inside adminleavecontroller.js.
========================================================
*/

const allowDepartmentAdmin = (
  req,
  res,
  next
) => {
  const roleName = String(
    req.user?.role_name || ""
  )
    .trim()
    .toLowerCase();

  if (
    roleName !== "admin"
  ) {
    return res
      .status(403)
      .json({
        success: false,
        message:
          "Only a Department Admin can send a leave application for Further Approval.",
      });
  }

  next();
};

/*
========================================================
GET LEAVE APPLICATIONS
========================================================
*/

router.get(
  "/",
  authMiddleware,
  allowLeaveViewer,
  getAdminLeaveApplications
);

router.get(
  "/applications",
  authMiddleware,
  allowLeaveViewer,
  getAdminLeaveApplications
);

/*
========================================================
APPROVE / REJECT
========================================================
*/

router.patch(
  "/:leaveId/status",
  authMiddleware,
  allowLeaveApprover,
  reviewLeaveApplication
);

/*
========================================================
FURTHER APPROVAL
========================================================
*/

router.patch(
  "/:leaveId/further-approval",
  authMiddleware,
  allowDepartmentAdmin,
  furtherApproveLeaveApplication
);

module.exports = router;