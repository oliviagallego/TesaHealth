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

  $("btnReportIssue")?.addEventListener("click", () => {
    window.location.href = "mailto:tesahealth.tfg@gmail.com?subject=TesaHealth%20Support";
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

  function setStats({ pendingCount, answeredCount, lastAnswered }) {
    $("statPending").textContent = String(pendingCount ?? "—");
    $("statAnswered").textContent = String(answeredCount ?? "—");
    $("statLastAnswered").textContent = lastAnswered ? fmtDateTime(lastAnswered) : "—";
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

  async function loadOverview() {
    const me = await apiGet("/api/profiles/me");
    setUser(me);

    const pending = await apiGet("/api/clinician/queue").catch(() => []);
    const historyWrap = await apiGet("/api/clinician/reviews-with-result").catch(() => ({ items: [] }));
    const history = Array.isArray(historyWrap?.items) ? historyWrap.items : [];

    const last = history
      .filter((x) => x.submitted_at)
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0];

    setStats({
      pendingCount: Array.isArray(pending) ? pending.length : 0,
      answeredCount: history.length,
      lastAnswered: last?.submitted_at || null,
    });
    await loadWalletToOverview();
  }

  $("btnRefresh")?.addEventListener("click", async () => {
    try {
      await loadOverview();
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

  (async () => {
    try {
      await loadOverview();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load overview", "error");
    }
  })();
});
