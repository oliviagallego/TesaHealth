document.addEventListener("DOMContentLoaded", () => {
    const elUsers = document.getElementById("statUsers");
    const elCases = document.getElementById("statCases");
    const elPatients = document.getElementById("statPatients");
    const elClinicians = document.getElementById("statClinicians");

    function fmt(n) {
        if (n === null || n === undefined) return "—";
        return Number(n).toLocaleString();
    }

    const API_BASE =
        document.querySelector('meta[name="api-base"]')?.content?.trim() || "";

    async function loadStats() {
        try {
            const res = await fetch(`${API_BASE}/api/public/stats`, {
                headers: { Accept: "application/json" },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();

            elUsers.textContent = fmt(data.totalUsers);
            elCases.textContent = fmt(data.totalCases);
            elPatients.textContent = fmt(data.totalPatients);
            elClinicians.textContent = fmt(data.verifiedClinicians);
        } catch (e) {
            console.warn("Live stats failed:", e);
            elUsers.textContent = "—";
            elCases.textContent = "—";
            elPatients.textContent = "—";
            elClinicians.textContent = "—";
        }
    }

    loadStats();
    setInterval(loadStats, 30000);
});
