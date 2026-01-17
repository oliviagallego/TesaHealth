document.addEventListener("DOMContentLoaded", () => {
    const toast = document.getElementById("toast");

    function showToast(message, type = "success") {
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => toast.classList.remove("show"), 2800);
    }

    const token = localStorage.getItem("token");
    if (!token) {
        const qp = new URLSearchParams();
        qp.set("role", "PATIENT");
        qp.set("next", "/pages/new_case.html");
        window.location.href = "/pages/login.html?" + qp.toString();
        return;
    }

    let isFinishing = false;

    document.getElementById("btnLogout")?.addEventListener("click", () => {
        localStorage.removeItem("token");
        showToast("Logged out", "success");
        setTimeout(() => (window.location.href = "/pages/login.html?role=PATIENT"), 250);
    });

    function authHeaders(extra = {}) {
        return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra };
    }

    async function apiJSON(url, opts = {}) {
        const res = await fetch(url, { ...opts, headers: authHeaders(opts.headers || {}) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
        return data;
    }


    const step1 = document.getElementById("step1");
    const step2 = document.getElementById("step2");
    const step3 = document.getElementById("step3");
    const symptomDropdown = document.getElementById("symptomDropdown");

    let ddItems = [];
    let ddActive = -1;
    let searchTimer = null;


    const stepEls = Array.from(document.querySelectorAll(".stepper .step"));
    function setStep(n) {
        stepEls.forEach((el) => el.classList.toggle("is-active", Number(el.dataset.step) === n));
        step1.classList.toggle("is-hidden", n !== 1);
        step2.classList.toggle("is-hidden", n !== 2);
        step3.classList.toggle("is-hidden", n !== 3);
        conditionsPanel?.classList.toggle("is-hidden", n !== 3);
    }

    const symptomQuery = document.getElementById("symptomQuery");
    const btnSymptomSearch = document.getElementById("btnSymptomSearch");
    const symptomResults = document.getElementById("symptomResults");
    const selectedSymptoms = document.getElementById("selectedSymptoms");
    const btnStartInterview = document.getElementById("btnStartInterview");

    const caseIdLabel = document.getElementById("caseIdLabel");
    const emergencyLabel = document.getElementById("emergencyLabel");
    const conditionsBox = document.getElementById("conditionsBox");
    const conditionsPanel = document.getElementById("conditionsPanel");

    const questionBox = document.getElementById("questionBox");
    const btnSubmitAnswer = document.getElementById("btnSubmitAnswer");
    const btnFinish = document.getElementById("btnFinish");

    const resultsBox = document.getElementById("resultsBox");

    let selected = [];
    let caseId = null;
    let currentQuestion = null;

    function escapeHtml(str = "") {
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function renderSelected() {
        selectedSymptoms.innerHTML = "";
        if (!selected.length) {
            selectedSymptoms.innerHTML = `<div class="muted">No symptoms selected yet.</div>`;
            btnStartInterview.disabled = true;
            return;
        }
        btnStartInterview.disabled = false;

        for (const s of selected) {
            const el = document.createElement("div");
            el.className = "selected-item";
            el.innerHTML = `
        <div>
          <div class="symptom-name">${escapeHtml(s.label)}</div>
        </div>
        <button class="btn btn-ghost" type="button">Remove</button>
      `;
            el.querySelector("button").addEventListener("click", () => {
                selected = selected.filter((x) => x.id !== s.id);
                renderSelected();
            });
            selectedSymptoms.appendChild(el);
        }
    }

    async function loadExistingCase(existingCaseId) {
        caseId = Number(existingCaseId);
        if (!caseId) return;

        caseIdLabel.textContent = String(caseId);

        const detail = await apiJSON(`/api/cases/${caseId}`, { method: "GET" });
        const status = String(detail?.status || "").toLowerCase();

        const ev = Array.isArray(detail.symptoms) ? detail.symptoms : [];
        selected = ev
            .filter(e => e && e.choice_id === "present")
            .map(e => ({ id: e.id, label: e.name || e.label || e.id }));

        renderSelected();

        if (detail.ai_artifact) {
            setStep(3);

            if (detail.consensus || ["consensus_ready", "closed"].includes(status)) {
                renderFinalResults(detail);
                return;
            }

            renderAiReadyPending(detail);
            startResultPolling(caseId);
            return;
        }


        if (status === "in_interview") {
            setStep(2);
            currentQuestion = detail.last_question || null;

            if (currentQuestion) {
                renderQuestion(currentQuestion);
            } else {
                questionBox.innerHTML = `<div class="muted">No pending question. You can finish & generate results.</div>`;
            }
            return;
        }

        setStep(1);
    }


    function renderAiReadyPending(detail) {
        const mirText =
            detail?.ai_artifact?.vignette ||
            detail?.ai_artifact?.differentials?.public?.question_text ||
            "—";

        const tri =
            detail?.ai_artifact?.differentials?.infermedica?.triage?.triage_level ||
            detail?.ai_artifact?.differentials?.infermedica?.triage?.triage ||
            "—";

        const evidenceText = (Array.isArray(detail.symptoms) ? detail.symptoms : [])
            .filter(e => e && e.choice_id === "present")
            .map(e => e.name || e.id)
            .slice(0, 12)
            .join(", ");

        resultsBox.innerHTML = `
        <div class="note">
            <span class="dot" aria-hidden="true"></span>
            <span><strong>Clinician review in progress…</strong> You can leave and come back later.</span>
        </div>

        <div class="kv"><div class="k">Triage level</div><div class="v">${escapeHtml(String(tri))}</div></div>

        <div class="kv"><div class="k">Evidence</div><div class="v">${escapeHtml(evidenceText || "—")}</div></div>

        <div class="divider"></div>

        <div class="q-title">MIR-style question (educational)</div>
        <pre style="white-space:pre-wrap; margin:0; font-weight:700; color:rgba(18,58,99,0.9)">${escapeHtml(mirText)}</pre>

        <div class="divider"></div>

        <div class="muted">Status: <strong>Waiting for clinician consensus…</strong></div>
        `;
    }

    const qpCaseId = new URLSearchParams(window.location.search).get("caseId");
    if (qpCaseId) {
        loadExistingCase(qpCaseId).catch((e) => {
            console.error(e);
            showToast(e.message || "Could not load case", "error");
        });
    }

    function renderConditions(conditions = []) {

        if (!conditionsBox) return;

        conditionsBox.innerHTML = "";
        const top = (conditions || []).slice(0, 6);
        if (!top.length) {
            conditionsBox.innerHTML = `<div class="muted">—</div>`;
            return;
        }
        for (const c of top) {
            const name = c.common_name || c.name || c.id || "Condition";
            const p = typeof c.probability === "number" ? Math.round(c.probability * 100) : null;
            const el = document.createElement("div");
            el.className = "cond-item";
            el.innerHTML = `
        <div>
          <div class="symptom-name">${escapeHtml(name)}</div>
          <div class="symptom-meta">${p !== null ? `${p}%` : ""}</div>
        </div>
      `;
            conditionsBox.appendChild(el);
        }
    }
    function closeDropdown() {
        symptomDropdown.classList.add("is-hidden");
        symptomDropdown.innerHTML = "";
        ddItems = [];
        ddActive = -1;
    }

    function openDropdown(items) {
        ddItems = items || [];
        ddActive = -1;

        if (!ddItems.length) return closeDropdown();

        symptomDropdown.innerHTML = ddItems.slice(0, 10).map((it, idx) => {
            const id = it.id;
            const label = it.label || it.common_name || it.name || "Symptom";

            return `
        <div class="dd-item" data-idx="${idx}" role="option">
            <div class="dd-left">
            <div class="dd-name">${escapeHtml(label)}</div>
            </div>
            <div class="dd-id">Add</div>
        </div>
        `;
        }).join("");

        symptomDropdown.classList.remove("is-hidden");

        symptomDropdown.querySelectorAll(".dd-item").forEach((el) => {
            el.addEventListener("click", () => {
                const idx = Number(el.dataset.idx);
                selectFromDropdown(idx);
            });
        });
    }

    function selectFromDropdown(idx) {
        const it = ddItems[idx];
        if (!it) return;
        const id = it.id;
        const label = it.label || it.common_name || it.name || it.id || "Symptom";

        if (selected.some((s) => s.id === id)) {
            showToast("Already added", "warning");
        } else {
            selected.push({ id, label });
            renderSelected();
            showToast("Added", "success");
        }

        symptomQuery.value = "";
        closeDropdown();
    }

    function setActive(idx) {
        const nodes = Array.from(symptomDropdown.querySelectorAll(".dd-item"));
        nodes.forEach((n) => n.classList.remove("is-active"));
        if (idx >= 0 && idx < nodes.length) {
            nodes[idx].classList.add("is-active");
            nodes[idx].scrollIntoView({ block: "nearest" });
        }
        ddActive = idx;
    }


    async function searchSymptoms(phrase) {
        return apiJSON(`/api/infermedica/search?phrase=${encodeURIComponent(phrase)}`, { method: "GET" });
    }

    function renderSymptomResults(items = []) {
        symptomResults.innerHTML = "";
        if (!items.length) {
            symptomResults.innerHTML = `<div class="muted">No results.</div>`;
            return;
        }

        for (const it of items.slice(0, 10)) {
            const id = it.id || it.infermedica_id;
            const label = it.label || it.common_name || it.name || it.id || "Symptom";
            const el = document.createElement("div");
            el.className = "symptom-item";
            el.innerHTML = `
        <div>
          <div class="symptom-name">${escapeHtml(label)}</div>
        </div>
        <button class="btn btn-primary" type="button">Add</button>
      `;
            el.querySelector("button").addEventListener("click", () => {
                if (!id) return showToast("This symptom has no id", "warning");
                if (selected.some((s) => s.id === id)) return showToast("Already added", "warning");
                selected.push({ id, label });
                renderSelected();
                showToast("Added", "success");
            });
            symptomResults.appendChild(el);
        }
    }

    btnSymptomSearch.addEventListener("click", async () => {
        const q = String(symptomQuery.value || "").trim();
        if (!q) return showToast("Type a symptom first", "warning");
        try {
            symptomResults.innerHTML = `<div class="muted">Searching…</div>`;
            const data = await searchSymptoms(q);
            const list = Array.isArray(data) ? data : (data?.items || data?.results || []);
            renderSymptomResults(list);
        } catch (e) {
            console.error(e);
            symptomResults.innerHTML = "";
            showToast(e.message || "Search failed", "error");
        }
    });

    symptomQuery.addEventListener("input", () => {
        const q = String(symptomQuery.value || "").trim();
        clearTimeout(searchTimer);

        if (q.length < 2) {
            closeDropdown();
            return;
        }

        searchTimer = setTimeout(async () => {
            try {
                const data = await searchSymptoms(q);
                const list = Array.isArray(data) ? data : (data?.items || data?.results || []);
                openDropdown(list);
            } catch (e) {
                console.error(e);
                closeDropdown();
            }
        }, 250);
    });

    symptomQuery.addEventListener("keydown", (e) => {
        const isOpen = !symptomDropdown.classList.contains("is-hidden");
        if (!isOpen) {
            if (e.key === "Enter") {
                e.preventDefault();
                btnSymptomSearch.click();
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(Math.min(ddActive + 1, Math.min(ddItems.length, 10) - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(Math.max(ddActive - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (ddActive >= 0) selectFromDropdown(ddActive);
        } else if (e.key === "Escape") {
            closeDropdown();
        }
    });


    document.addEventListener("click", (e) => {
        if (!e.target.closest(".combo")) closeDropdown();
    });

    renderSelected();

    btnStartInterview.addEventListener("click", async () => {
        try {
            const evidence = selected.map((s) => ({ id: s.id, choice_id: "present", name: s.label }));
            const data = await apiJSON("/api/interview/start", {
                method: "POST",
                body: JSON.stringify({ evidence }),
            });

            caseId = data.caseId;
            caseIdLabel.textContent = String(caseId);
            emergencyLabel.textContent = data.has_emergency_evidence ? "YES" : "NO";
            renderConditions(data.conditions || []);
            currentQuestion = data.question || null;

            if (data.should_stop || !currentQuestion) {
                currentQuestion = null;
                questionBox.innerHTML = `<div class="muted">No more questions. Click “Finish & generate results”.</div>`;
                showToast("You can finish now.", "success");
            } else {
                renderQuestion(currentQuestion);
            }

            setStep(2);
            showToast("Interview started", "success");
        } catch (e) {
            console.error(e);
            showToast(e.message || "Could not start interview", "error");
        }
    });

    function renderQuestion(q) {
        const type = q.type || "single";
        const title = q.text || "Question";
        const items = Array.isArray(q.items) ? q.items : [];

        if (type === "single") {
            const it = items[0];
            if (!it) {
                questionBox.innerHTML = `<div class="muted">No question items. You can finish.</div>`;
                return;
            }
            questionBox.innerHTML = `
            <div class="q-title">${escapeHtml(title)}</div>
            <div class="q-item">
                <div class="q-text">${escapeHtml(it.name || it.id)}</div>
                <div class="choices">
                ${["present", "absent", "unknown"].map(ch => `
                    <label class="choice">
                    <input type="radio" name="q_single_${escapeHtml(it.id)}" value="${ch}" />
                    <span>${ch}</span>
                    </label>
                `).join("")}
                </div>
            </div>
            `;
            return;
        }

        if (type === "group_single") {
            questionBox.innerHTML = `
            <div class="q-title">${escapeHtml(title)}</div>
            <div class="q-group-single">
                ${items.map(it => `
                <label class="gs-option">
                    <input type="radio" name="q_group_single" value="${escapeHtml(it.id)}">
                    <span>${escapeHtml(it.name || it.id)}</span>
                </label>
                `).join("")}
            </div>
            <div class="muted" style="margin-top:8px;">Choose exactly one option.</div>
            `;
            return;
        }

        if (type === "group_multiple") {
            questionBox.innerHTML = `
            <div class="q-title">${escapeHtml(title)}</div>
            <div class="q-group-multiple">
                ${items.map(it => `
                <label class="gm-option">
                    <input type="checkbox" name="q_multi_${escapeHtml(it.id)}">
                    <span>${escapeHtml(it.name || it.text || it.id)}</span>
                </label>
                `).join("")}
            </div>
            <div class="muted" style="margin-top:8px;">Select all that apply.</div>
            `;
            return;
        }

        questionBox.innerHTML = `<div class="muted">Unsupported question type: ${escapeHtml(type)}</div>`;
    }


    function collectEvidenceFromQuestion(q) {
        const type = q.type || "single";
        const items = Array.isArray(q.items) ? q.items : [];

        if (type === "single") {
            const it = items[0];
            if (!it) return [];

            const name = `q_single_${it.id}`;
            const picked = document.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
            if (!picked) return [];

            return [{ id: it.id, choice_id: picked.value, name: it.name || it.text || it.id }];
        }


        if (type === "group_single") {
            const picked = document.querySelector(`input[name="q_group_single"]:checked`);
            if (!picked) return [];
            const chosen = items.find(x => x.id === picked.value);
            return [{ id: picked.value, choice_id: "present", name: chosen?.name || chosen?.text || chosen?.id }];
        }

        if (type === "group_multiple") {
            return items.map(it => {
                const checked = document.querySelector(`input[name="q_multi_${CSS.escape(it.id)}"]`)?.checked;
                return { id: it.id, choice_id: checked ? "present" : "absent", name: it.name || it.text || it.id };
            });
        }

        return [];
    }


    btnSubmitAnswer.addEventListener("click", async () => {
        if (!caseId) return showToast("No case yet", "warning");
        if (!currentQuestion) return showToast("No active question", "warning");

        const evidence = collectEvidenceFromQuestion(currentQuestion);
        if (!evidence.length) return showToast("Select at least one answer", "warning");

        try {
            const data = await apiJSON(`/api/interview/${caseId}/answer`, {
                method: "POST",
                body: JSON.stringify({ evidence }),
            });

            emergencyLabel.textContent = data.has_emergency_evidence ? "YES" : "NO";
            renderConditions(data.conditions || []);
            currentQuestion = data.question || null;

            if (data.should_stop || !currentQuestion) {
                currentQuestion = null;
                questionBox.innerHTML = `<div class="muted">No more questions. Click “Finish & generate results”.</div>`;
                showToast("Questions completed", "success");
                return;
            }

            renderQuestion(currentQuestion);
            showToast("Saved", "success");
        } catch (e) {
            console.error(e);
            showToast(e.message || "Answer failed", "error");
        }
    });

    let resultPollTimer = null;

    async function fetchCaseDetail(caseId) {
        return apiJSON(`/api/cases/${caseId}`, { method: "GET" });
    }

    function pickTriageLevel(detail) {
        return detail?.ai_artifact?.differentials?.infermedica?.triage?.triage_level
            || detail?.ai_artifact?.differentials?.infermedica?.triage?.triage
            || null;
    }

    function pickFinalDiagnosis(detail) {
        const cons = detail?.consensus;

        const direct =
            cons?.final_label ||
            cons?.final_answer ||
            cons?.result_label ||
            cons?.diagnosis ||
            null;
        if (direct) return direct;

        const key =
            cons?.final_option_id ||
            cons?.final_option_key ||
            cons?.final_choice ||
            cons?.choice_key ||
            null;

        const options = detail?.ai_artifact?.differentials?.public?.options || [];
        if (key && options.length) {
            const opt = options.find(o => String(o.key).toUpperCase() === String(key).toUpperCase());
            if (opt?.label) return opt.label;
        }

        const top = detail?.ai_artifact?.differentials?.infermedica?.conditions?.[0];
        return top?.common_name || top?.name || top?.id || "—";
    }

    function adviceFromTriage(triage) {
        const t = String(triage || "").toLowerCase();

        if (t.includes("emergency") || t.includes("seek_now")) {
            return "Go to emergency services now or call 112.";
        }
        if (t.includes("consultation_24") || t.includes("consultation_2") || t.includes("within_24")) {
            return "Book a medical consultation within 24 hours.";
        }
        if (t.includes("within_24_48") || t.includes("24–48")) {
            return "Book a medical consultation within 24–48 hours.";
        }
        if (t.includes("within_72")) {
            return "Book a medical consultation within 72 hours.";
        }
        if (t.includes("self_care")) {
            return "Self-care is usually appropriate. Monitor symptoms and seek help if they worsen.";
        }
        return "Follow standard medical advice and seek help if symptoms worsen.";
    }

    function renderPendingResults(caseId) {
        resultsBox.innerHTML = `
        <div class="note">
        <span class="dot" aria-hidden="true"></span>
        <span><strong>We are sending your case to clinicians for review.</strong> This may take a few minutes.</span>
        </div>
        <div class="muted" style="margin-top:10px;">
        Status: <strong>Review in progress…</strong>
        </div>
    `;
    }

    function renderFinalResults(detail) {
        const cons = detail?.consensus || null;

        const diagnosis = cons?.final_diagnosis || "—";
        const urgency = cons?.final_urgency || "—";

        const summary = cons?.patient_summary || `After review, the most likely explanation is: ${diagnosis}.`;
        const expl = cons?.patient_explanation || "";
        const notes = cons?.clinician_notes || "";

        resultsBox.innerHTML = `
        <div class="note">
            <span class="dot" aria-hidden="true"></span>
            <span><strong>Clinician review completed.</strong></span>
            </div>

            <div class="kv"><div class="k">Most likely</div><div class="v">${escapeHtml(String(diagnosis))}</div></div>
            <div class="kv"><div class="k">Urgency</div><div class="v">${escapeHtml(String(urgency))}</div></div>

            <div class="divider"></div>

            <div class="q-title">What this means (simple)</div>
            <div class="muted" style="white-space:pre-wrap">${escapeHtml(summary)}</div>

            ${expl ? `
            <div class="divider"></div>
            <div class="q-title">Explanation</div>
            <div class="muted" style="white-space:pre-wrap">${escapeHtml(expl)}</div>
            ` : ""}

            ${notes ? `
            <div class="divider"></div>
            <div class="q-title">Some clinician notes</div>
            <div class="muted" style="white-space:pre-wrap">${escapeHtml(notes)}</div>
            ` : ""}
        `;
    }


    async function startResultPolling(caseId) {
        clearInterval(resultPollTimer);

        const tick = async () => {
            try {
                const detail = await fetchCaseDetail(caseId);
                const status = String(detail?.status || "").toLowerCase();

                if (
                    detail?.consensus ||
                    status === "consensus_ready" || status === "closed"
                ) {
                    renderFinalResults(detail);
                    clearInterval(resultPollTimer);
                    resultPollTimer = null;
                }

            } catch (e) {
                console.error("Polling error:", e);
            }
        };

        await tick();
        resultPollTimer = setInterval(tick, 4000);
    }

    btnFinish.addEventListener("click", async () => {
        if (!caseId) return showToast("No case yet", "warning");
        if (isFinishing) return;

        isFinishing = true;
        btnFinish.disabled = true;

        try {
            const data = await apiJSON(`/api/interview/${caseId}/finish`, { method: "POST" });

            if (data?.generating) {
                renderPendingResults(caseId);
                setStep(3);
                startResultPolling(caseId);
                showToast("Generating…", "success");
                return;
            }

            const triage = data?.infermedica?.triage || {};
            const triLevel = triage.triage_level || triage.triage || "—";

            const mirText = data?.mir?.public?.question_text || "—";

            resultsBox.innerHTML = `
        <div class="kv"><div class="k">Case ID</div><div class="v">${escapeHtml(String(data.caseId || caseId))}</div></div>
        <div class="kv"><div class="k">Triage level</div><div class="v">${escapeHtml(String(triLevel))}</div></div>

        <div class="divider"></div>

        <div class="q-title">MIR-style question (educational)</div>
        <pre style="white-space:pre-wrap; margin:0; font-weight:700; color:rgba(18,58,99,0.9)">${escapeHtml(mirText)}</pre>
      `;

            setStep(3);

            const detail = await fetchCaseDetail(caseId);
            renderAiReadyPending(detail);
            startResultPolling(caseId);

            showToast("Results generated", "success");
        } catch (e) {
            console.error(e);
            btnFinish.disabled = false;
            isFinishing = false;
            showToast(e.message || "Finish failed", "error");
        }
    });
});
