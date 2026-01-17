document.addEventListener("DOMContentLoaded", () => {
  const toast = document.getElementById("toast");
  function showToast(message, type = "success") {
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  const token = localStorage.getItem("token");
  if (!token) {
    const qp = new URLSearchParams();
    qp.set("role", "PATIENT");
    qp.set("next", window.location.pathname + (window.location.search || ""));
    window.location.href = "/pages/login.html?" + qp.toString();
    return;
  }

  const btnLogout = document.getElementById("btnLogout");
  btnLogout?.addEventListener("click", () => {
    localStorage.removeItem("token");
    showToast("Logged out", "success");
    setTimeout(() => (window.location.href = "/pages/login.html?role=PATIENT"), 300);
  });

  document.getElementById("btnReportIssue")?.addEventListener("click", () => {
    window.location.href = "mailto:tesahealth.tfg@gmail.com?subject=TesaHealth%20Support";
  });

  const patientName = document.getElementById("patientName");
  const patientEmail = document.getElementById("patientEmail");
  const avatarLetter = document.getElementById("avatarLetter");

  const statTotal = document.getElementById("statTotalCases");
  const statOpen = document.getElementById("statOpenCases");
  const statDone = document.getElementById("statDoneCases");
  const statLatestCase = document.getElementById("statLatestCase");
  const statLatestConsensus = document.getElementById("statLatestConsensus");

  const resumeOpenBox = document.getElementById("resumeOpenBox");
  const resumeClosedBox = document.getElementById("resumeClosedBox");


  const casesList = document.getElementById("casesList");
  const casesEmpty = document.getElementById("casesEmpty");
  const caseDetail = document.getElementById("caseDetail");

  const searchCases = document.getElementById("searchCases");
  const filterStatus = document.getElementById("filterStatus");
  const btnRefresh = document.getElementById("btnRefresh");

  const hasCasesUI = !!casesList && !!casesEmpty && !!caseDetail;
  const hasOverviewUI = !!statTotal && !!statOpen && !!statDone && !!statLatestCase && !!statLatestConsensus;

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  async function apiGet(url) {
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
    return data;
  }

  async function downloadCasePdf(caseId) {
    const res = await fetch(`/api/cases/${encodeURIComponent(caseId)}/pdf`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      let msg = `Download failed: ${res.status}`;
      if (ct.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        msg = data?.error || msg;
      } else {
        const t = await res.text().catch(() => "");
        if (t) msg = t;
      }
      throw new Error(msg);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `TesaHealth_case_${caseId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function escapeHtml(str = "") {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatUrgency(u) {
    if (!u) return "—";
    if (u === "seek_now") return "Seek now";
    if (u === "within_24_48h") return "Within 24–48h";
    if (u === "within_72h") return "Within 72h";
    if (u === "self_care") return "Self-care";
    return String(u);
  }

  function pickLatestByDate(items) {
    return (items || [])
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  }

  function renderContinuePanels(items) {
    if (!resumeOpenBox || !resumeClosedBox) return;

    const list = items || [];

    const open = pickLatestByDate(
      list.filter(c => String(c.status || "").toLowerCase() === "in_interview")
    );

    const closed = pickLatestByDate(
      list.filter(c => {
        const st = String(c.status || "").toLowerCase();
        return st === "consensus_ready" || st === "closed" || !!c.final_diagnosis;
      })
    );

    if (!open) {
      resumeOpenBox.innerHTML = `
      <div class="resume-title">Resume last interview</div>
      <div class="muted">No interview to resume.</div>
    `;
    } else {
      const created = open.created_at ? new Date(open.created_at).toLocaleString() : "—";
      resumeOpenBox.innerHTML = `
      <div class="resume-title">Resume last interview</div>
      <div class="resume-meta">
        <span class="badge">in_interview</span>
        <span class="muted">Case #${escapeHtml(String(open.id))}</span>
        <span class="muted">${escapeHtml(created)}</span>
      </div>
      <div class="muted">${open.summary ? escapeHtml(open.summary) : "You can continue where you left off. To finish it click on: 'Finish & generate results' "}</div>
      <div style="margin-top:6px; display:flex; gap:10px; flex-wrap:wrap;">
        <a class="btn btn-primary" href="/pages/new_case.html?caseId=${encodeURIComponent(String(open.id))}">Resume →</a>
      </div>
    `;
    }

    if (!closed) {
      resumeClosedBox.innerHTML = `
      <div class="resume-title">Last completed report</div>
      <div class="muted">No completed report yet.</div>
    `;
    } else {
      const created = closed.created_at ? new Date(closed.created_at).toLocaleString() : "—";
      const dx = closed.final_diagnosis || "—";
      const urg = closed.final_urgency ? formatUrgency(closed.final_urgency) : "—";

      resumeClosedBox.innerHTML = `
      <div class="resume-title">Last completed report</div>
      <div class="resume-meta">
        <span class="badge">${escapeHtml(String(closed.status || ""))}</span>
        <span class="muted">Case #${escapeHtml(String(closed.id))}</span>
        <span class="muted">${escapeHtml(created)}</span>
      </div>
      <div class="muted"><strong>${escapeHtml(dx)}</strong> • ${escapeHtml(urg)}</div>
      <div style="margin-top:6px; display:flex; gap:10px; flex-wrap:wrap;">
        <a class="btn btn-primary" href="/pages/new_case.html?caseId=${encodeURIComponent(String(closed.id))}">Open report →</a>
      </div>
    `;
    }
  }

  function isOpenStatus(s) {
    const st = String(s || "").toLowerCase();
    return ["in_interview", "ai_ready", "in_review"].includes(st);
  }


  function normalizeCase(c) {
    const cons = c?.consensus || c?.Consensus || null;

    return {
      id: c?.id ?? c?.caseId ?? c?.case_id ?? "—",
      status: c?.status ?? "—",
      created_at: c?.created_at ?? c?.createdAt ?? c?.submitted_at ?? null,

      urgency: c?.urgency ?? c?.triage ?? c?.final_urgency ?? cons?.final_urgency ?? null,

      final_diagnosis:
        cons?.final_diagnosis ??
        c?.final_diagnosis ??
        c?.finalDiagnosis ??
        null,

      final_urgency:
        cons?.final_urgency ??
        c?.final_urgency ??
        c?.finalUrgency ??
        null,

      summary: c?.summary ?? c?.chief_complaint ?? c?.reason ?? "",
      raw: c,
    };
  }

  function renderCaseDetail(c) {
    if (!caseDetail) return;

    const created = c.created_at ? new Date(c.created_at).toLocaleString() : "—";
    const urgency = formatUrgency(c.urgency);

    caseDetail.innerHTML = `
      <div class="kv"><div class="k">Case ID</div><div class="v">${escapeHtml(String(c.id))}</div></div>
      <div class="kv"><div class="k">Status</div><div class="v">${escapeHtml(String(c.status))}</div></div>
      <div class="kv"><div class="k">Created</div><div class="v">${escapeHtml(created)}</div></div>
      <div class="kv"><div class="k">Urgency</div><div class="v">${escapeHtml(urgency)}</div></div>
      <div class="kv"><div class="k">Summary</div><div class="v">${c.summary ? escapeHtml(c.summary) : "—"}</div></div>
      <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
        <a class="btn btn-ghost" href="/pages/new_case.html">Start new case</a>
        <button id="btnCopyCase" class="btn btn-primary" type="button">Copy Case ID</button>
      </div>
    `;

    document.getElementById("btnCopyCase")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(c.id));
        showToast("Case ID copied", "success");
      } catch {
        showToast("Could not copy", "warning");
      }
    });

    const canDownload =
      ["consensus_ready", "closed"].includes(String(c.status || "").toLowerCase()) ||
      !!c.final_diagnosis;

    caseDetail.innerHTML = `
    <div class="kv"><div class="k">Case ID</div><div class="v">${escapeHtml(String(c.id))}</div></div>
    <div class="kv"><div class="k">Status</div><div class="v">${escapeHtml(String(c.status))}</div></div>
    <div class="kv"><div class="k">Created</div><div class="v">${escapeHtml(created)}</div></div>
    <div class="kv"><div class="k">Urgency</div><div class="v">${escapeHtml(urgency)}</div></div>

    <div class="kv"><div class="k">Final diagnosis</div><div class="v">${escapeHtml(String(c.final_diagnosis || "—"))}</div></div>
    <div class="kv"><div class="k">Final urgency</div><div class="v">${escapeHtml(String(c.final_urgency ? formatUrgency(c.final_urgency) : "—"))}</div></div>

    <div class="kv"><div class="k">Summary</div><div class="v">${c.summary ? escapeHtml(c.summary) : "—"}</div></div>

    <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
      <a class="btn btn-ghost" href="/pages/new_case.html">Start new case</a>
      <button id="btnCopyCase" class="btn btn-primary" type="button">Copy Case ID</button>

      <button
        id="btnDownloadPdf"
        class="btn btn-primary"
        type="button"
        ${canDownload ? "" : "disabled"}
        title="${canDownload ? "" : "PDF available when consensus is completed"}"
      >
        Download PDF report
      </button>
    </div>
  `;

    document.getElementById("btnCopyCase")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(c.id));
        showToast("Case ID copied", "success");
      } catch {
        showToast("Could not copy", "warning");
      }
    });

    document.getElementById("btnDownloadPdf")?.addEventListener("click", async () => {
      try {
        if (!canDownload) return;
        await downloadCasePdf(c.id);
        showToast("PDF downloaded", "success");
      } catch (e) {
        console.error(e);
        showToast(e.message || "Could not download PDF", "error");
      }
    });

  }

  function renderCases(items) {
    if (!casesList || !casesEmpty) return;

    casesList.innerHTML = "";
    if (!items.length) {
      casesEmpty.classList.remove("is-hidden");
      return;
    }
    casesEmpty.classList.add("is-hidden");

    for (const c of items) {
      const urgency = formatUrgency(c.urgency);
      const created = c.created_at ? new Date(c.created_at).toLocaleDateString() : "—";
      const status = String(c.status || "—");
      const id = String(c.id);

      const el = document.createElement("div");
      el.className = "case-card";
      el.innerHTML = `
        <div class="case-main">
          <div class="case-top">
            <span class="badge">${escapeHtml(status)}</span>
            <span class="case-id">Case #${escapeHtml(id)}</span>
          </div>
          <div class="case-sub">
            <strong>Urgency:</strong> ${escapeHtml(urgency)} • <strong>Date:</strong> ${escapeHtml(created)}
          </div>
        </div>
        <a class="btn btn-ghost" href="/pages/new_case.html?caseId=${encodeURIComponent(id)}">View →</a>
      `;

      el.addEventListener("click", (ev) => {
        if (ev.target?.closest("a")) return;
        renderCaseDetail(c);
      });

      casesList.appendChild(el);
    }
  }

  function computeStats(items) {
    if (!hasOverviewUI) return;

    const total = items.length;
    const open = items.filter((c) => isOpenStatus(c.status)).length;
    const done = total - open;

    const latest = items
      .filter((c) => c.created_at)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

    statTotal.textContent = String(total);
    statOpen.textContent = String(open);
    statDone.textContent = String(done);

    if (!latest) {
      statLatestCase.textContent = "—";
      statLatestConsensus.textContent = "—";
      return;
    }

    const latestId = `#${latest.id}`;
    const latestDate = new Date(latest.created_at).toLocaleDateString("en-GB");
    statLatestCase.textContent = `${latestId} • ${latestDate}`;

    const st = String(latest.status || "").toLowerCase();
    const dx =
      latest.final_diagnosis ||
      (st === "in_interview" ? "Interview in progress" : "Waiting for clinician consensus");

    const urg = latest.final_urgency ? formatUrgency(latest.final_urgency) : "—";
    statLatestConsensus.textContent = `${dx} • ${urg}`;
  }



  function applyFilters(allItems) {
    const q = String(searchCases?.value || "").trim().toLowerCase();
    const s = String(filterStatus?.value || "").trim().toLowerCase();

    return allItems.filter((c) => {
      const okStatus = !s || String(c.status || "").toLowerCase() === s;
      const okQuery =
        !q ||
        String(c.id).toLowerCase().includes(q) ||
        String(c.status || "").toLowerCase().includes(q);
      return okStatus && okQuery;
    });
  }

  async function loadMe() {
    return apiGet("/api/profiles/me");
  }

  async function loadCases() {
    try {
      const data = await apiGet("/api/cases");
      const list = Array.isArray(data) ? data : Array.isArray(data?.cases) ? data.cases : [];
      return list.map(normalizeCase);
    } catch (e) {
      try {
        const data2 = await apiGet("/api/cases/mine");
        const list2 = Array.isArray(data2) ? data2 : Array.isArray(data2?.cases) ? data2.cases : [];
        return list2.map(normalizeCase);
      } catch {
        throw e;
      }
    }
  }

  let allCases = [];

  async function init() {
    try {
      const me = await loadMe();

      const name = me?.user?.name || "Patient";
      const surname = me?.user?.surname || "";
      const email = me?.user?.email || "—";

      if (patientName) patientName.textContent = `${name}${surname ? " " + surname : ""}`;
      if (patientEmail) patientEmail.textContent = email;
      if (avatarLetter) avatarLetter.textContent = String(name || "P").trim().charAt(0).toUpperCase() || "P";

      const lp = String(me?.user?.last_profile || "").toLowerCase();
      if (lp && lp !== "patient") {
        const to =
          lp === "admin" ? "/pages/area_admin.html" :
            lp === "clinician" ? "/pages/area_clinician.html" :
              "/pages/area_patient.html";
        if (to !== window.location.pathname) window.location.href = to;
        return;
      }

      const needCases = hasOverviewUI || hasCasesUI;
      if (needCases) {
        allCases = await loadCases();
        if (hasOverviewUI) computeStats(allCases);
        if (hasCasesUI) renderCases(applyFilters(allCases));
        renderContinuePanels(allCases);
      }

      showToast("Loaded", "success");
    } catch (err) {
      console.error(err);

      if (String(err.message || "").toLowerCase().includes("token") || String(err.message || "").includes("401")) {
        localStorage.removeItem("token");
        const qp = new URLSearchParams();
        qp.set("role", "PATIENT");
        qp.set("next", window.location.pathname + (window.location.search || ""));
        window.location.href = "/pages/login.html?" + qp.toString();
        return;
      }

      showToast(err.message || "Failed to load patient area", "error");
    }
  }

  btnRefresh?.addEventListener("click", async () => {
    try {
      const needCases = hasOverviewUI || hasCasesUI;
      if (!needCases) return;

      allCases = await loadCases();
      if (hasOverviewUI) computeStats(allCases);
      if (hasCasesUI) renderCases(applyFilters(allCases));
      renderContinuePanels(allCases);
      showToast("Refreshed", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Refresh failed", "error");
    }
  });

  searchCases?.addEventListener("input", () => {
    if (!hasCasesUI) return;
    renderCases(applyFilters(allCases));
  });

  filterStatus?.addEventListener("change", () => {
    if (!hasCasesUI) return;
    renderCases(applyFilters(allCases));
  });

  init();

  async function pollNotifications() {
    try {
      const res = await fetch("/api/notifications?unread=1", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const list = await res.json();
      if (!res.ok) return;

      const cons = list.find(n => n.type === "consensus_ready");
      const ai = list.find(n => n.type === "ai_ready");
      if (cons) {
        showToast("Your clinician report is ready", "success");

        await fetch(`/api/notifications/${cons.id}/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
      } else if (ai) showToast("Your case is in clinician review", "success");
    } catch { }
  }

  setInterval(pollNotifications, 6000);
  pollNotifications();

});
