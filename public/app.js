const statusBox = document.getElementById("status");
const newRepoInput = document.getElementById("newRepo");
const repositoryInput = document.getElementById("repository");
const addNewBtn = document.getElementById("addNewRepoBtn");
const branchInput = document.getElementById("branch");
const registryInput = document.getElementById("registry");
const SESSION_ID_KEY = "acr_builder_session_id";
const LOG_CACHE_PREFIX = "acr_builder_logs_";
const MAX_LOCAL_LOGS = 1200;

let branchNames = [];
let registryNames = [];
let repositoryNames = [];
/** Avoids reloading repos when registry field blurs without changing selection. */
let previousRegistry = "";
let logEntries = [];

function ensureSessionId() {
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = `sid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

const sessionId = ensureSessionId();
const logCacheKey = `${LOG_CACHE_PREFIX}${sessionId}`;

function persistLogs() {
  localStorage.setItem(logCacheKey, JSON.stringify(logEntries.slice(-MAX_LOCAL_LOGS)));
}

async function pushUiLogToBackend(message, level) {
  try {
    await fetch("/api/build/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({
        event: { message, level: level || "" },
      }),
    });
  } catch (_) {
    // Best-effort only.
  }
}

function log(msg, type = "", source = "ui") {
  const entry = {
    msg: String(msg),
    type: type || "",
    ts: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
  logEntries.push(entry);
  if (logEntries.length > MAX_LOCAL_LOGS) {
    logEntries = logEntries.slice(-MAX_LOCAL_LOGS);
  }
  persistLogs();
  renderLogLine(entry);
  if (source === "ui") {
    pushUiLogToBackend(entry.msg, entry.type);
  }
}

function renderLogLine(entry) {
  const line = document.createElement("div");
  let resolvedType = entry.type || "";
  if (/(^|\s)WARNING:/i.test(String(entry.msg))) {
    resolvedType = "warn";
  }
  line.className = "line" + (resolvedType ? ` ${resolvedType}` : "");
  line.textContent = `[${entry.ts}] ${entry.msg}`;
  statusBox.appendChild(line);
  statusBox.scrollTop = statusBox.scrollHeight;
}

async function clearLog() {
  logEntries = [];
  persistLogs();
  statusBox.innerHTML = "";
  try {
    await fetch("/api/build/logs", {
      method: "DELETE",
      headers: { "x-session-id": sessionId },
    });
  } catch (_) {
    // Best-effort backend clear for this session.
  }
}

document.getElementById("clearLogBtn")?.addEventListener("click", () => {
  clearLog();
});

function hydrateLogsFromLocal() {
  try {
    const raw = localStorage.getItem(logCacheKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    logEntries = parsed.slice(-MAX_LOCAL_LOGS);
    statusBox.innerHTML = "";
    for (const entry of logEntries) {
      if (!entry || typeof entry.msg !== "string") continue;
      renderLogLine({
        msg: entry.msg,
        type: typeof entry.type === "string" ? entry.type : "",
        ts: typeof entry.ts === "string" ? entry.ts : "",
      });
    }
  } catch (_) {
    // Ignore corrupted local cache.
  }
}

function appendBuildStream(chunk, isErr) {
  const parts = chunk.split(/\r?\n/);
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (line.length === 0 && i < parts.length - 1) continue;
    if (line.length === 0 && i === parts.length - 1) continue;
    log(line, isErr ? "err" : "", "buildstream");
  }
}

function replayBackendEvents(events) {
  statusBox.innerHTML = "";
  logEntries = [];
  for (const evt of events || []) {
    if (!evt || typeof evt !== "object") continue;
    if (evt.type === "ui" && typeof evt.message === "string") {
      log(evt.message, evt.level || "", "backend");
    } else if (evt.type === "phase" && evt.message) {
      log(evt.message, "dim", "backend");
    } else if (evt.type === "log" && typeof evt.text === "string") {
      appendBuildStream(evt.text, evt.channel === "stderr");
    } else if (evt.type === "done") {
      if (evt.success) {
        log(`Done: ${evt.message}`, "ok", "backend");
        renderBuildOutput(evt.output, "backend");
      } else {
        log(evt.error || "Build failed", "err", "backend");
      }
    }
  }
}

function renderBuildOutput(output, source = "buildstream") {
  if (!output || typeof output !== "object") return;
  log("----------------------", "dim", source);
  log("OUTPUT", "ok", source);
  log("----------------------", "dim", source);
  log(`Image URL: ${output.imageUrl || "N/A"}`, "ok", source);
  log(`Time Took to Build: ${output.timeTookToBuild || "N/A"}`, "ok", source);
  log(`Docker Image Size: ${output.dockerImageSize || "N/A"}`, "ok", source);
}

async function syncLogsFromBackend() {
  try {
    const res = await fetch("/api/build/logs", {
      headers: { "x-session-id": sessionId },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.events)) {
      replayBackendEvents(data.events);
    }
  } catch (_) {
    // Keep local cache if backend sync fails.
  }
}

function setLoading(btn, loading, labelIdle, labelBusy) {
  if (!btn) return;
  btn.disabled = loading;
  const span = btn.querySelector(".btn-label");
  if (span) span.textContent = loading ? labelBusy : labelIdle;
}

/** Show only names that match query; sort A→Z (case-insensitive). */
function filterAndSort(items, query) {
  const q = (query || "").trim().toLowerCase();
  const base = Array.isArray(items) ? [...items] : [];
  const filtered = !q ? base : base.filter((x) => String(x).toLowerCase().includes(q));
  return filtered.sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
  );
}

function wireSearchableCombo(input, listEl, getItems, opts = {}) {
  const { onCommit } = opts;
  let activeIndex = -1;
  let itemsInView = [];

  function renderList() {
    itemsInView = filterAndSort(getItems(), input.value);
    listEl.innerHTML = "";
    activeIndex = -1;

    if (itemsInView.length === 0) {
      const li = document.createElement("li");
      li.className = "combo-empty";
      li.textContent = "No matching names";
      listEl.appendChild(li);
      return;
    }

    itemsInView.forEach((text, i) => {
      const li = document.createElement("li");
      li.className = "combo-item";
      li.setAttribute("role", "option");
      li.textContent = text;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectIndex(i);
      });
      listEl.appendChild(li);
    });
  }

  function highlightActive() {
    [...listEl.querySelectorAll(".combo-item")].forEach((el, idx) => {
      el.classList.toggle("is-active", idx === activeIndex);
      el.setAttribute("aria-selected", idx === activeIndex ? "true" : "false");
    });
  }

  function selectIndex(i) {
    const text = itemsInView[i];
    if (text == null) return;
    input.value = text;
    listEl.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    onCommit?.(text);
  }

  function open() {
    if (input.disabled) return;
    renderList();
    listEl.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    listEl.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    [...listEl.querySelectorAll(".combo-item")].forEach((el) => {
      el.classList.remove("is-active");
      el.setAttribute("aria-selected", "false");
    });
  }

  function commitFromInput() {
    if (input.disabled) return;
    const q = input.value.trim();
    const all = getItems();
    if (!q) return;
    const exact = all.find((x) => String(x).toLowerCase() === q.toLowerCase());
    if (exact) {
      if (input.value !== exact) input.value = exact;
      onCommit?.(exact);
      return;
    }
    const filtered = filterAndSort(all, q);
    if (filtered.length === 1) {
      input.value = filtered[0];
      onCommit?.(filtered[0]);
    }
  }

  input.addEventListener("input", () => {
    if (!input.disabled) open();
  });

  input.addEventListener("focus", () => {
    if (!input.disabled) open();
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      commitFromInput();
      close();
    }, 160);
  });

  input.addEventListener("keydown", (e) => {
    if (input.disabled) return;

    if (listEl.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      open();
      e.preventDefault();
      if (itemsInView.length > 0) {
        activeIndex = e.key === "ArrowDown" ? 0 : itemsInView.length - 1;
        highlightActive();
      }
      return;
    }

    if (listEl.hidden) return;

    if (e.key === "Escape") {
      close();
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (activeIndex < 0) activeIndex = 0;
      else activeIndex = Math.min(activeIndex + 1, itemsInView.length - 1);
      highlightActive();
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activeIndex < 0) activeIndex = itemsInView.length - 1;
      else activeIndex = Math.max(activeIndex - 1, 0);
      highlightActive();
    }

    if (e.key === "Enter" && activeIndex >= 0 && itemsInView[activeIndex]) {
      e.preventDefault();
      selectIndex(activeIndex);
    }
  });

  return { open, close, refresh: open };
}

function toggleNewRepo() {
  const hidden = newRepoInput.classList.contains("hidden");
  if (hidden) {
    newRepoInput.classList.remove("hidden");
    repositoryInput.disabled = true;
    addNewBtn.classList.add("is-active");
  } else {
    newRepoInput.classList.add("hidden");
    newRepoInput.value = "";
    repositoryInput.disabled = false;
    addNewBtn.classList.remove("is-active");
  }
}

window.toggleNewRepo = toggleNewRepo;

function clearForm() {
  document.getElementById("repoUrl").value = "";
  branchInput.value = "";
  registryInput.value = "";
  repositoryInput.value = "";
  newRepoInput.value = "";
  document.getElementById("tag").value = "";

  newRepoInput.classList.add("hidden");
  repositoryInput.disabled = false;
  addNewBtn.classList.remove("is-active");
  previousRegistry = "";

  log("Form cleared.", "dim");
}

window.clearForm = clearForm;

async function loadBranches() {
  const btn = document.getElementById("fetchBranchesBtn");
  const repoUrl = document.getElementById("repoUrl").value.trim();
  if (!repoUrl) {
    log("Enter a Bitbucket repository URL first.", "err");
    return;
  }

  setLoading(btn, true, "Fetch branches", "Fetching…");

  try {
    log("Fetching branches…", "dim");
    const res = await fetch("/api/git/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    branchNames = data.branches || [];
    // Keep empty so user starts typing and selects explicitly.
    branchInput.value = "";

    log(`Loaded ${branchNames.length} branch(es). Type to filter the list.`, "ok");
  } catch (e) {
    log(String(e.message || e), "err");
  } finally {
    setLoading(btn, false, "Fetch branches", "Fetching…");
  }
}

window.loadBranches = loadBranches;

async function loadRegistries() {
  try {
    log("Loading Azure registries…", "dim");
    const res = await fetch("/api/azure/registries");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    registryNames = data.registries || [];
    // Keep empty so user starts typing and selects explicitly.
    registryInput.value = "";
    previousRegistry = registryInput.value.trim();

    log(`Connected — ${registryNames.length} registry(ies) available.`, "ok");
  } catch (e) {
    log(String(e.message || e), "err");
  }
}

async function loadRepositories() {
  const registryName = registryInput.value.trim();
  if (!registryName) return;

  log(`Loading repositories for ${registryName}…`, "dim");

  try {
    const res = await fetch("/api/azure/repositories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registryName }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    repositoryInput.disabled = false;
    newRepoInput.classList.add("hidden");
    newRepoInput.value = "";
    addNewBtn.classList.remove("is-active");

    repositoryNames = data.repositories || [];
    repositoryInput.value = "";

    log(`Repositories loaded (${repositoryNames.length}). Type to filter.`, "ok");
  } catch (e) {
    log(String(e.message || e), "err");
  }
}

window.loadRepositories = loadRepositories;

async function startBuild() {
  const btn = document.getElementById("buildBtn");
  let repoName = "";
  if (!newRepoInput.classList.contains("hidden")) {
    repoName = newRepoInput.value.trim();
  } else {
    repoName = repositoryInput.value.trim();
  }

  const body = {
    repoUrl: document.getElementById("repoUrl").value.trim(),
    branch: branchInput.value.trim(),
    registryName: registryInput.value.trim(),
    repository: repoName,
    tag: document.getElementById("tag").value.trim(),
  };

  if (!body.repoUrl) {
    log("Repository URL is required.", "err");
    return;
  }
  if (!body.branch || !branchNames.some((b) => b === body.branch)) {
    log("Choose a branch from the filtered list (fetch branches first).", "err");
    return;
  }
  if (!body.registryName || !registryNames.some((r) => r === body.registryName)) {
    log("Choose a registry from the list.", "err");
    return;
  }
  if (!body.repository) {
    log("Select or enter a repository name.", "err");
    return;
  }
  if (!newRepoInput.classList.contains("hidden")) {
    /* new repo name: free text */
  } else if (!repositoryNames.includes(body.repository)) {
    log("Pick a repository from the filtered list, or use New to type a new name.", "err");
    return;
  }
  if (!body.tag) {
    log("Enter an image tag.", "err");
    return;
  }

  setLoading(btn, true, "Build & push to ACR", "Building…");

  try {
    log("Starting ACR cloud build — streaming logs below…", "dim", "ui");
    const res = await fetch("/api/build/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify(body),
    });

    if (res.status === 400) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || "Invalid request");
    }

    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;

        let evt;
        try {
          evt = JSON.parse(line);
        } catch {
          log(line, "dim");
          continue;
        }

        if (evt.type === "phase") {
          log(evt.message, "dim", "buildstream");
        } else if (evt.type === "log") {
          appendBuildStream(evt.text, evt.channel === "stderr");
        } else if (evt.type === "done") {
          if (evt.success) {
            log(`Done: ${evt.message}`, "ok", "buildstream");
            renderBuildOutput(evt.output, "buildstream");
          } else {
            log(evt.error || "Build failed", "err", "buildstream");
          }
        }
      }
    }

    const tail = buffer.trim();
    if (tail) {
      try {
        const evt = JSON.parse(tail);
        if (evt.type === "done") {
          if (evt.success) {
            log(`Done: ${evt.message}`, "ok", "buildstream");
            renderBuildOutput(evt.output, "buildstream");
          } else {
            log(evt.error || "Build failed", "err", "buildstream");
          }
        }
      } catch {
        log(tail, "dim");
      }
    }
  } catch (e) {
    log(String(e.message || e), "err");
  } finally {
    setLoading(btn, false, "Build & push to ACR", "Building…");
  }
}

window.startBuild = startBuild;

wireSearchableCombo(branchInput, document.getElementById("branch-list"), () => branchNames, {});
wireSearchableCombo(registryInput, document.getElementById("registry-list"), () => registryNames, {
  onCommit: (text) => {
    if (!text || text === previousRegistry) return;
    previousRegistry = text;
    loadRepositories();
  },
});
wireSearchableCombo(repositoryInput, document.getElementById("repository-list"), () => repositoryNames, {});

hydrateLogsFromLocal();
syncLogsFromBackend();
loadRegistries();
