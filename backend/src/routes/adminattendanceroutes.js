const express = require("express");
const authMiddleware = require("../middleware/authmiddleware");
const { requireRole } = require("../middleware/rolemiddleware");
const {
  getDepartmentAttendance,
  getDepartmentFieldVisits,
  reviewFieldVisit,
  createAdminFieldVisit,
  getAdminFieldVisits,
  getEmployeesForFieldVisit,
  resubmitAdminFieldVisit,
} = require("../controllers/adminattendancecontroller");

const router = express.Router();
// VALENCIA_PREMAL_FIELD_VISIT_V1
const fieldReviewRole=(req,res,next)=>{
 const role=String(req.user?.role_name||'').toLowerCase();
 const email=String(req.user?.email||'').trim().toLowerCase();
 if(role==='admin'||email==='premal.mehta@valencianutrition.com')return next();
 return res.status(403).json({success:false,message:'Field Visit access denied.'});
};

router.get(
  "/field-visits/my",
  authMiddleware,
  requireRole("admin"),
  getAdminFieldVisits
);

router.post(
  "/field-visits",
  authMiddleware,
  requireRole("admin"),
  createAdminFieldVisit
);

router.put(
  "/field-visits/:visitId/resubmit",
  authMiddleware,
  requireRole("admin"),
  resubmitAdminFieldVisit
);

router.get(
  "/department-attendance",
  authMiddleware,
  requireRole("admin"),
  getDepartmentAttendance
);

router.get(
  "/",
  authMiddleware,
  requireRole("admin"),
  getDepartmentAttendance
);

/* =========================================================
   FIELD VISITS
========================================================= */
router.get(
  "/field-visits",
  authMiddleware,
  fieldReviewRole,
  getDepartmentFieldVisits
);

router.get(
  "/field-visit-employees",
  authMiddleware,
  requireRole("admin"),
  getEmployeesForFieldVisit
);

router.post(
  "/field-visits/:visitId/review",
  authMiddleware,
  fieldReviewRole,
  reviewFieldVisit
);

module.exports = router;
