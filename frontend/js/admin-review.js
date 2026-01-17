document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const userId = Number(params.get("userId"));
  const role = (params.get("role") || "").toUpperCase();

  const pageTitle = document.getElementById("pageTitle");
  const pageSub = document.getElementById("pageSub");

  const reviewTitle = document.getElementById("reviewTitle");
  const reviewSubtitle = document.getElementById("reviewSubtitle");

  const reviewBox = document.getElementById("reviewBox");
  const noAuthBox = document.getElementById("noAuthBox");

  const userInfo = document.getElementById("userInfo");
  const profileInfo = document.getElementById("profileInfo");
  const profileTitle = document.getElementById("profileTitle");

  const chipUserId = document.getElementById("chipUserId");
  const chipStatus = document.getElementById("chipStatus");

  const docsSection = document.getElementById("docsSection");
  const docsList = document.getElementById("docsList");

  const noteEl = document.getElementById("note");
  const btnApprove = document.getElementById("btnApprove");
  const btnNeedsFix = document.getElementById("btnNeedsFix");
  const btnDeny = document.getElementById("btnDeny");

  const resultBox = document.getElementById("resultBox");

  const toast = document.getElementById("toast");
  function showToast(msg, type = "success") {
    if (!toast) return;
    toast.className = `toast show ${type}`;
    toast.textContent = msg;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 3001);
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m]));
  }

  function setResult(msg, type = "ok") {
    resultBox.classList.remove("is-hidden");
    resultBox.classList.toggle("result-box--bad", type === "bad");
    resultBox.classList.toggle("result-box--warn", type === "warn");
    resultBox.textContent = msg;
  }

  function setStatusChip(st) {
    const s = String(st || "pending");
    chipStatus.textContent = s;

    chipStatus.classList.remove("chip--ok", "chip--warn", "chip--bad", "chip--muted");
    if (s === "verified") chipStatus.classList.add("chip--ok");
    else if (s === "needs_fix" || s === "missing") chipStatus.classList.add("chip--warn");
    else if (s === "denied") chipStatus.classList.add("chip--bad");
    else chipStatus.classList.add("chip--muted");
  }

  if (!Number.isFinite(userId) || userId <= 0 || !["CLINICIAN", "ADMIN"].includes(role)) {
    reviewTitle.textContent = "Invalid link";
    reviewSubtitle.textContent = "Missing or invalid userId/role.";
    return;
  }

  pageTitle.textContent = role === "CLINICIAN" ? "Clinician verification review" : "Admin verification review";
  profileTitle.textContent = role === "CLINICIAN" ? "Clinician profile" : "Admin profile";

  const fixMount = document.getElementById("fixPanelMount");

  function fixFieldsByRole(role) {
    const common = [["name", "Name"], ["surname", "Surname"], ["phone", "Phone"], ["address", "Address"], ["dob", "Date of birth"]];
    if (role === "CLINICIAN") return [...common, ["medical_college_reg_no", "Medical college reg no"], ["provincial_college", "Provincial college"], ["specialty", "Specialty"], ["mir_year", "MIR year"], ["liability_insurance", "Liability insurance"], ["documents", "Documents"]];
    return common;
  }

  fixMount.innerHTML = `
  <div id="fixPanel" class="subpanel is-hidden" style="margin-top:12px;">
    <div class="subpanel-title">Select fields to correct</div>
    <details class="fix-dropdown">
      <summary class="fix-summary">Choose one or more fields</summary>
      <div class="fix-options">
        ${fixFieldsByRole(role).map(([k, l]) => `
          <label class="fix-opt"><input type="checkbox" name="fixField" value="${escapeHtml(k)}"><span>${escapeHtml(l)}</span></label>
        `).join("")}
      </div>
    </details>
  </div>
`;

  const fixPanel = document.getElementById("fixPanel");

  btnNeedsFix?.addEventListener("click", () => {
    fixPanel?.classList.remove("is-hidden");
    fixPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
  });


  const token = localStorage.getItem("token");
  if (!token) {
    reviewTitle.textContent = "Admin access required";
    reviewSubtitle.textContent = "Please sign in as Admin to continue.";
    noAuthBox.classList.remove("is-hidden");
    return;
  }

  async function loadReviewData() {
    const r = await fetch(`/api/admin/review/${role}/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "Failed to load review");

    return data;
  }

  async function loadClinicianDocs(clinicianProfileId) {
    const r = await fetch(`/api/admin/clinicians/${encodeURIComponent(clinicianProfileId)}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json().catch(() => ([]));
    if (!r.ok) return null;
    return Array.isArray(data) ? data : [];
  }

  async function submitDecision(decision) {
    const note = (noteEl?.value || "").trim();
    const fields = Array.from(document.querySelectorAll('input[name="fixField"]:checked')).map(x => x.value);

    const r = await fetch(`/api/admin/review/${encodeURIComponent(role)}/${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision, note, fields })
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out?.error || "Failed to save decision");
    return out;
  }


  try {
    reviewTitle.textContent = "Loading…";
    reviewSubtitle.textContent = "Fetching verification data.";

    const data = await loadReviewData();

    const u = data.user || {};
    const p = data.profile || {};

    reviewTitle.textContent = role === "CLINICIAN" ? "Review clinician request" : "Review admin request";
    reviewSubtitle.textContent = "Check the information carefully before deciding.";
    chipUserId.textContent = `ID ${escapeHtml(u.id)}`;

    setStatusChip(p.verification_status);

    userInfo.innerHTML = `
      <div class="kv"><span class="k">Email</span><span class="v">${escapeHtml(u.email)}</span></div>
      <div class="kv"><span class="k">Full name</span><span class="v">${escapeHtml(`${u.name || ""} ${u.surname || ""}`.trim() || "—")}</span></div>
      <div class="kv"><span class="k">Phone</span><span class="v">${escapeHtml(u.phone || "—")}</span></div>
      <div class="kv"><span class="k">Created</span><span class="v">${escapeHtml(u.created_at || "—")}</span></div>
      <div class="kv"><span class="k">Email verified</span><span class="v">${u.email_verified ? "Yes" : "No"}</span></div>
    `;

    if (role === "CLINICIAN") {
      profileInfo.innerHTML = `
        <div class="kv"><span class="k">Verification status</span><span class="v">${escapeHtml(p.verification_status || "pending")}</span></div>
        <div class="kv"><span class="k">Reg no</span><span class="v">${escapeHtml(p.medical_college_reg_no || "—")}</span></div>
        <div class="kv"><span class="k">College</span><span class="v">${escapeHtml(p.provincial_college || "—")}</span></div>
        <div class="kv"><span class="k">Specialty</span><span class="v">${escapeHtml(p.specialty || "—")}</span></div>
        <div class="kv"><span class="k">MIR year</span><span class="v">${escapeHtml(p.mir_year ?? "—")}</span></div>
        <div class="kv"><span class="k">Insurance</span><span class="v">${escapeHtml(p.liability_insurance || "—")}</span></div>
      `;
    } else {
      profileInfo.innerHTML = `
        <div class="kv"><span class="k">Verification status</span><span class="v">${escapeHtml(p.verification_status || "pending")}</span></div>
      `;
    }

    if (role === "CLINICIAN") {
      docsSection.classList.remove("is-hidden");

      const docs = await loadClinicianDocs(p.id);
      if (!docs) {
        docsList.innerHTML = `<div class="muted">Could not load documents.</div>`;
      } else if (docs.length === 0) {
        docsList.innerHTML = `<div class="muted">No documents uploaded yet.</div>`;
      } else {
        docsList.innerHTML = docs.map(d => {

          const name = escapeHtml(d.filename || d.original_name || `Document #${d.id}`);
          const status = escapeHtml(d.status || "pending");
          const created = escapeHtml(d.created_at || "");
          const url =
            d.url ||
            d.file_url ||
            `/api/admin/clinicians/${encodeURIComponent(String(p.id))}/documents/${encodeURIComponent(String(d.id))}/file`;

          const link = `<a class="doc-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a>`;

          return `
            <div class="doc-row">
              <div class="doc-main">
                <div class="doc-name">${name}</div>
                <div class="doc-meta">
                  <span class="chip chip--muted">${status}</span>
                  <span class="muted">${created}</span>
                </div>
              </div>
              <div class="doc-action">${link}</div>
            </div>
          `;
        }).join("");
      }
    }

    reviewBox.classList.remove("is-hidden");

    async function doDecision(decision) {
      setResult("Saving…", "ok");

      try {
        const decisionMap = {
          approve: "verified",
          needs_fix: "needs_fix",
          deny: "denied",
        };
        const payloadDecision = decisionMap[decision];
        if (!payloadDecision) throw new Error("Invalid decision");

        if (payloadDecision === "needs_fix") {
          const fields = Array.from(document.querySelectorAll('input[name="fixField"]:checked'))
            .map(x => x.value);

          if (!fields.length) {
            fixPanel?.classList.remove("is-hidden");
            fixPanel?.scrollIntoView({ behavior: "smooth", block: "center" });

            showToast("Select at least one field to correct", "warning");
            setResult("Select fields to correct before sending.", "warn");
            return;
          }
        }

        const out = await submitDecision(payloadDecision);

        const newStatus = out?.verification_status || payloadDecision;
        setStatusChip(newStatus);

        showToast("Decision saved.", "success");
        setResult(
          `Saved: ${newStatus}`,
          newStatus === "denied" ? "bad" : (newStatus === "needs_fix" ? "warn" : "ok")
        );
      } catch (e) {
        console.error(e);
        showToast(e.message || "Failed to save decision", "error");
        setResult(e.message || "Failed to save decision", "bad");
      }
    }


    btnApprove?.addEventListener("click", () => doDecision("approve"));
    btnNeedsFix?.addEventListener("click", () => doDecision("needs_fix"));
    btnDeny?.addEventListener("click", () => doDecision("deny"));

  } catch (e) {
    console.error(e);
    reviewTitle.textContent = "Could not load review";
    reviewSubtitle.textContent = e.message || "Error";
    showToast(e.message || "Error", "error");
  }
});
