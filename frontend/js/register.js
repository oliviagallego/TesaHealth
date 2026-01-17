document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);

  const nextFromUrl = params.get("next") || "";
  const forcedRoleRaw = (params.get("role") || "").toUpperCase();
  const stage = params.get("stage") || "";
  const verifiedEmail = params.get("email") || "";
  const finishToken = params.get("finish_token") || "";
  const isFinishMode = stage === "3" && verifiedEmail && finishToken;

  const fixToken = params.get("fix_token") || "";
  const isFixMode = stage === "fix" && !!fixToken;

  const waitMode = stage === "waiting";
  const waitStatus = params.get("status") || "pending";

  const API_BASE = (window.location.hostname === "localhost")
    ? "http://localhost:3001"
    : "";

  function apiUrl(path) {
    return `${API_BASE}${path}`;
  }

  const registerShell = document.getElementById("registerShell");

  const consentLayer = document.getElementById("consentLayer");
  const consentDetails = document.getElementById("consentDetails");
  const consentCustomize = document.getElementById("consentCustomize");
  const consentAccept = document.getElementById("consentAccept");
  const consentDeny = document.getElementById("consentDeny");
  const consentClose = document.getElementById("consentClose");

  const consentPrivacy = document.getElementById("consentPrivacy");
  const consentDataProcessing = document.getElementById("consentDataProcessing");
  const consentPush = document.getElementById("consentPush");

  const form = document.getElementById("registerForm");
  const roleChooser = document.getElementById("roleChooser");
  const roleSelect = document.getElementById("roleSelect");
  const roleHidden = document.getElementById("roleHidden");

  const step1 = document.querySelector('[data-step="1"]');
  const step2 = document.querySelector('[data-step="2"]');
  const step2b = document.querySelector('[data-step="2b"]');
  const step3 = document.querySelector('[data-step="3"]');
  const step4 = document.querySelector('[data-step="4"]');
  const step5 = document.querySelector('[data-step="5"]');
  const dots = document.querySelectorAll(".stepper-dot");

  const btnNext1 = document.getElementById("btnNext1");
  const btnNext2 = document.getElementById("btnNext2");
  const btnBack2 = document.getElementById("btnBack2");
  const btnBack2b = document.getElementById("btnBack2b");
  const btnBack3 = document.getElementById("btnBack3");
  const btnNext3 = document.getElementById("btnNext3");
  const btnBack4 = document.getElementById("btnBack4");
  const btnNext4 = document.getElementById("btnNext4");
  const btnBack5 = document.getElementById("btnBack5");

  const patientFields = document.getElementById("patientFields");
  const clinicianFields = document.getElementById("clinicianFields");
  const adminFields = document.getElementById("adminFields");

  const patientStep5 = document.getElementById("patientStep5");
  const clinicianStep5 = document.getElementById("clinicianStep5");
  const adminStep5 = document.getElementById("adminStep5");

  const emailInput = document.getElementById("email");
  const phoneInput = document.getElementById("phone");
  const passInput = document.getElementById("password");

  const commonName = document.getElementById("commonName");
  const commonSurname = document.getElementById("commonSurname");
  const commonAddress = document.getElementById("commonAddress");
  const commonDob = document.getElementById("commonDob");
  const commonPhone = document.getElementById("commonPhone");

  const pSex = document.getElementById("pSex");
  const pregnantWrap = document.getElementById("pregnantWrap");
  const pPregnant = document.getElementById("pPregnant");
  const pWeight = document.getElementById("pWeight");
  const pHeight = document.getElementById("pHeight");

  const pSmoking = document.getElementById("pSmoking");
  const pHbp = document.getElementById("pHbp");
  const pDiabetes = document.getElementById("pDiabetes");
  const pChronic = document.getElementById("pChronic");
  const pSurgery = document.getElementById("pSurgery");
  const pAllergies = document.getElementById("pAllergies");
  const pMeds = document.getElementById("pMeds");

  const cRegNumber = document.getElementById("cRegNumber");
  const cProvCollege = document.getElementById("cProvCollege");
  const cSpecialty = document.getElementById("cSpecialty");
  const cMirYear = document.getElementById("cMirYear");
  const cInsurance = document.getElementById("cInsurance");
  const cDocs = document.getElementById("cDocs");

  const bmiHint = document.getElementById("bmiHint");
  const bmiBox = document.getElementById("bmiBox");
  const bmiText = document.getElementById("bmiText");

  function toggleBmi() {
    bmiBox?.classList.toggle("is-hidden");
    if (bmiBox && !bmiBox.classList.contains("is-hidden")) renderBmiInfo();
  }

  bmiHint?.addEventListener("click", toggleBmi);
  bmiHint?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleBmi();
    }
  });

  pWeight?.addEventListener("input", () => bmiBox && !bmiBox.classList.contains("is-hidden") && renderBmiInfo());
  pHeight?.addEventListener("input", () => bmiBox && !bmiBox.classList.contains("is-hidden") && renderBmiInfo());

  const toast = document.getElementById("toast");
  function showToast(msg, type = "success") {
    toast.className = `toast show ${type}`;
    toast.textContent = msg;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 3001);
  }

  const allowedRoles = new Set(["PATIENT", "CLINICIAN", "ADMIN"]);
  const forcedRole = allowedRoles.has(forcedRoleRaw) ? forcedRoleRaw : "";

  function getCurrentRole() {
    return (forcedRole || roleHidden.value || (roleSelect?.value || "")).toUpperCase();
  }

  function setRole(role) {
    const r = (role || "").toUpperCase();
    roleHidden.value = r;
    if (roleSelect) roleSelect.value = r;

    patientFields?.classList.toggle("is-hidden", r !== "PATIENT");
    clinicianFields?.classList.toggle("is-hidden", r !== "CLINICIAN");
    adminFields?.classList.toggle("is-hidden", r !== "ADMIN");

    patientStep5?.classList.toggle("is-hidden", r !== "PATIENT");
    clinicianStep5?.classList.toggle("is-hidden", r !== "CLINICIAN");
    adminStep5?.classList.toggle("is-hidden", r !== "ADMIN");
  }

  function setStep(n) {
    const all = [step1, step2, step2b, step3, step4, step5].filter(Boolean);
    all.forEach(s => s.classList.add("is-hidden"));
    document.querySelector(`[data-step="${n}"]`)?.classList.remove("is-hidden");

    const num = n === "2b" ? 2 : Number(n);
    dots.forEach((d, idx) => d.classList.toggle("is-active", idx === num - 1));
  }

  function openRegister() {
    consentLayer?.classList.add("is-hidden");
    registerShell?.classList.remove("is-hidden");
    if (forcedRole) btnNext1?.focus();
    else roleSelect?.focus();
  }

  function computeBmi(weightKg, heightCm) {
    const w = Number(weightKg);
    const h = Number(heightCm);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    const m = h / 100;
    return w / (m * m);
  }

  function bmiCategory(bmi) {
    if (bmi < 18.5) return { label: "Underweight", hint: "This can be linked to low energy or nutrient deficits." };
    if (bmi < 25) return { label: "Healthy range", hint: "This range is associated with the lowest health risk for most adults." };
    if (bmi < 30) return { label: "Overweight", hint: "Small lifestyle changes can make a big difference." };
    return { label: "Obesity", hint: "Consider medical advice for a personalized plan." };
  }

  function renderBmiInfo() {
    const bmi = computeBmi(pWeight?.value, pHeight?.value);
    if (!bmi) {
      bmiText.textContent =
        "To calculate your BMI, enter your weight (kg) and height (cm). BMI is a simple ratio that estimates whether your weight is in a healthy range for your height.";
      return;
    }
    const rounded = Math.round(bmi * 10) / 10;
    const cat = bmiCategory(bmi);
    bmiText.innerHTML = `
      <div style="margin-bottom:6px;">Your BMI is <strong>${rounded}</strong>.</div>
      <div style="margin-bottom:8px;">Category: <strong>${cat.label}</strong>.</div>
      <div style="color:rgba(18,58,99,0.78); line-height:1.55;">
        ${cat.hint}<br/><br/>
        <strong>Ranges:</strong>
        <br/>• Underweight: &lt; 18.5
        <br/>• Healthy: 18.5–24.9
        <br/>• Overweight: 25–29.9
        <br/>• Obesity: ≥ 30
        <br/><br/>
        BMI is a helpful guide, but it doesn’t measure muscle, bone, or body fat distribution.
      </div>
    `;
  }

  let fixSubmitHooked = false;

  function stepForFixKey(key, role) {
    const step3Keys = new Set(["name", "surname", "address", "dob", "phone"]);
    const step4Clinician = new Set([
      "medical_college_reg_no",
      "provincial_college",
      "specialty",
      "mir_year",
      "liability_insurance",
    ]);

    if (key === "documents") return "5";
    if (step3Keys.has(key)) return "3";
    if (role === "CLINICIAN" && step4Clinician.has(key)) return "4";
    return "3";
  }

  async function initFixMode() {
    const role = (params.get("role") || "").toUpperCase();
    const fix_token = params.get("fix_token") || "";
    const focus = (params.get("focus") || "").trim();

    if (!allowedRoles.has(role)) throw new Error("Invalid role for fix mode.");
    if (!fix_token) throw new Error("Missing fix_token.");

    const r = await fetch(
      apiUrl(`/api/auth/verification-fix/load?role=${encodeURIComponent(role)}&fix_token=${encodeURIComponent(fix_token)}`)
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "Could not load fix data");

    const fields = Array.isArray(data.fields) ? data.fields : [];
    if (!fields.length) throw new Error("No fields to fix were provided by admin.");

    setRole(role);

    const u = data.user || {};
    const p = data.profile || {};

    if (commonName) commonName.value = u.name || "";
    if (commonSurname) commonSurname.value = u.surname || "";
    if (commonAddress) commonAddress.value = u.address || "";
    if (commonDob) commonDob.value = (u.dob || "").slice(0, 10);
    if (commonPhone) commonPhone.value = u.phone || "";

    if (role === "CLINICIAN") {
      if (cRegNumber) cRegNumber.value = p.medical_college_reg_no || "";
      if (cProvCollege) cProvCollege.value = p.provincial_college || "";
      if (cSpecialty) cSpecialty.value = p.specialty || "";
      if (cMirYear) cMirYear.value = (p.mir_year ?? "") === null ? "" : String(p.mir_year ?? "");
      if (cInsurance) cInsurance.value = p.liability_insurance || "";
    }

    document.querySelectorAll("#registerForm .field").forEach(w => w.classList.add("is-locked"));
    document.querySelectorAll("#registerForm input, #registerForm select, #registerForm textarea").forEach(el => {
      const tag = el.tagName;
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (tag === "SELECT" || type === "file" || type === "date") el.disabled = true;
      else el.readOnly = true;
    });

    const firstKey = (focus && fields.includes(focus)) ? focus : fields[0];
    let firstWrap = null;

    for (const key of fields) {
      const wrap = document.querySelector(`#registerForm [data-fix="${CSS.escape(key)}"]`);
      if (!wrap) continue;

      const ctrl = wrap.querySelector("input,select,textarea");
      if (!ctrl) continue;

      wrap.classList.add("needs-fix");
      wrap.classList.remove("is-locked");

      const tag = ctrl.tagName;
      const type = (ctrl.getAttribute("type") || "").toLowerCase();
      if (tag === "SELECT" || type === "file" || type === "date") ctrl.disabled = false;
      else ctrl.readOnly = false;

      if (!firstWrap && key === firstKey) firstWrap = wrap;
    }

    const targetStep = stepForFixKey(firstKey, role);
    setStep(targetStep);

    setTimeout(() => {
      firstWrap?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);

    if (!fixSubmitHooked) {
      fixSubmitHooked = true;

      form?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const USER_KEYS = new Set(["name", "surname", "phone", "address", "dob"]);
        const userPatch = {};
        const profilePatch = {};

        for (const key of fields) {
          const wrap = document.querySelector(`#registerForm [data-fix="${CSS.escape(key)}"]`);
          const ctrl = wrap?.querySelector("input,select,textarea");
          if (!ctrl) continue;

          let val = ctrl.value;
          if (key === "mir_year") val = val ? Number(val) : null;

          if (USER_KEYS.has(key)) userPatch[key] = val;
          else profilePatch[key] = val;
        }

        const rr = await fetch(apiUrl("/api/auth/verification-fix/submit"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, fix_token, user: userPatch, profile: profilePatch }),
        });
        const out = await rr.json().catch(() => ({}));
        if (!rr.ok) return showToast(out?.error || "Could not submit corrections", "error");

        showToast("Corrections submitted. Waiting for admin review.", "success");
        setTimeout(() => {
          window.location.href = "/pages/login.html?role=" + encodeURIComponent(role);
        }, 900);
      }, { once: true });
    }
  }

  function lockControl(el) {
    if (!el) return;
    const wrap = el.closest(".field");
    wrap?.classList.add("is-locked");

    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "date") el.disabled = true;
    else el.readOnly = true;

    el.setAttribute("aria-readonly", "true");
  }

  async function prefillFromExistingAccount() {
    if (!isFinishMode) return;

    const role = String(params.get("role") || "").toUpperCase();
    if (!role || !verifiedEmail || !finishToken) return;

    try {
      const url =
        apiUrl(`/api/auth/prefill?email=${encodeURIComponent(verifiedEmail)}` +
          `&role=${encodeURIComponent(role)}` +
          `&finish_token=${encodeURIComponent(finishToken)}`);

      const r = await fetch(url);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return;
      if (!data.found) return;

      const u = data.user || {};

      if (commonName) commonName.value = u.name || "";
      if (commonSurname) commonSurname.value = u.surname || "";
      if (commonAddress) commonAddress.value = u.address || "";
      if (commonDob) commonDob.value = (u.dob || "").slice(0, 10);
      if (commonPhone) commonPhone.value = u.phone || "";

      lockControl(commonName);
      lockControl(commonSurname);
      lockControl(commonAddress);
      lockControl(commonDob);
      lockControl(commonPhone);

      showToast(
        `We filled your details from your existing account (${data.source_role || "previous"}).`,
        "success"
      );
    } catch (e) {
      console.warn("prefill failed:", e);
    }
  }

  consentCustomize?.addEventListener("click", () => consentDetails?.classList.toggle("is-hidden"));
  consentDeny?.addEventListener("click", () => (window.location.href = "/"));
  consentClose?.addEventListener("click", () => (window.location.href = "/"));
  consentAccept?.addEventListener("click", async () => {
    if (consentPrivacy) consentPrivacy.checked = true;
    if (consentDataProcessing) consentDataProcessing.checked = true;

    openRegister();

    if (isFinishMode) {
      setStep(3);
      await prefillFromExistingAccount();
    }

    if (isFixMode) {
      await initFixMode().catch(err => {
        console.error(err);
        showToast(err.message || "Fix mode failed", "error");
      });
    }
  });

  if (forcedRole) {
    if (roleChooser) roleChooser.style.display = "none";
    setRole(forcedRole);
  } else {
    if (roleChooser) roleChooser.style.display = "block";
    roleSelect?.addEventListener("change", () => setRole(roleSelect.value));
  }

  pSex?.addEventListener("change", () => {
    const female = String(pSex.value) === "W";
    pregnantWrap?.classList.toggle("is-hidden", !female);
    if (!female && pPregnant) pPregnant.value = "";
  });

  btnNext1?.addEventListener("click", () => {
    const r = getCurrentRole();
    if (!allowedRoles.has(r)) return showToast("Please select a role", "warning");
    localStorage.setItem("intendedRole", r);
    setStep(2);
    emailInput?.focus();
  });

  btnBack2?.addEventListener("click", () => setStep(1));
  btnBack2b?.addEventListener("click", () => setStep(2));
  btnBack3?.addEventListener("click", () => setStep(2));
  btnBack4?.addEventListener("click", () => setStep(3));
  btnBack5?.addEventListener("click", () => setStep(4));

  btnNext3?.addEventListener("click", () => setStep(4));
  btnNext4?.addEventListener("click", () => setStep(5));

  btnNext2?.addEventListener("click", async () => {
    const role = getCurrentRole();
    const email = (emailInput?.value || "").trim();
    const password = passInput?.value || "";

    if (!email || !password) return showToast("Email and password are required", "warning");

    const consents = {
      privacy: Boolean(consentPrivacy?.checked),
      data_processing: Boolean(consentDataProcessing?.checked),
      push: Boolean(consentPush?.checked),
    };
    if (!consents.privacy || !consents.data_processing) return showToast("Privacy + Data processing consents are required", "warning");

    const checkRes = await fetch(apiUrl("/api/auth/check"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const checkData = await checkRes.json().catch(() => ({}));
    if (!checkRes.ok) return showToast(checkData?.error || "Check failed", "error");
    if (checkData.exists) return showToast("Account already exists for this role", "error");

    const startRes = await fetch(apiUrl("/api/auth/register-start"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, email, password, consents }),
    });
    const startData = await startRes.json().catch(() => ({}));
    if (!startRes.ok) return showToast(startData?.error || "Registration start failed", "error");

    document.getElementById("confirmEmailLabel").textContent = email;
    setStep("2b");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isFixMode) return;

    const role = getCurrentRole();
    if (!allowedRoles.has(role)) return showToast("Invalid role", "error");

    if (waitMode && waitStatus !== "needs_fix") {
      showToast("Your account is pending verification. Please wait for approval.", "warning");
      return;
    }

    if (!finishToken || !verifiedEmail || stage !== "3") {
      return showToast("Please confirm your email first (open the link we sent you).", "warning");
    }

    const name = (commonName?.value || "").trim();
    const surname = (commonSurname?.value || "").trim();
    const address = (commonAddress?.value || "").trim();
    const dob = commonDob?.value || "";
    const phone = (commonPhone?.value || "").trim();

    if (!name || !surname || !address || !dob || !phone) {
      return showToast("Name, surname, address, date of birth and phone are required", "warning");
    }

    const payload = {
      finish_token: finishToken,
      email: verifiedEmail,
      role,
      user: { name, surname, address, dob, phone },
      patient: null,
      clinician: null,
      admin: null,
    };

    if (role === "PATIENT") {
      payload.patient = {
        sex: pSex?.value || null,
        height: pHeight?.value ? Number(pHeight.value) : null,
        weight: pWeight?.value ? Number(pWeight.value) : null,
        pregnant: (pPregnant?.value || "") === "yes",

        smoking: pSmoking?.value || "na",
        high_blood_pressure: pHbp?.value || "na",
        diabetes: pDiabetes?.value || "na",
        chronic_condition: (pChronic?.value || "").trim() || null,
        prior_surgery: (pSurgery?.value || "").trim() || null,
        allergies: (pAllergies?.value || "").trim() || null,
        medications: (pMeds?.value || "").trim() || null,
      };
    }

    if (role === "CLINICIAN") {
      payload.clinician = {
        medical_college_reg_no: (cRegNumber?.value || "").trim() || null,
        provincial_college: (cProvCollege?.value || "").trim() || null,
        specialty: (cSpecialty?.value || "").trim() || null,
        mir_year: cMirYear?.value ? Number(cMirYear.value) : null,
        liability_insurance: (cInsurance?.value || "").trim() || null,
      };
    }

    if (role === "ADMIN") {
      payload.admin = { note: "pending" };
    }

    try {

      let res;

      if (role === "CLINICIAN") {
        const fd = new FormData();

        fd.append("finish_token", finishToken);
        fd.append("email", verifiedEmail);
        fd.append("role", role);

        fd.append("user", JSON.stringify(payload.user || {}));
        fd.append("clinician", JSON.stringify(payload.clinician || {}));

        const files = Array.from(cDocs?.files || []);
        files.forEach(f => fd.append("clinician_docs", f));
        res = await fetch(apiUrl("/api/auth/register-finish"), {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch(apiUrl("/api/auth/register-finish"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(data?.error || "Finish failed", "error");

      localStorage.setItem("intendedRole", role);

      if (data.pending) {
        setStep(5);
        showToast("Thanks! Your account is pending verification. We'll notify you soon.", "success");
        return;
      }

      localStorage.setItem("token", data.token);

      if (role === "PATIENT") window.location.href = "/pages/area_patient.html";
      else if (role === "CLINICIAN") window.location.href = "/pages/area_clinician.html";
      else window.location.href = "/pages/area_admin.html";
    } catch (err) {
      console.error(err);
      showToast("Server connection error", "error");
    }
  });

  setStep(1);

  if (allowedRoles.has(forcedRoleRaw)) setRole(forcedRoleRaw);

  if (stage === "3" && verifiedEmail) {
    if (emailInput) emailInput.value = verifiedEmail;
  }

  if (isFinishMode) {
    if (emailInput) {
      emailInput.value = verifiedEmail;
      emailInput.setAttribute("readonly", "true");
    }
  }

  if (waitMode) {
    if (allowedRoles.has(forcedRoleRaw)) setRole(forcedRoleRaw);

    openRegister();
    setStep(waitStatus === "needs_fix" ? 4 : 5);

    btnBack5?.classList.add("is-hidden");

    showToast(
      waitStatus === "needs_fix"
        ? "We need additional documentation. Please continue your registration."
        : "Your account is pending verification. Please wait for approval.",
      "success"
    );
  }

});
