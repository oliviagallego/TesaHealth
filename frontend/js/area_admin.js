document.addEventListener("DOMContentLoaded", () => {
  const toast = document.getElementById("toast");
  function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  const token = localStorage.getItem("token");
  const urlParams = new URLSearchParams(window.location.search);

  if (!token) {
    const qp = new URLSearchParams();
    qp.set("role", "ADMIN");
    qp.set("next", "/pages/area_admin.html" + (window.location.search || ""));
    window.location.href = "/pages/login.html?" + qp.toString();
    return;
  }

  function authHeaders() {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  if (window.Chart && window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
  }

  const socket = io({ auth: { token } });
  socket.on("verifications:update", async () => {
    allVerifs = await loadVerifications();
    const dash = await loadDashboard();
    renderCharts(dash);
    renderDashboard();
    renderVerifications();
    showToast("New verification request", "success");
  });
  socket.on("dashboard:update", async () => {
    allCases = await loadAdminCases();
    const dash = await loadDashboard();
    renderCharts(dash);
    renderDashboard();
    renderCases(applyCaseFilters());
  });

  socket.on("case:update", async ({ caseId }) => {
    allCases = await loadAdminCases();
    renderDashboard();
    renderCases(applyCaseFilters());
  });


  async function apiGet(url) {
    const res = await fetch(url, { headers: authHeaders() });

    const ct = res.headers.get("content-type") || "";
    let data = {};
    if (ct.includes("application/json")) {
      data = await res.json().catch(() => ({}));
    } else {
      const text = await res.text().catch(() => "");
      data = { error: text || `Request failed: ${res.status}` };
    }

    if (!res.ok) {
      const err = new Error(data?.error || `Request failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }


  async function apiPost(url, body) {
    const res = await fetch(url, { method: "POST", headers: authHeaders(), body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
    return data;
  }

  async function apiPut(url, body) {
    const res = await fetch(url, { method: "PUT", headers: authHeaders(), body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
    return data;
  }

  async function apiPatch(url, body) {
    const res = await fetch(url, { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
    return data;
  }

  function escapeHtml(str = "") {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  document.getElementById("btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    showToast("Logged out", "success");
    setTimeout(() => (window.location.href = "/pages/login.html?role=ADMIN"), 300);
  });

  document.getElementById("btnReportIssue")?.addEventListener("click", () => {
    window.location.href = "mailto:tesahealth.tfg@gmail.com?subject=TesaHealth%20Support";
  });

  const adminName = document.getElementById("adminName");
  const adminEmail = document.getElementById("adminEmail");
  const avatarLetter = document.getElementById("avatarLetter");

  const caseStageFilter = document.getElementById("caseStageFilter");

  const logEntity = document.getElementById("logEntity");
  const logActorUserId = document.getElementById("logActorUserId");
  const logQ = document.getElementById("logQ");
  const logFrom = document.getElementById("logFrom");
  const logTo = document.getElementById("logTo");
  const btnLoadLogs = document.getElementById("btnLoadLogs");
  const btnLogsPrev = document.getElementById("btnLogsPrev");
  const btnLogsNext = document.getElementById("btnLogsNext");
  const logsList = document.getElementById("logsList");
  const logDetail = document.getElementById("logDetail");

  const userSearchQ = document.getElementById("userSearchQ");
  const btnUserSearch = document.getElementById("btnUserSearch");
  const usersList = document.getElementById("usersList");
  const userDetail = document.getElementById("userDetail");

  const profileSection = document.getElementById("sectionProfile");

  const adminProfileForm = profileSection?.querySelector("#adminProfileForm");
  const apName = profileSection?.querySelector("#apName");
  const apSurname = profileSection?.querySelector("#apSurname");
  const apEmail = profileSection?.querySelector("#apEmail");
  const apAddress = profileSection?.querySelector("#apAddress");
  const apDob = profileSection?.querySelector("#apDob");
  const apPhone = profileSection?.querySelector("#apPhone");
  const btnSaveAdminProfile = profileSection?.querySelector("#btnSaveAdminProfile");

  const btnApSendCode = document.getElementById("btnApSendCode");
  const btnApChangePassword = document.getElementById("btnApChangePassword");
  const apCode = document.getElementById("apCode");
  const apCurrentPassword = document.getElementById("apCurrentPassword");
  const apNewPassword = document.getElementById("apNewPassword");
  const apNewPassword2 = document.getElementById("apNewPassword2");
  const apPwStep1 = document.getElementById("apPwStep1");
  const apPwStep2 = document.getElementById("apPwStep2");
  const btnApBackPw = document.getElementById("btnApBackPw");

  const sectionBtns = Array.from(document.querySelectorAll("[data-section]"));
  const sections = {
    dashboard: document.getElementById("sectionDashboard"),
    verifications: document.getElementById("sectionVerifications"),
    cases: document.getElementById("sectionCases"),
    logs: document.getElementById("sectionLogs"),
    users: document.getElementById("sectionUsers"),
    profile: document.getElementById("sectionProfile"),
  };

  function setSection(key) {
    for (const k of Object.keys(sections)) sections[k]?.classList.add("is-hidden");
    sections[key]?.classList.remove("is-hidden");

    sectionBtns.forEach((b) =>
      b.classList.toggle("active", b.getAttribute("data-section") === key)
    );

    if (key === "profile") {
      ensureAdminProfileFilled().catch(e => showToast(e.message || "Could not load profile", "error"));
    }
  }


  const badgePending = document.getElementById("badgePending");

  const statPending = document.getElementById("statPending");
  const statCases = document.getElementById("statCases");
  const statClosed = document.getElementById("statClosed");
  const statOpen = document.getElementById("statOpen");

  const verifEmpty = document.getElementById("verifEmpty");
  const verifList = document.getElementById("verifList");
  const verifDetail = document.getElementById("verifDetail");

  const casesEmpty = document.getElementById("casesEmpty");
  const casesList = document.getElementById("casesList");
  const caseDetail = document.getElementById("caseDetail");
  const sortCases = document.getElementById("sortCases");
  const btnRefresh = document.getElementById("btnRefresh");

  caseStageFilter?.addEventListener("change", () => renderCases(applyCaseFilters()));
  sortCases?.addEventListener("change", () => renderCases(applyCaseFilters()));

  const btnSendCode = document.getElementById("btnSendCode");
  const btnChangePassword = document.getElementById("btnChangePassword");
  const inputCode = document.getElementById("code");
  const inputCurrent = document.getElementById("currentPassword");
  const inputNew = document.getElementById("newPassword");
  const inputNew2 = document.getElementById("newPassword2");

  const caseIdSearch = document.getElementById("caseIdSearch");
  const patientIdSearch = document.getElementById("patientIdSearch");
  const patientNameSearch = document.getElementById("patientNameSearch");
  const btnSearchCases = document.getElementById("btnSearchCases");


  let allVerifs = { clinicians: [], admins: [] };
  let allCases = [];

  async function loadAdminProfile() {
    return apiGet("/api/admin/profile");
  }
  async function ensureAdminProfileFilled() {
    try {
      const data = await loadAdminProfile();
      fillAdminProfileFromData(data);

      const name = data?.user?.name || "Admin";
      const surname = data?.user?.surname || "";
      const email = data?.user?.email || "—";
      adminName.textContent = `${name}${surname ? " " + surname : ""}`;
      adminEmail.textContent = email;
      avatarLetter.textContent = String(name).trim().charAt(0).toUpperCase() || "A";
    } catch (e) {
      showToast(e.message || "Could not load profile", "error");
    }
  }

  async function loadVerifications() {
    const data = await apiGet("/api/admin/verifications");
    const clinicians = Array.isArray(data?.clinicians) ? data.clinicians : [];
    const admins = Array.isArray(data?.admins) ? data.admins : [];
    return { clinicians, admins };
  }

  async function loadAdminCases() {
    const data = await apiGet("/api/admin/cases");
    return Array.isArray(data) ? data : [];
  }
  async function searchCasesAdvanced() {
    const params = new URLSearchParams();
    const vCase = String(caseIdSearch?.value || "").trim();
    const vPat = String(patientIdSearch?.value || "").trim();
    const vName = String(patientNameSearch?.value || "").trim();

    if (vCase) params.set("caseId", vCase);
    else if (vPat) params.set("patientId", vPat);
    else if (vName) params.set("q", vName);

    const filled = [vCase, vPat, vName].filter(Boolean).length;
    if (filled > 1) {
      showToast("Please fill only ONE search field", "warning");
      return;
    }

    const data = await apiGet(`/api/admin/cases/search?${params.toString()}`);
    allCases = Array.isArray(data?.cases) ? data.cases : [];
    renderCases(applyCaseFilters());
  }

  btnSearchCases?.addEventListener("click", async () => {
    try {
      await searchCasesAdvanced();
      showToast("Search complete", "success");
    } catch (e) {
      showToast(e.message || "Search failed", "error");
    }
  });

  [caseIdSearch, patientIdSearch, patientNameSearch].forEach((inp) => {
    inp?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        btnSearchCases?.click();
      }
    });
  });


  function isOpenCaseStatus(s) {
    const x = String(s || "").toLowerCase();
    return ["draft", "submitted", "ai_ready", "in_review", "open"].includes(x);
  }

  function isClosedCaseStatus(status) {
    const s = String(status || "").toLowerCase();
    return s === "closed" || s === "consensus_ready";
  }


  function renderDashboard() {
    const pending = (allVerifs.clinicians?.length || 0) + (allVerifs.admins?.length || 0);
    if (badgePending) badgePending.textContent = String(pending);
    if (statPending) statPending.textContent = String(pending);

    const totalCases = allCases.length;
    const closed = allCases.filter((c) => isClosedCaseStatus(c?.status)).length;
    const open = totalCases - closed;

    if (statCases) statCases.textContent = String(totalCases);
    if (statClosed) statClosed.textContent = String(closed);
    if (statOpen) statOpen.textContent = String(open);
  }

  const statClinicians = document.getElementById("statClinicians");
  const statPatients = document.getElementById("statPatients");
  const statAdmins = document.getElementById("statAdmins");

  let chartCases = null;
  let chartVerifs = null;

  async function loadDashboard() {
    return apiGet("/api/admin/dashboard");
  }

  let logsState = { limit: 50, offset: 0, total: 0, items: [] };

  async function loadAuditLogs() {
    const params = new URLSearchParams();
    const ent = String(logEntity?.value || "").trim();
    const q = String(logQ?.value || "").trim();
    const actor = String(logActorUserId?.value || "").trim();
    const from = String(logFrom?.value || "").trim();
    const to = String(logTo?.value || "").trim();

    if (ent) params.set("entity", ent);
    if (q) params.set("q", q);
    if (actor) params.set("actorUserId", actor);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    params.set("limit", String(logsState.limit));
    params.set("offset", String(logsState.offset));

    return apiGet(`/api/admin/logs?${params.toString()}`);
  }

  function renderAuditLogs() {
    if (!logsList) return;
    logsList.innerHTML = "";

    const items = logsState.items || [];
    if (!items.length) {
      logsList.innerHTML = `<div class="muted">No logs found.</div>`;
      return;
    }

    for (const l of items) {
      const t = l?.timestamp ? new Date(l.timestamp).toLocaleString() : "—";
      const el = document.createElement("div");
      el.className = "row-card";
      el.innerHTML = `
      <div class="row-main">
        <div class="row-top">
          <span class="badge">${escapeHtml(l?.entity || "—")}</span>
          <span class="row-id">Actor #${escapeHtml(l?.userId ?? "—")}</span>
        </div>
        <div class="row-sub">
          <strong>${escapeHtml(t)}</strong> • ${escapeHtml(l?.action || "—")}
        </div>
      </div>
      <div class="row-cta">View →</div>
    `;
      el.addEventListener("click", () => {
        if (!logDetail) return;
        logDetail.innerHTML = `
        <div class="kv"><div class="k">Timestamp</div><div class="v">${escapeHtml(t)}</div></div>
        <div class="kv"><div class="k">Entity</div><div class="v">${escapeHtml(l?.entity || "—")}</div></div>
        <div class="kv"><div class="k">Actor userId</div><div class="v">${escapeHtml(String(l?.userId ?? "—"))}</div></div>
        <div class="subpanel" style="margin-top:10px;">
          <div class="subpanel-title">Action</div>
          <div class="detail">${escapeHtml(l?.action || "—")}</div>
        </div>
      `;
      });
      logsList.appendChild(el);
    }
  }

  async function refreshLogs(resetOffset = false) {
    try {
      if (resetOffset) logsState.offset = 0;
      const data = await loadAuditLogs();
      logsState.total = data?.total ?? 0;
      logsState.items = Array.isArray(data?.logs) ? data.logs : [];
      renderAuditLogs();

      if (btnLogsPrev) btnLogsPrev.disabled = logsState.offset <= 0;
      if (btnLogsNext) btnLogsNext.disabled = (logsState.offset + logsState.limit) >= logsState.total;

      showToast("Logs loaded", "success");
    } catch (e) {
      showToast(e.message || "Failed to load logs", "error");
    }
  }

  btnLoadLogs?.addEventListener("click", () => refreshLogs(true));
  btnLogsPrev?.addEventListener("click", () => { logsState.offset = Math.max(0, logsState.offset - logsState.limit); refreshLogs(false); });
  btnLogsNext?.addEventListener("click", () => { logsState.offset = logsState.offset + logsState.limit; refreshLogs(false); });

  async function searchUsers() {
    const q = String(userSearchQ?.value || "").trim();
    if (!q) return { users: [] };
    return apiGet(`/api/admin/users/search?q=${encodeURIComponent(q)}`);
  }

  function renderUsersList(list) {
    if (!usersList) return;
    usersList.innerHTML = "";

    const items = Array.isArray(list) ? list : [];
    if (!items.length) {
      usersList.innerHTML = `<div class="muted">No users found.</div>`;
      return;
    }

    for (const u of items) {
      const el = document.createElement("div");
      el.className = "row-card";
      el.innerHTML = `
      <div class="row-main">
        <div class="row-top">
          <span class="badge">${escapeHtml(u?.last_profile || "—")}</span>
          <span class="row-id">User #${escapeHtml(u?.id)}</span>
        </div>
        <div class="row-sub">
          <strong>${escapeHtml(`${u?.name || ""} ${u?.surname || ""}`.trim() || "—")}</strong>
          • ${escapeHtml(u?.email || "—")}
          • <span class="badge">${escapeHtml(u?.status || "—")}</span>
        </div>
      </div>
      <div class="row-cta">View →</div>
    `;
      el.addEventListener("click", () => openUserDetail(u.id));
      usersList.appendChild(el);
    }
  }

  async function openUserDetail(userId) {
    if (!userDetail) return;
    userDetail.innerHTML = `<div class="muted">Loading…</div>`;

    try {
      const data = await apiGet(`/api/admin/users/${encodeURIComponent(userId)}`);
      const u = data?.user || {};
      const logs = Array.isArray(data?.logs) ? data.logs : [];

      const created = u?.created_at ? new Date(u.created_at).toLocaleString() : "—";
      const isBlocked = String(u?.status || "").toLowerCase() !== "valid";

      userDetail.innerHTML = `
      <div class="kv"><div class="k">User ID</div><div class="v">${escapeHtml(u?.id)}</div></div>
      <div class="kv"><div class="k">Email</div><div class="v">${escapeHtml(u?.email || "—")}</div></div>
      <div class="kv"><div class="k">Name</div><div class="v">${escapeHtml(`${u?.name || ""} ${u?.surname || ""}`.trim() || "—")}</div></div>
      <div class="kv"><div class="k">Role</div><div class="v">${escapeHtml(u?.last_profile || "—")}</div></div>
      <div class="kv"><div class="k">Status</div><div class="v"><span class="badge">${escapeHtml(u?.status || "—")}</span></div></div>
      <div class="kv"><div class="k">Created</div><div class="v">${escapeHtml(created)}</div></div>

      <div class="actions" style="margin-top:12px;">
        <button id="btnToggleBlock" class="btn ${isBlocked ? "btn-primary" : "btn-danger"}" type="button">
          ${isBlocked ? "Unblock account" : "Block account"}
        </button>
      </div>

      <div class="subpanel" style="margin-top:14px;">
        <div class="subpanel-title">Recent logs (by this userId)</div>
        ${logs.length ? `
          <div class="rows">
            ${logs.map(l => {
        const t = l?.timestamp ? new Date(l.timestamp).toLocaleString() : "—";
        return `
                <div class="row-card">
                  <div class="row-main">
                    <div class="row-top">
                      <span class="badge">${escapeHtml(l?.entity || "—")}</span>
                      <span class="row-id">${escapeHtml(t)}</span>
                    </div>
                    <div class="row-sub">${escapeHtml(l?.action || "—")}</div>
                  </div>
                </div>
              `;
      }).join("")}
          </div>
        ` : `<div class="muted">No logs.</div>`}
      </div>
    `;

      document.getElementById("btnToggleBlock")?.addEventListener("click", async () => {
        try {
          const confirmMsg = isBlocked
            ? "Unblock this account?"
            : "Block this account? The user will not be able to login.";
          if (!window.confirm(confirmMsg)) return;

          await apiPatch(`/api/admin/users/${encodeURIComponent(u.id)}/block`, { blocked: !isBlocked });
          showToast("User status updated", "success");

          const out = await searchUsers();
          renderUsersList(out?.users || []);
          openUserDetail(u.id);
        } catch (e) {
          showToast(e.message || "Failed to update user", "error");
        }
      });

    } catch (e) {
      userDetail.innerHTML = `<div class="muted">${escapeHtml(e.message || "Failed")}</div>`;
      showToast(e.message || "Failed to load user", "error");
    }
  }

  btnUserSearch?.addEventListener("click", async () => {
    try {
      const out = await searchUsers();
      renderUsersList(out?.users || []);
      showToast("Search complete", "success");
    } catch (e) {
      showToast(e.message || "Search failed", "error");
    }
  });

  function renderCharts(info) {
    const open = info?.cases?.open ?? 0;
    const closed = info?.cases?.closed ?? 0;

    const pendingVerifs =
      (info?.users?.clinicians?.pending ?? 0) + (info?.users?.admins?.pending ?? 0);
    const verifiedVerifs =
      (info?.users?.clinicians?.verified ?? 0) + (info?.users?.admins?.verified ?? 0);

    function doughnutOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
                const val = Number(ctx.raw || 0);
                const pct = Math.round((val / total) * 100);
                return `${ctx.label}: ${val} (${pct}%)`;
              },
            },
          },
          datalabels: {
            formatter: (value, ctx) => {
              const data = ctx.chart.data.datasets[0].data || [];
              const total = data.reduce((a, b) => a + b, 0) || 1;
              const v = Number(value || 0);
              if (!v) return "";
              const pct = Math.round((v / total) * 100);
              return `${pct}%`;
            },
            color: "#fff",
            font: { weight: "800", size: 14 },
          },
        },
      };
    }

    const ctxCases = document.getElementById("chartCases")?.getContext("2d");
    if (ctxCases) {
      if (!chartCases) {
        chartCases = new Chart(ctxCases, {
          type: "doughnut",
          data: {
            labels: ["Open", "Closed"],
            datasets: [
              {
                data: [open, closed],
              },
            ],
          },
          options: doughnutOptions(),
        });
      } else {
        chartCases.data.datasets[0].data = [open, closed];
        chartCases.update();
      }
    }

    const ctxVerifs = document.getElementById("chartVerifs")?.getContext("2d");
    if (ctxVerifs) {
      if (!chartVerifs) {
        chartVerifs = new Chart(ctxVerifs, {
          type: "doughnut",
          data: {
            labels: ["Pending", "Verified"],
            datasets: [
              {
                data: [pendingVerifs, verifiedVerifs],
              },
            ],
          },
          options: doughnutOptions(),
        });
      } else {
        chartVerifs.data.datasets[0].data = [pendingVerifs, verifiedVerifs];
        chartVerifs.update();
      }
    }
  }


  function normalizeVerifItem(item, role) {
    const u = item?.user || item?.User || item?.user_data;
    const userId = item?.userId ?? u?.id;
    return {
      role,
      userId: Number(userId),
      profileId: Number(item?.id),
      email: u?.email || "—",
      fullName: `${u?.name || ""} ${u?.surname || ""}`.trim() || "—",
      raw: item,
    };
  }

  function renderVerifications() {
    verifList.innerHTML = "";

    const items = [
      ...(allVerifs.clinicians || []).map((x) => normalizeVerifItem(x, "CLINICIAN")),
      ...(allVerifs.admins || []).map((x) => normalizeVerifItem(x, "ADMIN")),
    ].filter((x) => Number.isFinite(x.userId));

    if (!items.length) {
      verifEmpty.classList.remove("is-hidden");
      return;
    }
    verifEmpty.classList.add("is-hidden");

    for (const it of items) {
      const el = document.createElement("div");
      el.className = "row-card";
      el.innerHTML = `
        <div class="row-main">
          <div class="row-top">
            <span class="badge">${escapeHtml(it.role)}</span>
            <span class="row-id">User #${escapeHtml(it.userId)}</span>
          </div>
          <div class="row-sub">
            <strong>${escapeHtml(it.fullName)}</strong> • ${escapeHtml(it.email)}
          </div>
        </div>
        <div class="row-cta">Review →</div>
      `;
      el.addEventListener("click", () => openReview(it));
      verifList.appendChild(el);
    }
  }

  function fixFieldsByRole(role) {
    const common = [
      ["name", "Name"],
      ["surname", "Surname"],
      ["phone", "Phone"],
      ["address", "Address"],
      ["dob", "Date of birth"],
    ];
    if (role === "CLINICIAN") {
      return [
        ...common,
        ["medical_college_reg_no", "Medical college reg no"],
        ["provincial_college", "Provincial college"],
        ["specialty", "Specialty"],
        ["mir_year", "MIR year"],
        ["liability_insurance", "Liability insurance"],
        ["documents", "Documents / evidence"],
      ];
    }
    return common;
  }


  async function openReview(it) {
    verifDetail.innerHTML = `<div class="muted">Loading review…</div>`;

    try {
      const data = await apiGet(`/api/admin/review/${encodeURIComponent(it.role)}/${encodeURIComponent(it.userId)}`);
      const u = data?.user || {};
      const p = data?.profile || {};

      let docsHtml = "";
      if (it.role === "CLINICIAN") {
        try {
          const docs = await apiGet(`/api/admin/clinicians/${encodeURIComponent(p.id)}/documents`);
          const list = Array.isArray(docs) ? docs : [];
          docsHtml = `
          <div class="subpanel">
            <div class="subpanel-title">Documents</div>
            ${list.length ? `
              <div class="doc-list">
                ${list.map(d => {
            const created = d?.created_at ? new Date(d.created_at).toLocaleString() : "—";
            const fileUrl =
              d?.url ||
              `/api/admin/clinicians/${encodeURIComponent(String(p.id))}/documents/${encodeURIComponent(String(d.id))}/file`;

            return `
                    <div class="doc">
                      <div><strong>${escapeHtml(d?.original_name || d?.filename || "document")}</strong></div>
                      <div class="muted">Status: ${escapeHtml(d?.status || "—")} • ${escapeHtml(created)}</div>
                      <div style="margin-top:6px;">
                        <a class="doc-link" href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">Open</a>
                      </div>
                    </div>
                  `;
          }).join("")}

              </div>
            ` : `<div class="muted">No documents found.</div>`}
          </div>
        `;
        } catch {
          docsHtml = `<div class="muted">Documents: unavailable.</div>`;
        }
      }

      const fixFields = fixFieldsByRole(it.role);
      const fixPanelHtml = `
      <div id="fixPanel" class="subpanel is-hidden" style="margin-top:12px;">
        <div class="subpanel-title">Select fields to correct</div>

        <details class="fix-dropdown">
          <summary class="fix-summary">Choose one or more fields</summary>
          <div class="fix-options">
            ${fixFields.map(([key, label]) => `
              <label class="fix-opt">
                <input type="checkbox" name="fixField" value="${escapeHtml(key)}" />
                <span>${escapeHtml(label)}</span>
              </label>
            `).join("")}
          </div>
        </details>

        <label class="field" style="display:block; margin-top:10px;">
          <span class="field-label">Admin note (optional)</span>
          <textarea id="reviewNote" class="input" rows="3" placeholder="Explain what to correct…"></textarea>
        </label>

        <div class="actions" style="margin-top:12px;">
          <button id="btnSendFix" class="btn btn-primary" type="button">Send</button>
          <button id="btnCancelFix" class="btn btn-ghost" type="button">Cancel</button>
        </div>
      </div>
    `;

      const createdAt = u?.created_at ? new Date(u.created_at).toLocaleString() : "—";
      const status = p?.verification_status || "pending";

      verifDetail.innerHTML = `
      <div class="kv"><div class="k">Role</div><div class="v">${escapeHtml(it.role)}</div></div>
      <div class="kv"><div class="k">User ID</div><div class="v">${escapeHtml(u?.id ?? it.userId)}</div></div>
      <div class="kv"><div class="k">Name</div><div class="v">${escapeHtml(`${u?.name || ""} ${u?.surname || ""}`.trim() || "—")}</div></div>
      <div class="kv"><div class="k">Email</div><div class="v">${escapeHtml(u?.email || "—")}</div></div>
      <div class="kv"><div class="k">Phone</div><div class="v">${escapeHtml(u?.phone || "—")}</div></div>
      <div class="kv"><div class="k">Created</div><div class="v">${escapeHtml(createdAt)}</div></div>
      <div class="kv"><div class="k">Current status</div><div class="v"><span class="badge">${escapeHtml(status)}</span></div></div>

      ${it.role === "CLINICIAN" ? `
        <div class="subpanel">
          <div class="subpanel-title">Clinician details</div>
          <div class="grid2">
            <div><strong>College reg no:</strong> ${escapeHtml(p?.medical_college_reg_no || "—")}</div>
            <div><strong>College:</strong> ${escapeHtml(p?.provincial_college || "—")}</div>
            <div><strong>Specialty:</strong> ${escapeHtml(p?.specialty || "—")}</div>
            <div><strong>MIR year:</strong> ${escapeHtml(p?.mir_year || "—")}</div>
            <div><strong>Insurance:</strong> ${escapeHtml(p?.liability_insurance || "—")}</div>
          </div>
        </div>
      ` : ""}

      ${docsHtml}
      ${fixPanelHtml}

      <div class="actions">
        <button class="btn btn-primary" data-decision="approve" type="button">Approve</button>
        <button id="btnNeedsFix" class="btn btn-ghost" type="button">Needs fix</button>
        <button class="btn btn-danger" data-decision="deny" type="button">Deny</button>
      </div>

      <div class="muted" style="margin-top:10px;">
        Actions are logged. User will receive a notification.
      </div>
    `;

      const fixPanel = verifDetail.querySelector("#fixPanel");
      const btnNeedsFix = verifDetail.querySelector("#btnNeedsFix");
      const btnSendFix = verifDetail.querySelector("#btnSendFix");
      const btnCancelFix = verifDetail.querySelector("#btnCancelFix");

      btnNeedsFix.addEventListener("click", () => {
        fixPanel.classList.remove("is-hidden");
        fixPanel.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      btnCancelFix.addEventListener("click", () => {
        fixPanel.classList.add("is-hidden");
        verifDetail.querySelectorAll('input[name="fixField"]').forEach(cb => cb.checked = false);
        const note = verifDetail.querySelector("#reviewNote");
        if (note) note.value = "";
      });

      btnSendFix.addEventListener("click", async () => {
        try {
          const note = verifDetail.querySelector("#reviewNote")?.value?.trim() || "";
          const fields = Array.from(verifDetail.querySelectorAll('input[name="fixField"]:checked')).map(el => el.value);

          if (!fields.length) return showToast("Select at least one field to correct", "error");

          await apiPost(`/api/admin/review/${encodeURIComponent(it.role)}/${encodeURIComponent(it.userId)}`, {
            decision: "needs_fix",
            note,
            fields
          });

          showToast("Corrections request sent", "success");

          allVerifs = await loadVerifications();
          renderDashboard();
          renderVerifications();
          verifDetail.innerHTML = `<div class="muted">Select another verification.</div>`;
        } catch (e) {
          showToast(e.message || "Failed to submit", "error");
        }
      });

      verifDetail.querySelectorAll("[data-decision]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const decision = btn.getAttribute("data-decision");
          try {
            await apiPost(`/api/admin/review/${encodeURIComponent(it.role)}/${encodeURIComponent(it.userId)}`, {
              decision,
              note: "",
              fields: []
            });
            showToast(`Decision sent: ${decision}`, "success");
            allVerifs = await loadVerifications();
            renderDashboard();
            renderVerifications();
            verifDetail.innerHTML = `<div class="muted">Select another verification.</div>`;
          } catch (e) {
            showToast(e.message || "Failed to submit decision", "error");
          }
        });
      });

    } catch (e) {
      verifDetail.innerHTML = `<div class="muted">${escapeHtml(e.message || "Failed")}</div>`;
      showToast(e.message || "Failed to load review", "error");
    }
  }

  function renderCases(items) {
    casesList.innerHTML = "";

    if (!items.length) {
      casesEmpty.classList.remove("is-hidden");
      return;
    }
    casesEmpty.classList.add("is-hidden");

    for (const c of items) {
      const created = c?.created_at ? new Date(c.created_at).toLocaleString() : "—";
      const ageH = hoursBetween(c?.created_at, new Date());
      const tCloseH = isClosedCaseStatus(c?.status)
        ? hoursBetween(c?.created_at, c?.closed_at)
        : null;

      const stage = mapCaseStage(c?.status);

      const el = document.createElement("div");
      el.className = "row-card";

      el.innerHTML = `
      <div class="row-main">
        <div class="row-top">
          <span class="badge">${escapeHtml(stage)}</span>
          <span class="row-id">Case #${escapeHtml(c?.id)}</span>
        </div>
        <div class="row-sub">
          <strong>Created:</strong> ${escapeHtml(created)}
          • <strong>Age:</strong> ${escapeHtml(ageH == null ? "—" : `${ageH}h`)}
          ${tCloseH != null ? ` • <strong>Time to close:</strong> ${escapeHtml(`${tCloseH}h`)}` : ""}
          • <strong>PatientProfile:</strong> ${escapeHtml(c?.patientProfileId ?? "—")}
        </div>
      </div>
      <div class="row-cta">View →</div>
      `;

      el.addEventListener("click", () => openCase(c));
      casesList.appendChild(el);
    }
  }

  function mapCaseStage(status) {
    const s = String(status || "").toLowerCase();
    if (s === "closed" || s === "consensus_ready") return "closed";
    if (s === "in_review") return "in_review";
    return "waiting";
  }


  function hoursBetween(a, b) {
    const ta = a ? new Date(a).getTime() : NaN;
    const tb = b ? new Date(b).getTime() : NaN;
    if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
    return Math.round(((tb - ta) / 36e5) * 10) / 10; // 0.1h
  }

  function applyCaseFilters() {
    const stage = String(caseStageFilter?.value || "all").toLowerCase();
    const sort = String(sortCases?.value || "desc");

    let items = [...allCases];

    if (stage !== "all") {
      items = items.filter(c => mapCaseStage(c?.status) === stage);
    }

    items.sort((a, b) => {
      const da = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return sort === "asc" ? da - db : db - da;
    });

    return items;
  }


  function fmtProb(p) {
    if (typeof p !== "number") return "—";
    return `${Math.round(p * 100)}%`;
  }

  function renderInfermedicaBars(items = []) {
    if (!items.length) return `<div class="muted">No infermedica data.</div>`;

    return items.map((it) => {
      const pct = typeof it.probability === "number" ? Math.round(it.probability * 100) : 0;
      const src = it.source === "infermedica" ? "infermedica" : "extra";

      return `
      <div class="bar-row">
        <div class="bar-label">
          <div class="bar-title">
            ${escapeHtml(it.label || "—")}
            <span class="badge" style="margin-left:8px;">${escapeHtml(src)}</span>
          </div>
          <div class="muted">Probability: ${escapeHtml(fmtProb(it.probability))}</div>
        </div>
        <div class="bar">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
    `;
    }).join("");
  }


  function renderOptionBars({ options, counts, total }) {
    const safeTotal = total || 0;
    return (options || []).map((o) => {
      const key = o.key ?? o.value ?? o.id ?? "";
      const label = o.label ?? o.name ?? key;
      const n = counts[key] || 0;
      const pct = safeTotal ? Math.round((n / safeTotal) * 100) : 0;

      return `
        <div class="bar-row">
          <div class="bar-label">
            <div class="bar-title">${escapeHtml(label)}</div>
            <div class="muted">${escapeHtml(String(n))} votes • ${escapeHtml(String(pct))}%</div>
          </div>
          <div class="bar">
            <div class="bar-fill" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join("");
  }

  async function openCase(c) {
    caseDetail.innerHTML = `<div class="muted">Loading case insights…</div>`;

    try {
      const insights = await apiGet(`/api/admin/cases/${encodeURIComponent(c.id)}/insights`);

      const created = insights?.case?.created_at ? new Date(insights.case.created_at).toLocaleString() : "—";
      const total = insights?.stats?.total_reviews || 0;
      const counts = insights?.stats?.counts || {};
      const question = insights?.mir?.question || "—";
      const options = insights?.mir?.options || [];

      const cons = insights?.consensus || null;

      caseDetail.innerHTML = `
        <div class="kv"><div class="k">Case ID</div><div class="v">${escapeHtml(insights?.case?.id)}</div></div>
        <div class="kv"><div class="k">Status</div><div class="v">${escapeHtml(insights?.case?.status || "—")}</div></div>
        <div class="kv"><div class="k">Created</div><div class="v">${escapeHtml(created)}</div></div>
        <div class="kv"><div class="k">Reviews</div><div class="v">${escapeHtml(String(total))}</div></div>

        <div class="subpanel">
          <div class="subpanel-title">MIR question</div>
          <div class="question">${escapeHtml(question)}</div>
        </div>

        <div class="subpanel">
          <div class="subpanel-title">Answers distribution</div>
          ${options.length ? renderOptionBars({ options, counts, total }) : `<div class="muted">No options found.</div>`}
        </div>

        <div class="subpanel">
          <div class="subpanel-title">Infermedica probabilities (original model)</div>
          <div class="muted" style="margin-bottom:10px;">
            Shows which MIR options come from Infermedica and the probability it assigned.
          </div>
        
          ${Array.isArray(insights?.infermedica?.options) && insights.infermedica.options.length
          ? renderInfermedicaBars(insights.infermedica.options)
          : `<div class="muted">No infermedica probabilities available.</div>`
        }
          
          ${Array.isArray(insights?.infermedica?.top_conditions) && insights.infermedica.top_conditions.length ? `
          <div class="divider"></div>
          <div class="muted" style="margin-bottom:8px;"><strong>Top Infermedica conditions</strong></div>
          ${renderInfermedicaBars(insights.infermedica.top_conditions.map(x => ({
          label: x.name,
          probability: x.probability,
          source: "infermedica"
        })))}
          ` : ""}

        </div>


        <div class="subpanel">
          <div class="subpanel-title">Final result</div>
          ${cons
          ? `
                <div class="grid2">
                  <div><strong>Final answer:</strong> ${escapeHtml(cons.final_answer || "—")}</div>
                  <div><strong>Final diagnosis:</strong> ${escapeHtml(cons.final_diagnosis || "—")}</div>
                  <div><strong>Final urgency:</strong> ${escapeHtml(cons.final_urgency || "—")}</div>
                  <div><strong>Closed at:</strong> ${escapeHtml(cons.closed_at ? new Date(cons.closed_at).toLocaleString() : "—")}</div>
                </div>
              `
          : `<div class="muted">No consensus yet.</div>`
        }
        </div>

        <div class="actions">
          <button id="btnCloseConsensus" class="btn btn-primary" type="button">Close consensus</button>
          <button id="btnCopyCase" class="btn btn-ghost" type="button">Copy Case ID</button>
        </div>

        <div class="muted" style="margin-top:10px;">
          “Close consensus” uses your backend rule (quorum + supermajority).
        </div>
      `;

      document.getElementById("btnCopyCase")?.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(String(insights?.case?.id));
          showToast("Case ID copied", "success");
        } catch {
          showToast("Could not copy", "warning");
        }
      });

      document.getElementById("btnCloseConsensus")?.addEventListener("click", async () => {
        try {
          await apiPost(`/api/admin/cases/${encodeURIComponent(c.id)}/consensus`, {});
          showToast("Consensus closed", "success");
          openCase(c);
          allCases = await loadAdminCases();
          renderDashboard();
          renderCases(applyCaseFilters());
        } catch (e) {
          showToast(e.message || "Could not close consensus", "error");
        }
      });

    } catch (e) {
      try {
        const basic = await apiGet(`/api/admin/cases/${encodeURIComponent(c.id)}`);
        const created = basic?.created_at ? new Date(basic.created_at).toLocaleString() : "—";

        caseDetail.innerHTML = `
          <div class="kv"><div class="k">Case ID</div><div class="v">${escapeHtml(basic?.id)}</div></div>
          <div class="kv"><div class="k">Status</div><div class="v">${escapeHtml(basic?.status || "—")}</div></div>
          <div class="kv"><div class="k">Created</div><div class="v">${escapeHtml(created)}</div></div>
          <div class="kv"><div class="k">PatientProfile</div><div class="v">${escapeHtml(basic?.patientProfileId ?? "—")}</div></div>

          <div class="empty" style="margin-top:12px;">
            <div class="empty-title">Missing “insights” endpoint</div>
            <div class="empty-sub">
              To show MIR question, answers %, number of clinicians and final result, add:
              <strong>GET /api/admin/cases/:id/insights</strong> (te dejo el código abajo).
            </div>
          </div>
        `;
      } catch (e2) {
        caseDetail.innerHTML = `<div class="muted">${escapeHtml(e2.message || e.message || "Failed")}</div>`;
      }
    }
  }

  function toDateInputValue(dob) {
    if (!dob) return "";
    const s = String(dob);

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;

    return "";
  }

  function fillAdminProfileFromData(data) {
    const u = data?.user || data || {};

    if (apName) apName.value = u.name || "";
    if (apSurname) apSurname.value = u.surname || "";
    if (apEmail) apEmail.value = u.email || "";
    if (apAddress) apAddress.value = u.address || "";
    if (apDob) apDob.value = toDateInputValue(u.dob);
    if (apPhone) apPhone.value = u.phone || "";

    if (apEmail) apEmail.readOnly = true;
  }


  adminProfileForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (btnSaveAdminProfile) btnSaveAdminProfile.disabled = true;

      await apiPut("/api/admin/profile", {
        user: {
          name: String(apName?.value || "").trim(),
          surname: String(apSurname?.value || "").trim(),
          address: String(apAddress?.value || "").trim(),
          dob: apDob?.value || "",
          phone: String(apPhone?.value || "").trim(),
        },
      });
      await ensureAdminProfileFilled();
      showToast("Profile updated", "success");
    } catch (err) {
      showToast(err.message || "Update failed", "error");
    } finally {
      if (btnSaveAdminProfile) btnSaveAdminProfile.disabled = false;
    }
  });


  btnApSendCode?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const np1 = String(apNewPassword?.value || "").trim();
      const np2 = String(apNewPassword2?.value || "").trim();

      if (np1.length < 8) return showToast("Password must be at least 8 characters", "warning");
      if (np1 !== np2) return showToast("Passwords do not match", "warning");

      btnApSendCode.disabled = true;

      await apiPost("/api/auth/password-change/request", { new_password: np1 });

      apPwStep1?.classList.add("is-hidden");
      apPwStep2?.classList.remove("is-hidden");
      apCode.value = "";
      apCode.focus();

      showToast("Code sent to your email", "success");
    } catch (err) {
      showToast(err.message || "Could not send code", "error");
    } finally {
      btnApSendCode.disabled = false;
    }
  });

  btnApBackPw?.addEventListener("click", (e) => {
    e.preventDefault();
    apPwStep2?.classList.add("is-hidden");
    apPwStep1?.classList.remove("is-hidden");
    apCode.value = "";
  });

  btnApChangePassword?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const code = String(apCode?.value || "").trim();
      const np1 = String(apNewPassword?.value || "").trim();

      if (!code) return showToast("Enter the code", "warning");
      if (np1.length < 8) return showToast("Password must be at least 8 characters", "warning");

      btnApChangePassword.disabled = true;

      await apiPost("/api/auth/password-change/confirm", { code, new_password: np1 });

      showToast("Password updated", "success");

      apCode.value = "";
      apNewPassword.value = "";
      apNewPassword2.value = "";
      apPwStep2?.classList.add("is-hidden");
      apPwStep1?.classList.remove("is-hidden");
    } catch (err) {
      showToast(err.message || "Password change failed", "error");
    } finally {
      btnApChangePassword.disabled = false;
    }
  });


  const apDelStep1 = document.getElementById("apDelStep1");
  const apDelStep2 = document.getElementById("apDelStep2");
  const apDeleteCode = document.getElementById("apDeleteCode");

  document.getElementById("btnApSendDeleteCode")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      document.getElementById("btnApSendDeleteCode").disabled = true;

      await apiPost("/api/auth/account-delete/request", {});

      apDelStep1?.classList.add("is-hidden");
      apDelStep2?.classList.remove("is-hidden");
      if (apDeleteCode) apDeleteCode.value = "";
      apDeleteCode?.focus();

      showToast("Delete code sent to your email", "success");
    } catch (err) {
      showToast(err.message || "Could not send delete code", "error");
    } finally {
      document.getElementById("btnApSendDeleteCode").disabled = false;
    }
  });

  document.getElementById("btnApBackDelete")?.addEventListener("click", (e) => {
    e.preventDefault();
    apDelStep2?.classList.add("is-hidden");
    apDelStep1?.classList.remove("is-hidden");
    if (apDeleteCode) apDeleteCode.value = "";
  });

  document.getElementById("btnApConfirmDelete")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const code = String(apDeleteCode?.value || "").trim();
      if (!code) return showToast("Enter the code", "warning");

      const ok = window.confirm("This will delete/disable your admin account. Are you sure?");
      if (!ok) return;

      document.getElementById("btnApConfirmDelete").disabled = true;

      await apiPost("/api/auth/account-delete/confirm", { code });

      showToast("Account deleted", "success");
      localStorage.removeItem("token");
      setTimeout(() => (window.location.href = "/pages/login.html?role=ADMIN"), 400);
    } catch (err) {
      showToast(err.message || "Account delete failed", "error");
    } finally {
      document.getElementById("btnApConfirmDelete").disabled = false;
    }
  });


  async function init() {
    try {
      await ensureAdminProfileFilled();

      allVerifs = await loadVerifications();
      allCases = await loadAdminCases();
      const dash = await loadDashboard();

      statClinicians.textContent = String(dash?.users?.clinicians?.total ?? 0);
      statPatients.textContent = String(dash?.users?.patients?.total ?? 0);
      statAdmins.textContent = String(dash?.users?.admins?.total ?? 0);

      const pendingVerifs =
        (dash?.users?.clinicians?.pending ?? 0) + (dash?.users?.admins?.pending ?? 0);

      badgePending.textContent = String(pendingVerifs);
      statPending.textContent = String(pendingVerifs);

      renderCharts(dash);


      renderDashboard();
      renderVerifications();
      renderCases(applyCaseFilters());

      const focus = String(urlParams.get("focus") || "dashboard").toLowerCase();
      if (focus === "verifications") setSection("verifications");
      else if (focus === "cases") setSection("cases");
      else if (focus === "profile") setSection("profile");
      else setSection("dashboard");

      showToast("Loaded", "success");
    } catch (err) {
      console.error(err);

      if (String(err.message || "").includes("401") || String(err.message || "").toLowerCase().includes("token")) {
        localStorage.removeItem("token");
        const qp = new URLSearchParams();
        qp.set("role", "ADMIN");
        qp.set("next", "/pages/area_admin.html");
        window.location.href = "/pages/login.html?" + qp.toString();
        return;
      }

      showToast(err.message || "Failed to load admin area", "error");
    }
  }

  sectionBtns.forEach((b) => {
    b.addEventListener("click", () => setSection(b.getAttribute("data-section")));
  });

  btnRefresh?.addEventListener("click", async () => {
    try {
      allVerifs = await loadVerifications();
      allCases = await loadAdminCases();
      renderDashboard();
      renderVerifications();
      renderCases(applyCaseFilters());
      showToast("Refreshed", "success");
    } catch (e) {
      showToast(e.message || "Refresh failed", "error");
    }
  });

  sortCases?.addEventListener("change", () => renderCases(applyCaseFilters()));

  init();
});
