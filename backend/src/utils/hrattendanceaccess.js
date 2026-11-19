const HR_EMAILS = Object.freeze([
  "rathika.haleangadi@valencianutrition.com",
  "premal.mehta@valencianutrition.com",
]);

const isAuthorizedHR = (req) =>
  HR_EMAILS.includes(String(req.user?.email || "").trim().toLowerCase());

module.exports = { HR_EMAILS, isAuthorizedHR };
