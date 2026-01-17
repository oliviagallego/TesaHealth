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
    qp.set("role", "PATIENT");
    qp.set("next", "/pages/patient_profile.html");
    window.location.href = "/pages/login.html?" + qp.toString();
    return;
  }

  $("btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    setTimeout(() => (window.location.href = "/pages/login.html?role=PATIENT"), 150);
  });

  function authHeaders(extra = {}) {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra };
  }

  async function apiJSON(url, opts = {}) {
    const res = await fetch(url, { ...opts, headers: authHeaders(opts.headers || {}) });

    const ct = res.headers.get("content-type") || "";
    let data = {};
    if (ct.includes("application/json")) {
      data = await res.json().catch(() => ({}));
    } else {
      const text = await res.text().catch(() => "");
      data = { error: text || `Request failed: ${res.status}` };
    }

    if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
    return data;
  }


  const form = $("profileForm");
  const btnSaveProfile = $("btnSaveProfile");

  const name = $("name");
  const surname = $("surname");
  const email = $("email");
  const phone = $("phone");
  const address = $("address");
  const dob = $("dob");

  const sex = $("sex");
  const pregnantWrap = $("pregnantWrap");
  const pregnant = $("pregnant");
  const weight = $("weight");
  const height = $("height");

  const smoking = $("smoking");
  const hbp = $("hbp");
  const diabetes = $("diabetes");
  const chronic = $("chronic");
  const surgery = $("surgery");
  const allergies = $("allergies");
  const meds = $("meds");

  function setFormEnabled(enabled) {
    const els = form?.querySelectorAll("input, select, textarea, button");
    els?.forEach((el) => {
      if (el.id === "email") el.readOnly = true;
      el.disabled = !enabled;
    });
    if (btnSaveProfile) btnSaveProfile.disabled = !enabled;
  }

  function togglePregnant() {
    const isFemale = String(sex?.value || "") === "W";
    pregnantWrap?.classList.toggle("is-hidden", !isFemale);
    if (!isFemale && pregnant) pregnant.value = "no";
  }
  sex?.addEventListener("change", togglePregnant);

  let initialSnapshot = "";
  function snapshot() {
    return JSON.stringify({
      name: name?.value || "",
      surname: surname?.value || "",
      phone: phone?.value || "",
      address: address?.value || "",
      dob: dob?.value || "",
      sex: sex?.value || "",
      pregnant: pregnant?.value || "",
      height: height?.value || "",
      weight: weight?.value || "",
      smoking: smoking?.value || "",
      hbp: hbp?.value || "",
      diabetes: diabetes?.value || "",
      chronic: chronic?.value || "",
      surgery: surgery?.value || "",
      allergies: allergies?.value || "",
      meds: meds?.value || "",
    });
  }

  async function loadProfile() {
    const data = await apiJSON("/api/patient/profile", { method: "GET" });

    const u = data.user || {};
    const p = data.patient || {};

    if (name) name.value = u.name || "";
    if (surname) surname.value = u.surname || "";
    if (email) email.value = u.email || "";
    if (phone) phone.value = u.phone || "";
    if (address) address.value = u.address || "";
    if (dob) dob.value = u.dob || "";

    if (sex) sex.value = p.sex || "";
    if (pregnant) pregnant.value = p.pregnant ? "yes" : "no";
    if (height) height.value = p.height ?? "";
    if (weight) weight.value = p.weight ?? "";

    if (smoking) smoking.value = p.smoking || "na";
    if (hbp) hbp.value = p.high_blood_pressure || "na";
    if (diabetes) diabetes.value = p.diabetes || "na";

    if (chronic) chronic.value = p.chronic_condition || "";
    if (surgery) surgery.value = p.prior_surgery || "";
    if (allergies) allergies.value = p.allergies || "";
    if (meds) meds.value = p.medications || "";

    togglePregnant();

    initialSnapshot = snapshot();
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (btnSaveProfile) btnSaveProfile.disabled = true;

      await apiJSON("/api/patient/profile", {
        method: "PUT",
        body: JSON.stringify({
          user: {
            name: name?.value.trim(),
            surname: surname?.value.trim(),
            phone: phone?.value.trim(),
            address: address?.value.trim(),
            dob: dob?.value,
          },
          patient: {
            sex: sex?.value || null,
            pregnant: (pregnant?.value || "") === "yes",
            height: height?.value ? Number(height.value) : null,
            weight: weight?.value ? Number(weight.value) : null,
            smoking: smoking?.value || "na",
            high_blood_pressure: hbp?.value || "na",
            diabetes: diabetes?.value || "na",
            chronic_condition: (chronic?.value || "").trim() || null,
            prior_surgery: (surgery?.value || "").trim() || null,
            allergies: (allergies?.value || "").trim() || null,
            medications: (meds?.value || "").trim() || null,
          },
        }),
      });

      initialSnapshot = snapshot();
      showToast("Profile updated", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Update failed", "error");
    } finally {
      if (btnSaveProfile) btnSaveProfile.disabled = false;
    }
  });


  (async () => {
    try {
      setFormEnabled(false);
      await loadProfile();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Could not load profile", "error");
    } finally {
      setFormEnabled(true);
      if (email) email.readOnly = true;
    }
  })();

  const pwStep1 = $("pwStep1");
  const pwStep2 = $("pwStep2");
  const newPassword = $("newPassword");
  const pwCode = $("pwCode");

  $("btnSendCode")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const np = String(newPassword.value || "").trim();
      if (np.length < 8) return showToast("Password must be at least 8 characters", "warning");

      $("btnSendCode").disabled = true;

      await apiJSON("/api/auth/password-change/request", {
        method: "POST",
        body: JSON.stringify({ new_password: np }),
      });

      pwStep1.classList.add("is-hidden");
      pwStep2.classList.remove("is-hidden");
      pwCode.value = "";
      pwCode.focus();

      showToast("Code sent to your email", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Could not send code", "error");
    } finally {
      $("btnSendCode").disabled = false;
    }
  });

  $("btnBackPw")?.addEventListener("click", (e) => {
    e.preventDefault();
    pwStep2.classList.add("is-hidden");
    pwStep1.classList.remove("is-hidden");
    pwCode.value = "";
  });

  $("btnConfirmPw")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const code = String(pwCode.value || "").trim();
      const np = String(newPassword.value || "").trim();

      if (!code) return showToast("Enter the code", "warning");
      if (np.length < 8) return showToast("Password must be at least 8 characters", "warning");

      $("btnConfirmPw").disabled = true;

      await apiJSON("/api/auth/password-change/confirm", {
        method: "POST",
        body: JSON.stringify({ code, new_password: np }),
      });

      showToast("Password updated", "success");

      pwCode.value = "";
      newPassword.value = "";
      pwStep2.classList.add("is-hidden");
      pwStep1.classList.remove("is-hidden");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Password change failed", "error");
    } finally {
      $("btnConfirmPw").disabled = false;
    }
  });


  (function wireAccountDelete() {
    const step1 = document.getElementById("apDelStep1");
    const step2 = document.getElementById("apDelStep2");
    const btnSend = document.getElementById("btnApSendDeleteCode");
    const btnBack = document.getElementById("btnApBackDelete");
    const btnConfirm = document.getElementById("btnApConfirmDelete");
    const codeInput = document.getElementById("apDeleteCode");

    if (!btnSend || !step1 || !step2) return;

    const toggle = (step2On) => {
      step1.classList.toggle("is-hidden", step2On);
      step2.classList.toggle("is-hidden", !step2On);
    };

    btnSend.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        btnSend.disabled = true;

        await apiJSON("/api/auth/account-delete/request", {
          method: "POST",
          body: JSON.stringify({}),
        });

        toggle(true);
        if (codeInput) {
          codeInput.value = "";
          codeInput.focus();
        }
        showToast("Delete code sent to your email", "success");
      } catch (err) {
        console.error(err);
        showToast(err.message || "Could not send delete code", "error");
      } finally {
        btnSend.disabled = false;
      }
    });

    btnBack?.addEventListener("click", (e) => {
      e.preventDefault();
      if (codeInput) codeInput.value = "";
      toggle(false);
    });

    btnConfirm?.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        const code = String(codeInput?.value || "").trim();
        if (!/^\d{6}$/.test(code)) return showToast("Enter a valid 6-digit code", "warning");

        const ok = window.confirm("This will delete/disable your account. Are you sure?");
        if (!ok) return;

        btnConfirm.disabled = true;

        await apiJSON("/api/auth/account-delete/confirm", {
          method: "POST",
          body: JSON.stringify({ code }),
        });

        showToast("Account deleted", "success");
        localStorage.removeItem("token");
        setTimeout(() => (window.location.href = "/pages/login.html?role=PATIENT"), 350);
      } catch (err) {
        console.error(err);
        showToast(err.message || "Account delete failed", "error");
      } finally {
        btnConfirm.disabled = false;
      }
    });

    toggle(false);
  })();


});
