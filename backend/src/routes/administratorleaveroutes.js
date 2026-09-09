const express = require("express");

const authMiddleware = require(
  "../middleware/authmiddleware"
);

const {
  requireJayAdministrator,
} = require(
  "../middleware/rolemiddleware"
);

const {
  getAdministratorDepartmentLeaves,
} = require(
  "../controllers/administratorleavecontroller"
);

const router = express.Router();

router.get(
  "/department",
  authMiddleware,
  requireJayAdministrator,
  getAdministratorDepartmentLeaves
);

module.exports = router;