const express = require("express");

const authMiddleware = require("../middleware/authmiddleware");

const {
  getEmployeeProfile,
  updateEmployeeSkills,
} = require("../controllers/employeeprofilecontroller");

const router = express.Router();

router.get("/", authMiddleware, getEmployeeProfile);
router.get("/me", authMiddleware, getEmployeeProfile);
router.get("/profile", authMiddleware, getEmployeeProfile);

router.put("/skills", authMiddleware, updateEmployeeSkills);
router.patch("/skills", authMiddleware, updateEmployeeSkills);
router.put("/me/skills", authMiddleware, updateEmployeeSkills);
router.patch("/me/skills", authMiddleware, updateEmployeeSkills);

module.exports = router;