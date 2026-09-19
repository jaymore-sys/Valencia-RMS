const express = require("express");

const authMiddleware = require(
  "../middleware/authmiddleware"
);

const {
  getAdminLeaveApplications,
  reviewLeaveApplication,
  furtherApproveLeaveApplication,
  reviewLeaveRevertRequest,
} = require(
  "../controllers/adminleavecontroller"
);

const router = express.Router();

/*
========================================================
LEAVE ACCESS

Can VIEW:
1. Department Admin
2. Premal
3. Rathika

Can APPROVE / REJECT:
1. Department Admin
2. Premal
3. Rathika

Department restrictions and self-review
restrictions are validated again inside
adminleavecontroller.js.
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
          "You are not authorized to review leave applications.",
      });
  }

  next();
};

/*
========================================================
FURTHER APPROVAL ACCESS
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
APPROVE / REJECT ORIGINAL LEAVE
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
APPROVE / REJECT LEAVE REVERT REQUEST
========================================================
*/

router.patch(
  "/:leaveId/revert",

  authMiddleware,

  allowLeaveApprover,

  reviewLeaveRevertRequest
);

/*
========================================================
FURTHER APPROVAL / ESCALATE
========================================================
*/

router.patch(
  "/:leaveId/further-approval",

  authMiddleware,

  allowDepartmentAdmin,

  furtherApproveLeaveApplication
);

module.exports = router;