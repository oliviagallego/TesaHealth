document.addEventListener("DOMContentLoaded", () => {
  const toast = document.getElementById("toast");
  const $ = (id) => document.getElementById(id);

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
    qp.set("role", "CLINICIAN");
    qp.set("next", window.location.pathname + (window.location.search || ""));
    window.location.href = "/pages/login.html?" + qp.toString();
    return;
  }

  $("btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    showToast("Logged out", "success");
    setTimeout(() => (window.location.href = "/pages/login.html?role=CLINICIAN"), 300);
  });

  function authHeaders(extra = {}) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  async function apiGet(url) {
    const res = await fetch(url, { headers: authHeaders() });
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

  function fmtDateTime(d) {
    if (!d) return "—";
    try { return new Date(d).toLocaleString(); } catch { return String(d); }
  }

  function setUser(me) {
    const name = me?.user?.name || "Clinician";
    const surname = me?.user?.surname || "";
    const email = me?.user?.email || "—";

    $("clinicianName").textContent = `${name}${surname ? " " + surname : ""}`;
    $("clinicianEmail").textContent = email;
    $("avatarLetter").textContent = String(name || "C").trim().charAt(0).toUpperCase() || "C";
  }

  function computeStats(pendingQueue, historyItems) {
    const last = historyItems
      .filter((x) => x.submitted_at)
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0];

    $("statPending").textContent = String(pendingQueue.length);
    $("statAnswered").textContent = String(historyItems.length);
    $("statLastAnswered").textContent = last ? fmtDateTime(last.submitted_at) : "—";
  }
  async function loadWalletToOverview() {
    try {
      const w = await apiGet("/api/clinician/wallet");
      const total = Number(w?.totals?.total_eur ?? 0);
      $("statScope").textContent = `${total.toFixed(2)} €`;
    } catch {
      $("statScope").textContent = "—";
    }
  }

  const historyList = $("historyList");
  const historyEmpty = $("historyEmpty");
  const historyDetail = $("historyDetail");
  const searchHistory = $("searchHistory");

  let allQueue = [];
  let allHistory = [];

  function applyFilter(items) {
    const q = String(searchHistory?.value || "").trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => {
      return (
        String(x.caseId || "").toLowerCase().includes(q) ||
        String(x?.clinician?.key || "").toLowerCase().includes(q) ||
        String(x?.consensus?.final_diagnosis || "").toLowerCase().includes(q)
      );
    });
  }

  function renderHistory(items) {
    if (!historyList || !historyEmpty) return;

    historyList.innerHTML = "";
    if (!items.length) {
      historyEmpty.classList.remove("is-hidden");
      return;
    }
    historyEmpty.classList.add("is-hidden");

    for (const it of items) {
      historyList.appendChild(renderHistoryCard(it));
    }
  }


  function renderDetail(it) {
    if (!historyDetail) return;

    const res = it.result || null;

    historyDetail.innerHTML = `
      <div class="kv"><div class="k">Review ID</div><div class="v">${escapeHtml(String(it.reviewId))}</div></div>
      <div class="kv"><div class="k">MIR ID</div><div class="v">${escapeHtml(String(it.caseId))}</div></div>
      <div class="kv"><div class="k">Submitted</div><div class="v">${escapeHtml(fmtDateTime(it.submitted_at))}</div></div>
      <div class="kv"><div class="k">Your choice</div><div class="v">${escapeHtml(it.answer || "—")}</div></div>

      <div class="detail-block">
        <div class="detail-title">Your solution / reasoning</div>
        <div class="detail-text">${escapeHtml(it.solution || "—")}</div>
      </div>

      <div class="detail-block">
        <div class="detail-title">Final result</div>
        ${res
        ? `
              <div class="kv"><div class="k">Final answer</div><div class="v">${escapeHtml(res.final_answer || "—")}</div></div>
              <div class="kv"><div class="k">Final diagnosis</div><div class="v">${escapeHtml(res.final_diagnosis || "—")}</div></div>
              <div class="kv"><div class="k">Final urgency</div><div class="v">${escapeHtml(res.final_urgency || "—")}</div></div>
              <div class="kv"><div class="k">Closed</div><div class="v">${escapeHtml(fmtDateTime(res.closed_at))}</div></div>
            `
        : `<div class="muted">No consensus yet for this case.</div>`
      }
      </div>

      <div class="detail-actions">
        <button id="btnCopyReviewId" class="btn btn-ghost" type="button">Copy Review ID</button>
      </div>
    `;

    $("btnCopyReviewId")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(it.reviewId));
        showToast("Copied", "success");
      } catch {
        showToast("Could not copy", "warning");
      }
    });
  }

  async function refreshAll() {
    const me = await apiGet("/api/profiles/me");
    setUser(me);

    const queue = await apiGet("/api/clinician/queue").catch(() => []);
    const historyWrap = await apiGet("/api/clinician/reviews-with-result").catch(() => ({ items: [] }));

    allQueue = Array.isArray(queue) ? queue : [];
    allHistory = Array.isArray(historyWrap?.items) ? historyWrap.items : [];

    computeStats(allQueue, allHistory);
    await loadWalletToOverview();
    renderHistory(applyFilter(allHistory));

    if (historyDetail) historyDetail.innerHTML = `<div class="case-detail-empty">Select an answer to view details.</div>`;
  }

  $("btnRefresh")?.addEventListener("click", async () => {
    try {
      await refreshAll();
      showToast("Refreshed", "success");
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.includes("401") || msg.toLowerCase().includes("token")) {
        localStorage.removeItem("token");
        const qp = new URLSearchParams();
        qp.set("role", "CLINICIAN");
        qp.set("next", window.location.pathname + (window.location.search || ""));
        window.location.href = "/pages/login.html?" + qp.toString();
        return;
      }
      showToast(e.message || "Refresh failed", "error");
    }
  });

  searchHistory?.addEventListener("input", () => renderHistory(applyFilter(allHistory)));

  (async () => {
    try {
      if (historyDetail) historyDetail.innerHTML = `<div class="case-detail-empty">Select an answer to view details.</div>`;
      await refreshAll();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load", "error");
    }
  })();
  function renderHistoryCard(it) {
    const stem = it?.mir?.stem || "—";
    const excerpt = stem.replace(/\s+/g, " ").slice(0, 180);
    const status = it?.consensus ? "Resolved" : "In progress";

    const el = document.createElement("div");
    el.className = "item-card";
    el.innerHTML = `
    <div class="item-main">
      <div class="item-top">
        <span class="badge">${status}</span>
        <span class="item-id">MIR #${it.caseId}</span>
      </div>
      <div class="item-sub">
        <strong>Date:</strong> ${it.submitted_at ? new Date(it.submitted_at).toLocaleString() : "—"}
        • <strong>Your choice:</strong> ${it?.clinician?.key || "—"}
        ${it?.consensus?.key ? ` • <strong>Consensus:</strong> ${it.consensus.key}` : ""}
      </div>
      <div class="item-excerpt">${escapeHtml(excerpt)}${stem.length > 180 ? "…" : ""}</div>
    </div>
    <button class="btn btn-ghost btn-sm" type="button">Open →</button>
  `;

    el.querySelector("button").addEventListener("click", () => renderHistoryDetail(it));
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      renderHistoryDetail(it);
    });

    return el;
  }

  function renderOptions(it) {
    const opts = Array.isArray(it?.mir?.options) ? it.mir.options : [];
    if (!opts.length) return `<div class="muted">No options.</div>`;

    const you = (it?.clinician?.key || "").toUpperCase();
    const cons = (it?.consensus?.key || "").toUpperCase();

    return `
    <div class="detail-block">
      <div class="detail-title">Options</div>
      <div class="radio-grid">
        ${opts.map(o => {
      const k = String(o.key).toUpperCase();
      const tag = (k === you && k === cons) ? "You + Consensus"
        : (k === you) ? "You"
          : (k === cons) ? "Consensus"
            : "";
      return `
            <div class="radio">
              <span><strong>${escapeHtml(k)}</strong> — ${escapeHtml(o.label)}</span>
              ${tag ? `<span class="badge">${escapeHtml(tag)}</span>` : ""}
            </div>
          `;
    }).join("")}
      </div>
    </div>
  `;
  }

  function renderHistoryDetail(it) {
    const stem = it?.mir?.stem || "—";

    const youKey = it?.clinician?.key || "—";
    const youLabel = it?.clinician?.label ? ` — ${it.clinician.label}` : "";

    const hasCons = !!it?.consensus;
    const consKey = hasCons ? (it.consensus.key || "—") : "—";
    const consLabel = hasCons && it.consensus.label ? ` — ${it.consensus.label}` : "";

    const rewardEur = 10;

    const verdictHtml = !hasCons
      ? `<strong>Pending</strong>`
      : it.is_correct
        ? `<strong>Correct </strong> <span class="badge badge-ok">+10€</span>
       <div class="muted tiny" style="margin-top:6px">
         Correct means that you are part of the final consensus (your answer matches the majority of the rest of clinicians' answers) and earned +10€ for this case.
       </div>`
        : `<strong>Incorrect </strong>`;


    historyDetail.innerHTML = `
    <div class="kv"><div class="k">Review ID</div><div class="v">${escapeHtml(String(it.reviewId))}</div></div>
    <div class="kv"><div class="k">MIR ID</div><div class="v">${escapeHtml(String(it.caseId))}</div></div>
    <div class="kv"><div class="k">Submitted</div><div class="v">${escapeHtml(new Date(it.submitted_at).toLocaleString())}</div></div>

    <div class="divider"></div>

    <div class="detail-block">
      <div class="detail-title">MIR question</div>
      <pre style="white-space:pre-wrap; margin:0">${escapeHtml(stem)}</pre>
    </div>

    ${renderOptions(it)}

    <div class="divider"></div>

    <div class="detail-block">
      <div class="detail-title">Answers</div>
      <div class="kv"><div class="k">Your answer</div><div class="v"><strong>${escapeHtml(youKey)}</strong>${escapeHtml(youLabel)}</div></div>
      <div class="kv"><div class="k">Consensus</div><div class="v">${hasCons ? `<strong>${escapeHtml(consKey)}</strong>${escapeHtml(consLabel)}` : `<span class="muted">No consensus yet</span>`}</div></div>
      <div class="kv"><div class="k">Result</div><div class="v">${verdictHtml}</div></div>
    </div>

    ${hasCons ? `
      <div class="detail-block">
        <div class="detail-title">Final diagnosis & urgency</div>
        <div class="kv"><div class="k">Diagnosis</div><div class="v">${escapeHtml(it.consensus.final_diagnosis || "—")}</div></div>
        <div class="kv"><div class="k">Urgency</div><div class="v">${escapeHtml(it.consensus.final_urgency || "—")}</div></div>
      </div>
    ` : ""}

    ${it.solution ? `
      <div class="detail-block">
        <div class="detail-title">Your reasoning</div>
        <div class="muted" style="white-space:pre-wrap">${escapeHtml(it.solution)}</div>
      </div>
    ` : ""}
  `;
  }

});
