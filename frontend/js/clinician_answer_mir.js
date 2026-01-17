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

    async function apiPost(url, body) {
        const res = await fetch(url, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(body || {}),
        });
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

    function computeStats(pending, historyItems) {
        const last = historyItems
            .filter((x) => x.submitted_at)
            .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0];

        $("statPending").textContent = String(pending.length);
        $("statAnswered").textContent = String(historyItems.length);
        $("statLastAnswered").textContent = last ? fmtDateTime(last.submitted_at) : "—";
    }

    const pendingList = $("pendingList");
    const pendingEmpty = $("pendingEmpty");
    const pendingDetail = $("pendingDetail");
    const searchPending = $("searchPending");

    let allPending = [];
    let allHistory = [];

    function applyFilter(items) {
        const q = String(searchPending?.value || "").trim().toLowerCase();
        if (!q) return items;
        return items.filter((x) => {
            return (
                String(x.id).includes(q) ||
                String(x.status).toLowerCase().includes(q) ||
                String(x.prompt).toLowerCase().includes(q) ||
                String(x.summary).toLowerCase().includes(q)
            );
        });
    }

    function renderPending(items) {
        if (!pendingList || !pendingEmpty) return;

        pendingList.innerHTML = "";
        if (!items.length) {
            pendingEmpty.classList.remove("is-hidden");
            return;
        }
        pendingEmpty.classList.add("is-hidden");

        for (const q of items) {
            const created = q.created_at ? new Date(q.created_at).toLocaleDateString() : "—";
            const excerpt = (q.prompt || q.summary || "").slice(0, 110);
            const optCount = q.options?.length || 0;

            const el = document.createElement("div");
            el.className = "item-card";
            el.innerHTML = `
        <div class="item-main">
          <div class="item-top">
            <span class="badge">${escapeHtml(q.status)}</span>
            <span class="item-id">MIR #${escapeHtml(String(q.id))}</span>
          </div>
          <div class="item-sub">
            <strong>Date:</strong> ${escapeHtml(created)}
            ${optCount ? ` • <strong>Options:</strong> ${escapeHtml(String(optCount))}` : ""}
          </div>
          <div class="item-excerpt">${escapeHtml(excerpt)}${(q.prompt || q.summary || "").length > 110 ? "…" : ""}</div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button">Open →</button>
      `;

            el.querySelector("button")?.addEventListener("click", () => renderPendingDetail(q));
            el.addEventListener("click", (ev) => {
                if (ev.target?.closest("button")) return;
                renderPendingDetail(q);
            });

            pendingList.appendChild(el);
        }
    }

    function renderPendingDetail(q) {
        if (!pendingDetail) return;

        const created = fmtDateTime(q.created_at);
        const prompt = q.prompt || q.summary || "—";
        const opts = Array.isArray(q.options) ? q.options : [];

        pendingDetail.innerHTML = `
      <div class="kv"><div class="k">MIR ID</div><div class="v">${escapeHtml(String(q.id))}</div></div>
      <div class="kv"><div class="k">Status</div><div class="v">${escapeHtml(String(q.status))}</div></div>
      <div class="kv"><div class="k">Created</div><div class="v">${escapeHtml(created)}</div></div>

      <div class="detail-block">
        <div class="detail-title">Question</div>
        <div class="detail-text">${escapeHtml(prompt)}</div>
      </div>

      <div class="detail-block">
        <div class="detail-title">Your answer</div>

        ${opts.length
                ? `<div class="radio-grid">
                ${opts
                    .map(
                        (o, i) => `
                  <label class="radio">
                    <input type="radio" name="mirChoice" value="${escapeHtml(o.key)}" ${i === 0 ? "checked" : ""}/>
                    <span><strong>${escapeHtml(o.key)}</strong> — ${escapeHtml(o.label)}</span>
                  </label>
                `
                    )
                    .join("")}
              </div>`
                : `<div class="muted">No options received.</div>`
            }

        <label class="field" style="margin-top:10px">
          <span class="field-label">Urgency (optional)</span>
          <select id="urgency" class="auth-select">
            <option value="">Select</option>
            <option value="seek_now">Seek now</option>
            <option value="within_24_48h">Within 24–48h</option>
            <option value="within_72h" selected>Within 72h</option>
            <option value="self_care">Self-care</option>

          </select>
        </label>

        <textarea id="solution" class="textarea" rows="3" placeholder="Optional solution / reasoning"></textarea>

        <div class="detail-actions">
          <button id="btnSubmitAnswer" class="btn btn-primary" type="button">Submit answer</button>
          <button id="btnCopyId" class="btn btn-ghost" type="button">Copy ID</button>
        </div>
      </div>
    `;

        $("btnCopyId")?.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(String(q.id));
                showToast("ID copied", "success");
            } catch {
                showToast("Could not copy", "warning");
            }
        });

        $("btnSubmitAnswer")?.addEventListener("click", async () => {
            try {
                const checked = pendingDetail.querySelector('input[name="mirChoice"]:checked');
                const answer = checked ? String(checked.value).trim() : "";
                if (!answer) return showToast("Select an answer", "warning");

                const urgency = String($("urgency")?.value || "").trim() || null;
                const solution = String($("solution")?.value || "").trim() || null;

                $("btnSubmitAnswer").disabled = true;

                await apiPost(`/api/clinician/cases/${encodeURIComponent(q.id)}/reviews`, {
                    answer,
                    urgency,
                    solution,
                });
                await loadWallet();
                showToast("+10€ added to your wallet (pending)", "success");

                await refreshAll();
            } catch (e) {
                console.error(e);
                showToast(e.message || "Submit failed", "error");
            } finally {
                $("btnSubmitAnswer").disabled = false;
            }
        });
    }

    function normalizeQueueItem(row) {
        const d = row?.ai_artifact?.differentials || {};
        const pub = d?.public || {};

        const stem = `${pub.vignette || ""}\n\n${pub.lead_in || ""}`.trim();
        const prompt =
            (pub.question_text && String(pub.question_text).trim()) ||
            (stem && stem.trim()) ||
            row?.ai_artifact?.vignette ||
            "—";

        const optionsRaw = Array.isArray(pub.options) ? pub.options : [];
        const options = optionsRaw
            .filter(o => o && o.key)
            .map(o => ({
                key: String(o.key).toUpperCase(),
                label: String(o.label || o.key)
            }));

        return {
            id: row?.id,
            status: row?.status || "—",
            created_at: row?.created_at || null,
            prompt,
            options,
            summary: row?.ai_artifact?.vignette || "",
            raw: row
        };
    }

    async function refreshAll() {
        const me = await apiGet("/api/profiles/me");
        setUser(me);

        const queue = await apiGet("/api/clinician/queue").catch(() => []);
        const historyWrap = await apiGet("/api/clinician/reviews-with-result").catch(() => ({ items: [] }));

        allPending = (Array.isArray(queue) ? queue : []).map(normalizeQueueItem);
        allHistory = Array.isArray(historyWrap?.items) ? historyWrap.items : [];

        computeStats(allPending, allHistory);
        renderPending(applyFilter(allPending));

        if (pendingDetail) pendingDetail.innerHTML = `<div class="case-detail-empty">Select a question to answer.</div>`;
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

    searchPending?.addEventListener("input", () => renderPending(applyFilter(allPending)));

    async function loadWallet() {
        try {
            const w = await apiGet("/api/clinician/wallet");
            const total = w?.totals?.total_eur ?? 0;
            const el = document.getElementById("walletTotal");
            const stat = document.getElementById("statScope");
            if (stat) stat.textContent = `${Number(total).toFixed(2)} €`;

            if (el) el.textContent = String(total.toFixed ? total.toFixed(2) : total);
        } catch { }
    }
    loadWallet();

    (async () => {
        try {
            if (pendingDetail) pendingDetail.innerHTML = `<div class="case-detail-empty">Select a question to answer.</div>`;
            await refreshAll();
        } catch (e) {
            console.error(e);
            showToast(e.message || "Failed to load", "error");
        }
    })();
});
