const express = require("express");

const authMiddleware = require(
  "../middleware/authmiddleware"
);

const {
  getAdminLeaveApplications,
  reviewLeaveApplication,
} = require(
  "../controllers/adminleavecontroller"
);

const router = express.Router();

/*
========================================================
LEAVE REVIEW ACCESS

Allowed:
1. Normal Admin
2. Rathika
3. Premal
4. Manish

Department restrictions for normal Admins
are enforced inside adminleavecontroller.js.

Rathika, Premal and Manish are global
leave approvers.
========================================================
*/

const GLOBAL_LEAVE_APPROVER_EMAILS = [
  "manish@valencianutrition.com",
  "premal.mehta@valencianutrition.com",
  "rathika.haleangadi@valencianutrition.com",
];

const allowLeaveReviewer = (
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

  const isGlobalApprover =
    GLOBAL_LEAVE_APPROVER_EMAILS.includes(
      email
    );

  if (
    !isAdmin &&
    !isGlobalApprover
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
GET LEAVE APPLICATIONS
========================================================
*/

router.get(
  "/",
  authMiddleware,
  allowLeaveReviewer,
  getAdminLeaveApplications
);

router.get(
  "/applications",
  authMiddleware,
  allowLeaveReviewer,
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
  allowLeaveReviewer,
  reviewLeaveApplication
);

module.exports = router;