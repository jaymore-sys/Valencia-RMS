const express = require("express");
const multer = require("multer");

const authMiddleware = require("../middleware/authmiddleware");

const {
  getHrAttendance,
  getHrEmployeeSummary,
  saveHrAttendance,
  importHrAttendance,
  exportHrAttendance,
  getHrLeaveManagement,
  addHrEmployeeExtraLeave,
  reduceHrEmployeeLeave,
  applyHrEmployeeLeave,
  revertHrEmployeeLeave,
  onlyRathika,
  previewBulkAttendance,
  commitBulkAttendance,
  getAttendanceActivity,
  getAttendanceActivityDetail,
  undoAttendanceActivity,
  auditExisting,
  startBulkProcessor,
} = require("../controllers/hrattendancecontroller");

const router = express.Router();

const HR_EMAILS = [
  "rathika.haleangadi@valencianutrition.com",
];

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
  const email = String(req.user?.email || "")
    .trim()
    .toLowerCase();

  if (!HR_EMAILS.includes(email)) {
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

router.get(
  "/employee-summary",
  authMiddleware,
  hrOrSuperadmin,
  getHrEmployeeSummary
);

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
  onlyRathika,
  previewBulkAttendance
);

router.post(
  "/bulk",
  authMiddleware,
  onlyRathika,
  commitBulkAttendance
);

router.get(
  "/activity-log",
  authMiddleware,
  onlyRathika,
  getAttendanceActivity
);

router.get("/activity-log/:id", authMiddleware, onlyRathika, getAttendanceActivityDetail);
router.post("/activity-log/:id/undo", authMiddleware, onlyRathika, undoAttendanceActivity);

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

startBulkProcessor();
module.exports = router;
