const express = require("express");
const multer = require("multer");

const authMiddleware = require("../middleware/authmiddleware");
const { requireJayAdministrator } = require("../middleware/rolemiddleware");
const employeeAttendanceController = require("../controllers/employeeattendancecontroller");

const {
  getAdministratorOverview,

  getAdministratorMyProjects,
  getAdministratorAllProjects,
  exportAdministratorProjectsCsv,
  importAdministratorProjectsCsv,

  getAdministratorMyTasks,
  getAdministratorAllTasks,
  exportAdministratorTasksCsv,
  importAdministratorTasksCsv,

  getAdministratorReports,

  getAdministratorProfile,
  updateAdministratorSkills,
  changeAdministratorPassword,

  getAdministratorUsersMeta,
  createAdministratorDepartment,
  getAdministratorDivisions,
createAdministratorDivision,
updateAdministratorDivision,
  getAdministratorUsers,
  createAdministratorUser,
  importAdministratorUsersCsv,
  updateAdministratorUserRole,
  updateAdministratorUserDetails,
  updateAdministratorUserStatus,
  resetAdministratorUserPassword,
  setAdministratorUserPassword,
  deleteAdministratorUser,

  getAdministratorUserMailRecipients,
  updateAdministratorUserMailRecipients,

  getAdministratorUserLeaveBalances,
  addAdministratorUserExtraLeave,
  reduceAdministratorUserLeave,

  getAdministratorAttendance,
  importAdministratorAttendanceCsv,
  exportAdministratorAttendanceCsv,
} = require("../controllers/administratorcontroller");

const router = express.Router();
// VALENCIA_ADMIN_APPROVAL_PERMISSIONS_V1
const db = require("../config/db");
const getApprovalSettings = async (req,res)=>{
  try {
    const id=Number(req.params.userId);
    if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({success:false,message:"Invalid user."});
    const [rows]=await db.query(`SELECT u.user_id,r.role_name,u.can_approve_leave,u.can_approve_field_visit FROM users u JOIN roles r ON r.role_id=u.role_id WHERE u.user_id=? LIMIT 1`,[id]);
    if(!rows.length)return res.status(404).json({success:false,message:"User not found."});
    if(String(rows[0].role_name).toLowerCase()!=="admin")return res.status(403).json({success:false,message:"Approval switches apply only to the admin role."});
    return res.json({success:true,can_approve_leave:Boolean(rows[0].can_approve_leave),can_approve_field_visit:Boolean(rows[0].can_approve_field_visit)});
  }catch(e){console.error("Approval settings read",e);res.status(500).json({success:false,message:"Could not load permissions."});}
};
const saveApprovalSettings = async (req,res)=>{
  try{
    const id=Number(req.params.userId);
    if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({success:false,message:"Invalid user."});
    if(typeof req.body?.can_approve_leave!=="boolean" || typeof req.body?.can_approve_field_visit!=="boolean")return res.status(400).json({success:false,message:"Both approval settings must be booleans."});
    const [result]=await db.query(`UPDATE users u JOIN roles r ON r.role_id=u.role_id SET u.can_approve_leave=?,u.can_approve_field_visit=? WHERE u.user_id=? AND LOWER(r.role_name)='admin'`,[Number(req.body.can_approve_leave),Number(req.body.can_approve_field_visit),id]);
    if(!result.affectedRows)return res.status(404).json({success:false,message:"Admin user not found."});
    return res.json({success:true,message:"Approval permissions updated."});
  }catch(e){console.error("Approval settings write",e);res.status(500).json({success:false,message:"Could not save permissions."});}
};


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();

    if (!/.(xlsx|xls|csv)$/.test(name)) {
      return cb(new Error("Only XLSX, XLS and CSV files are allowed."));
    }

    cb(null, true);
  },
});

/* =========================================================
   OVERVIEW
========================================================= */

router.get(
  "/overview",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorOverview
);

/* =========================================================
   PROJECTS
========================================================= */

router.get(
  "/projects/my",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorMyProjects
);

router.get(
  "/projects/all",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorAllProjects
);

router.get(
  "/projects/export",
  authMiddleware,
  requireJayAdministrator,
  exportAdministratorProjectsCsv
);

router.post(
  "/projects/import",
  authMiddleware,
  requireJayAdministrator,
  upload.single("file"),
  importAdministratorProjectsCsv
);

/* =========================================================
   TASKS
========================================================= */

router.get(
  "/tasks/my",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorMyTasks
);

router.get(
  "/tasks/all",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorAllTasks
);

router.get(
  "/tasks/export",
  authMiddleware,
  requireJayAdministrator,
  exportAdministratorTasksCsv
);

router.post(
  "/tasks/import",
  authMiddleware,
  requireJayAdministrator,
  upload.single("file"),
  importAdministratorTasksCsv
);

/* =========================================================
   REPORTS
========================================================= */

router.get(
  "/reports",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorReports
);

/* =========================================================
   PROFILE
========================================================= */

router.get(
  "/profile",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorProfile
);

router.put(
  "/profile/skills",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorSkills
);

router.put(
  "/profile/change-password",
  authMiddleware,
  requireJayAdministrator,
  changeAdministratorPassword
);

/* =========================================================
   USERS META
========================================================= */

router.get(
  "/users/meta",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorUsersMeta
);

/* =========================================================
   DEPARTMENTS
========================================================= */

router.post(
  "/departments",
  authMiddleware,
  requireJayAdministrator,
  createAdministratorDepartment
);

/* =========================================================
   DIVISIONS
========================================================= */

router.get(
  "/divisions",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorDivisions
);

router.post(
  "/divisions",
  authMiddleware,
  requireJayAdministrator,
  createAdministratorDivision
);

router.put(
  "/divisions/:divisionId",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorDivision
);

/* =========================================================
   USERS
========================================================= */

router.get(
  "/users",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorUsers
);

router.post(
  "/users",
  authMiddleware,
  requireJayAdministrator,
  createAdministratorUser
);

router.post(
  "/users/import",
  authMiddleware,
  requireJayAdministrator,
  upload.single("file"),
  importAdministratorUsersCsv
);

router.put(
  "/users/:userId/details",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorUserDetails
);

router.put(
  "/users/:userId/role",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorUserRole
);

router.put(
  "/users/:userId/status",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorUserStatus
);

router.put(
  "/users/:userId/reset-password",
  authMiddleware,
  requireJayAdministrator,
  resetAdministratorUserPassword
);

router.put(
  "/users/:userId/password",
  authMiddleware,
  requireJayAdministrator,
  setAdministratorUserPassword
);

router.delete(
  "/users/:userId",
  authMiddleware,
  requireJayAdministrator,
  deleteAdministratorUser
);

/* =========================================================
   USER MAIL RECIPIENT MANAGEMENT
========================================================= */

router.get(
  "/users/:userId/mail-recipients",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorUserMailRecipients
);

router.put(
  "/users/:userId/mail-recipients",
  authMiddleware,
  requireJayAdministrator,
  updateAdministratorUserMailRecipients
);

/* =========================================================
   USER LEAVE MANAGEMENT
========================================================= */

router.get(
  "/users/:userId/leave-balances",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorUserLeaveBalances
);

router.post(
  "/users/:userId/leave-extra",
  authMiddleware,
  requireJayAdministrator,
  addAdministratorUserExtraLeave
);

router.post(
  "/users/:userId/leave-reduction",
  authMiddleware,
  requireJayAdministrator,
  reduceAdministratorUserLeave
);

/* =========================================================
   ATTENDANCE
========================================================= */

router.get(
  "/attendance/my",
  authMiddleware,
  requireJayAdministrator,
  employeeAttendanceController.getEmployeeAttendance
);

router.get(
  "/attendance",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorAttendance
);

router.post(
  "/attendance/import",
  authMiddleware,
  requireJayAdministrator,
  upload.single("file"),
  importAdministratorAttendanceCsv
);

router.get(
  "/attendance/export",
  authMiddleware,
  requireJayAdministrator,
  exportAdministratorAttendanceCsv
);


// VALENCIA_ADMIN_APPROVAL_PERMISSIONS_V1_ENDPOINTS
router.get("/users/:userId/approval-permissions",authMiddleware,requireJayAdministrator,getApprovalSettings);
router.put("/users/:userId/approval-permissions",authMiddleware,requireJayAdministrator,saveApprovalSettings);

module.exports = router;
