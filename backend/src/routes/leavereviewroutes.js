const express = require("express");
const router = express.Router();

const controller = require("../controllers/leavereviewcontroller");

router.get(
  "/:token",
  controller.getLeaveReview
);

module.exports = router;
