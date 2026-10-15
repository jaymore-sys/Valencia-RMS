const crypto = require("crypto");

const isProduction = process.env.NODE_ENV === "production";

// Security headers for a JSON API (no helmet dependency needed).
const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=15552000; includeSubDomains"
  );
  next();
};

// Request id on every response + log of slow requests (>1s).
const requestLogger = (req, res, next) => {
  const id = crypto.randomUUID();
  const start = process.hrtime.bigint();

  req.id = id;
  res.setHeader("X-Request-Id", id);

  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;

    if (ms > 1000 || res.statusCode >= 500) {
      console.warn(
        `[${id}] ${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${ms.toFixed(0)}ms`
      );
    }
  });

  next();
};

// In production never send SQL / internal error text to clients.
// 242 controllers return `error: error.message` / `sqlMessage`; strip them
// once here instead of editing every handler. Full detail stays in the logs.
const hideInternalErrors = (req, res, next) => {
  if (!isProduction) return next();

  const json = res.json.bind(res);

  res.json = (body) => {
    if (
      res.statusCode >= 500 &&
      body &&
      typeof body === "object" &&
      !Array.isArray(body)
    ) {
      const { error, sqlMessage, sql, stack, ...safe } = body;
      return json({ ...safe, requestId: req.id });
    }

    return json(body);
  };

  next();
};

// Fixed-window in-memory limiter, keyed by client IP (or a custom key).
// ponytail: per-process memory; move to a shared store if the API ever runs
// on more than one instance.
const rateLimit = ({ windowMs, max, message, key: keyFn }) => {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, v] of hits) if (v.reset <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn ? keyFn(req) : req.ip;
    let entry = hits.get(key);

    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    if (entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({
        success: false,
        message: message || "Too many requests. Please try again later.",
      });
    }

    next();
  };
};

// Final error handler: CORS rejections, bad JSON, anything unexpected.
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Origin not allowed.",
    });
  }

  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON body.",
    });
  }

  if (err && err.name === "MulterError") {
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
      success: false,
      message:
        err.code === "LIMIT_FILE_SIZE" ? "File too large." : "Invalid upload.",
    });
  }

  if (err && /^Only XLSX, XLS and CSV/.test(err.message || "")) {
    return res.status(400).json({ success: false, message: err.message });
  }

  if (err && err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body too large.",
    });
  }

  console.error(`[${req.id}] Unhandled error:`, err);

  return res.status(500).json({
    success: false,
    message: "Internal server error.",
    requestId: req.id,
  });
};

module.exports = {
  securityHeaders,
  requestLogger,
  hideInternalErrors,
  rateLimit,
  errorHandler,
};
