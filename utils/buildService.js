const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const { azureLogin } = require("./azureService");
const { resolveCloneUrlForBuild } = require("./gitService");

const IS_WIN = process.platform === "win32";

/**
 * Live logs: stdout/stderr are piped to Node (not the Windows console), so Azure
 * CLI avoids the cp1252 Colorama crash. Do not use --no-logs here.
 */
function acrBuildArgs(registryName, fullImage) {
  return [
    "acr",
    "build",
    "--registry",
    registryName,
    "--image",
    fullImage,
    ".",
  ];
}

/**
 * Docker/ACR image names must not contain spaces; `spawn`+`shell:true` on Windows splits
 * `--image` values that contain spaces and breaks `az acr build`.
 */
function assertValidRepositoryAndTag(repository, tag) {
  const repo = String(repository || "").trim();
  const t = String(tag || "").trim();
  if (!repo || !t) {
    throw new Error("Repository and tag are required.");
  }
  if (/\s/.test(repo) || /\s/.test(t)) {
    throw new Error(
      'Repository and tag cannot contain spaces (e.g. use "demo-1" or "demo1", not "demo 1").'
    );
  }
}

const AZ_CLI_LOG_SAFE_ENV = {
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
  AZURE_CORE_NO_COLOR: "true",
  NO_COLOR: "1",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeRepoClone(repoPath) {
  const retryable = new Set(["EBUSY", "EPERM", "EACCES", "ENOTEMPTY"]);

  if (IS_WIN) {
    await sleep(400);
  }

  let lastErr;
  const attempts = IS_WIN ? 12 : 5;

  for (let i = 0; i < attempts; i++) {
    try {
      await fsp.rm(repoPath, { recursive: true, force: true });
      console.log(`Removed clone directory: ${repoPath}`);
      return;
    } catch (err) {
      if (err.code === "ENOENT") {
        return;
      }
      lastErr = err;
      if (!retryable.has(err.code)) {
        throw err;
      }
      await sleep(350 + i * 450);
    }
  }

  console.error(`Failed to delete repo folder after ${attempts} tries: ${repoPath}`, lastErr);

  setTimeout(() => {
    fsp
      .rm(repoPath, { recursive: true, force: true })
      .then(() => console.log(`Deferred cleanup removed: ${repoPath}`))
      .catch(() => {});
  }, 10_000);
}

function runCommand(cmd, args, cwd = null, envExtra = null) {
  return new Promise((resolve, reject) => {
    const env = envExtra ? { ...process.env, ...envExtra } : process.env;
    const child = spawn(cmd, args, { cwd, shell: true, env });

    child.stdout.on("data", (data) => {
      console.log(data.toString("utf8"));
    });

    child.stderr.on("data", (data) => {
      console.error(data.toString("utf8"));
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed: ${cmd} (exit ${code})`));
    });
  });
}

function runCommandCapture(cmd, args, cwd = null, envExtra = null) {
  return new Promise((resolve, reject) => {
    const env = envExtra ? { ...process.env, ...envExtra } : process.env;
    const child = spawn(cmd, args, { cwd, shell: true, env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      const text = data.toString("utf8");
      stdout += text;
      console.log(text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString("utf8");
      stderr += text;
      console.error(text);
    });

    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Command failed: ${cmd} (exit ${code})`));
    });
  });
}

function formatDurationMs(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

function formatBytes(bytesLike) {
  const bytes = Number(bytesLike);
  if (!Number.isFinite(bytes) || bytes <= 0) return "N/A";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[idx]}`;
}

async function fetchImageSizeFromAcr(registryName, repository, tag) {
  const maxAttempts = 10;
  const retryDelayMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // More reliable in our environment: pick latest manifest metadata.
      const query = `[0].imageSize`;
      await azureLogin();
      const output = await runCommandCapture(
        "az",
        [
          "acr",
          "manifest",
          "list-metadata",
          "--registry",
          registryName,
          "--name",
          repository,
          "--orderby",
          "time_desc",
          "--only-show-errors",
          "--query",
          query,
          "-o",
          "tsv",
        ],
        null,
        AZ_CLI_LOG_SAFE_ENV
      );
      const formatted = formatBytes(output);
      if (formatted !== "N/A") {
        return formatted;
      }
    } catch (_) {
      // Retry below
    }
    if (attempt < maxAttempts) {
      await sleep(retryDelayMs);
    }
  }
  return "N/A";
}

/**
 * Stream stdout/stderr as UTF-8 chunks to the client via emit({ type:'log', ... }).
 * Keep shell:true on Windows so `az` (a .cmd shim) runs; shell:false causes spawn EINVAL.
 */
function runCommandStream(cmd, args, cwd, envExtra, emitLog) {
  return new Promise((resolve, reject) => {
    const env = envExtra ? { ...process.env, ...envExtra } : process.env;
    const child = spawn(cmd, args, { cwd, shell: true, env });

    child.stdout.on("data", (data) => {
      const text = data.toString("utf8");
      if (text) emitLog("stdout", text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString("utf8");
      if (text) emitLog("stderr", text);
    });

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed: ${cmd} (exit ${code})`));
    });
  });
}

/**
 * @param {object} data - repoUrl, branch, registryName, repository, tag
 * @param {(evt: object) => void} emit - NDJSON events: phase | log | done
 */
async function buildAndPushImageStreaming(data, emit) {
  const { repoUrl, branch, registryName, repository, tag } = data;
  const buildStartMs = Date.now();

  let repoPath = null;

  const safeEmit = (evt) => {
    try {
      emit(evt);
    } catch (_) {
      /* response may be closed */
    }
  };

  try {
    const cloneUrl = resolveCloneUrlForBuild(repoUrl);
    const repoName = cloneUrl.split("/").pop().replace(".git", "");
    repoPath = path.join(__dirname, "../repos", repoName);

    safeEmit({ type: "phase", message: "Azure login…" });
    await azureLogin();

    if (!fs.existsSync(repoPath)) {
      safeEmit({ type: "phase", message: "Cloning repository…" });
      await runCommand("git", ["clone", cloneUrl, repoPath]);
    }

    safeEmit({ type: "phase", message: "Git fetch…" });
    await runCommand("git", ["fetch"], repoPath);

    safeEmit({ type: "phase", message: `Checking out ${branch}…` });
    await runCommand("git", ["checkout", branch], repoPath);

    safeEmit({ type: "phase", message: `Pull ${branch}…` });
    await runCommand("git", ["pull", "origin", branch], repoPath);

    assertValidRepositoryAndTag(repository, tag);
    const fullImage = `${String(repository).trim()}:${String(tag).trim()}`;
    safeEmit({ type: "phase", message: "ACR build & push (live logs below)…" });

    await runCommandStream(
      "az",
      acrBuildArgs(registryName, fullImage),
      repoPath,
      AZ_CLI_LOG_SAFE_ENV,
      (channel, text) => {
        safeEmit({ type: "log", channel, text });
      }
    );

    const ref = `${registryName}.azurecr.io/${fullImage}`;
    safeEmit({ type: "phase", message: "Finalizing output (waiting 5s for metadata)…" });
    await sleep(5000);
    const buildDuration = formatDurationMs(Date.now() - buildStartMs);
    const imageSize = await fetchImageSizeFromAcr(
      registryName,
      String(repository).trim(),
      String(tag).trim()
    );
    safeEmit({
      type: "done",
      success: true,
      message: ref,
      output: {
        imageUrl: ref,
        timeTookToBuild: buildDuration,
        dockerImageSize: imageSize,
      },
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    safeEmit({ type: "done", success: false, error: msg });
  } finally {
    if (repoPath) {
      try {
        await removeRepoClone(repoPath);
      } catch (e) {
        console.error(`removeRepoClone after build: ${repoPath}`, e);
      }
    }
  }
}

module.exports = {
  buildAndPushImageStreaming,
  /** Non-streaming wrapper (e.g. scripts): logs to console only. */
  async buildAndPushImage(data) {
    let imageRef = null;
    await buildAndPushImageStreaming(data, (evt) => {
      if (evt.type === "log") {
        if (evt.channel === "stderr") process.stderr.write(evt.text);
        else process.stdout.write(evt.text);
      } else if (evt.type === "phase") {
        console.log(evt.message);
      } else if (evt.type === "done") {
        if (evt.success) imageRef = evt.message;
        else throw new Error(evt.error || "Build failed");
      }
    });
    return imageRef;
  },
};
