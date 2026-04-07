const express = require("express");
const router = express.Router();
const { buildAndPushImageStreaming } = require("../utils/buildService");
const sessionLogs = new Map();
const MAX_LOG_EVENTS = 4000;

function getSessionId(req) {
  const raw = (req.headers["x-session-id"] || "").toString().trim();
  if (raw) return raw.slice(0, 120);
  return `anon:${req.ip || "unknown"}`;
}

function appendSessionEvent(sessionId, evt) {
  const arr = sessionLogs.get(sessionId) || [];
  arr.push({ ...evt, at: Date.now() });
  if (arr.length > MAX_LOG_EVENTS) {
    arr.splice(0, arr.length - MAX_LOG_EVENTS);
  }
  sessionLogs.set(sessionId, arr);
}

function validateBuildBody(body) {
  const { repoUrl, branch, registryName, repository, tag } = body || {};
  if (!repoUrl || !branch || !registryName || !repository || !tag) {
    return "repoUrl, branch, registryName, repository, and tag are required";
  }
  return null;
}

function validateUiLogBody(body) {
  const evt = body && body.event;
  if (!evt || typeof evt !== "object") {
    return "event object is required";
  }
  if (typeof evt.message !== "string" || !evt.message.trim()) {
    return "event.message is required";
  }
  return null;
}

/**
 * @swagger
 * /api/build/push:
 *   post:
 *     summary: Build docker image and push to ACR (streaming NDJSON logs)
 *     tags:
 *       - Build
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               repoUrl:
 *                 type: string
 *               branch:
 *                 type: string
 *               registryName:
 *                 type: string
 *               repository:
 *                 type: string
 *               tag:
 *                 type: string
 *     responses:
 *       200:
 *         description: NDJSON stream — lines are JSON objects (phase, log, done)
 *       400:
 *         description: Invalid body
 */
router.post("/push", async (req, res) => {
  const bad = validateBuildBody(req.body);
  if (bad) {
    return res.status(400).json({ error: bad });
  }
  const sessionId = getSessionId(req);

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const write = (obj) => {
    appendSessionEvent(sessionId, obj);
    res.write(`${JSON.stringify(obj)}\n`);
  };

  try {
    await buildAndPushImageStreaming(req.body, write);
  } catch (err) {
    write({
      type: "done",
      success: false,
      error: err.message || String(err),
    });
  }

  res.end();
});

router.post("/logs", (req, res) => {
  const bad = validateUiLogBody(req.body);
  if (bad) {
    return res.status(400).json({ error: bad });
  }
  const sessionId = getSessionId(req);
  const event = req.body.event;
  appendSessionEvent(sessionId, {
    type: "ui",
    message: String(event.message),
    level: typeof event.level === "string" ? event.level : "",
  });
  res.json({ success: true });
});

router.get("/logs", (req, res) => {
  const sessionId = getSessionId(req);
  res.json({
    sessionId,
    events: sessionLogs.get(sessionId) || [],
  });
});

router.delete("/logs", (req, res) => {
  const sessionId = getSessionId(req);
  sessionLogs.delete(sessionId);
  res.json({ success: true, sessionId });
});

module.exports = router;
