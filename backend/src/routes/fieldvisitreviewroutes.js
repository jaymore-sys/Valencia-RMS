
const express = require("express");
const router = express.Router();
const controller = require("../controllers/fieldvisitreviewcontroller");

router.get("/:token", controller.getFieldVisitReview);

module.exports = router;
