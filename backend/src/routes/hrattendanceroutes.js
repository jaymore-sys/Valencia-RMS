const express = require("express");
const multer = require("multer");

const authMiddleware = require("../middleware/authmiddleware");
const { isAuthorizedHR } = require("../utils/hrattendanceaccess");

const {
  getHrAttendance,
  getHrEmployeeSummary,
  saveHrAttendance,
  importHrAttendance,
  exportHrAttendance,
  getHrLeaveManagement,
  getHrLeaveReport,
  addHrEmployeeExtraLeave,
  reduceHrEmployeeLeave,
  applyHrEmployeeLeave,
  revertHrEmployeeLeave,
  onlyActiveHR,
  previewBulkAttendance,
  commitBulkAttendance,
  getAttendanceActivity,
  getAttendanceActivityDetail,
  undoAttendanceActivity,
  undoAttendanceActivityItem,
  auditExisting,
  startBulkProcessor,
} = require("../controllers/hrattendancecontroller");

const hrRules=require('../controllers/hremployeerulescontroller');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const valid =
      name.endsWith(".xlsx") ||
      name.endsWith(".xls") ||
      name.endsWith(".csv");

    if (!valid) {
      return cb(
        new Error("Only XLSX, XLS and CSV files are allowed.")
      );
    }

    cb(null, true);
  },
});

const onlyHR = (req, res, next) => {
  if (!isAuthorizedHR(req)) {
    return res.status(403).json({
      success: false,
      message: "HR Attendance access denied.",
    });
  }

  next();
};

// Superadmin gets the same read-only employee summary (shown in its Attendance page).
const hrOrSuperadmin = (req, res, next) => {
  if (String(req.user?.role_name || "").toLowerCase() === "superadmin") {
    return next();
  }

  return onlyHR(req, res, next);
};

router.get('/rules',authMiddleware,onlyHR,hrRules.list);
router.post('/rules',authMiddleware,onlyHR,hrRules.create);
router.post('/rules/:id/deactivate',authMiddleware,onlyHR,hrRules.deactivate);

router.get(
  "/employee-summary",
  authMiddleware,
  hrOrSuperadmin,
  getHrEmployeeSummary
);

router.get("/leave-report", authMiddleware, onlyHR, getHrLeaveReport);

router.get(
  "/leave-management/:userId",
  authMiddleware,
  onlyHR,
  getHrLeaveManagement
);

router.post(
  "/leave-management/:userId/apply",
  authMiddleware,
  onlyHR,
  applyHrEmployeeLeave
);

router.post(
  "/leave-management/:userId/revert/:leaveId",
  authMiddleware,
  onlyHR,
  revertHrEmployeeLeave
);

router.post(
  "/leave-management/:userId/extra",
  authMiddleware,
  onlyHR,
  addHrEmployeeExtraLeave
);

router.post(
  "/leave-management/:userId/reduce",
  authMiddleware,
  onlyHR,
  reduceHrEmployeeLeave
);

router.get(
  "/export",
  authMiddleware,
  onlyHR,
  auditExisting("export"),
  exportHrAttendance
);

router.post(
  "/import",
  authMiddleware,
  onlyHR,
  upload.single("file"),
  auditExisting("import"),
  importHrAttendance
);

router.post(
  "/bulk/preview",
  authMiddleware,
  onlyActiveHR,
  previewBulkAttendance
);

router.post(
  "/bulk",
  authMiddleware,
  onlyActiveHR,
  commitBulkAttendance
);

router.get(
  "/activity-log",
  authMiddleware,
  onlyActiveHR,
  getAttendanceActivity
);

router.get("/activity-log/:id", authMiddleware, onlyActiveHR, getAttendanceActivityDetail);
router.post("/activity-log/:id/undo", authMiddleware, onlyActiveHR, undoAttendanceActivity);
router.post("/activity-log/:id/undo-item", authMiddleware, onlyActiveHR, undoAttendanceActivityItem);

router.get(
  "/",
  authMiddleware,
  onlyHR,
  getHrAttendance
);

router.post(
  "/",
  authMiddleware,
  onlyHR,
  auditExisting("add_attendance"),
  saveHrAttendance
);

// HR_RECURRING_RULES_V5 authorized HR-only routes.
const {getHrRulesV4,saveHrRuleV4,deactivateHrRuleV4,getHrVisitDocumentsV4}=require('../controllers/hrattendancecontroller');
router.get('/rules-v4',authMiddleware,onlyHR,getHrRulesV4);
router.post('/rules-v4',authMiddleware,onlyHR,saveHrRuleV4);
router.patch('/rules-v4/:id/disable',authMiddleware,onlyHR,deactivateHrRuleV4);
router.get('/field-visits/:id/documents',authMiddleware,onlyHR,getHrVisitDocumentsV4);
startBulkProcessor();
module.exports = router;
