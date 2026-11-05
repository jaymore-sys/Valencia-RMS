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
const db = require("../config/db");

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

  if (!isAdmin && !isPremal && !isRathika) {
    return res.status(403).json({success:false,message:"Leave approval denied."});
  }
  // VALENCIA_APPROVALS_V3_FIX: Premal uses his saved Admin switch. Rathika preserves existing HR authorization.
  if (isRathika && !isPremal) return next();
  db.query("SELECT can_approve_leave FROM users WHERE user_id=? AND status='active' LIMIT 1",[req.user.user_id])
    .then(([rows])=>{
      if (Number(rows[0]?.can_approve_leave) !== 1)
        return res.status(403).json({success:false,message:"Leave approval permission disabled. Notifications remain active."});
      next();
    }).catch(e=>{console.error("Leave permission:",e);res.status(500).json({success:false,message:"Unable to verify approval permission."});});
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

  db.query("SELECT can_approve_leave FROM users WHERE user_id=? AND status='active' LIMIT 1",[req.user.user_id])
    .then(([rows])=>{
      if(Number(rows[0]?.can_approve_leave)!==1)return res.status(403).json({success:false,message:"Leave approval permission disabled."});
      next();
    }).catch(e=>{console.error("Further leave permission:",e);res.status(500).json({success:false,message:"Unable to verify approval permission."});});
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