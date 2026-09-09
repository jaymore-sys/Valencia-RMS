const express = require("express");
const multer = require("multer");

const authMiddleware = require("../middleware/authmiddleware");

const {
  getHrAttendance,
  saveHrAttendance,
  importHrAttendance,
  exportHrAttendance,
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
        new Error(
          "Only XLSX, XLS and CSV files are allowed."
        )
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

router.get(
  "/",
  authMiddleware,
  onlyHR,
  getHrAttendance
);

router.get(
  "/export",
  authMiddleware,
  onlyHR,
  exportHrAttendance
);

router.post(
  "/",
  authMiddleware,
  onlyHR,
  saveHrAttendance
);

router.post(
  "/import",
  authMiddleware,
  onlyHR,
  upload.single("file"),
  importHrAttendance
);

module.exports = router;