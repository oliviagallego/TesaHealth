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
    qp.set("next", "/pages/clinician_profile.html");
    window.location.href = "/pages/login.html?" + qp.toString();
    return;
  }

  $("btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    setTimeout(() => (window.location.href = "/pages/login.html?role=CLINICIAN"), 150);
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

  const medicalRegNo = $("medicalRegNo");
  const provCollege = $("provCollege");
  const specialty = $("specialty");
  const mirYear = $("mirYear");
  const liabilityInsurance = $("liabilityInsurance");
  const verificationStatus = $("verificationStatus");

  function setFormEnabled(enabled) {
    const els = form?.querySelectorAll("input, select, textarea, button");
    els?.forEach((el) => {
      if (el.id === "email" || el.id === "verificationStatus") el.readOnly = true;
      el.disabled = !enabled;
    });
    if (btnSaveProfile) btnSaveProfile.disabled = !enabled;
  }

  let initialSnapshot = "";
  function snapshot() {
    return JSON.stringify({
      name: name?.value || "",
      surname: surname?.value || "",
      phone: phone?.value || "",
      address: address?.value || "",
      dob: dob?.value || "",
      medicalRegNo: medicalRegNo?.value || "",
      provCollege: provCollege?.value || "",
      specialty: specialty?.value || "",
      mirYear: mirYear?.value || "",
      liabilityInsurance: liabilityInsurance?.value || "",
    });
  }

  function prettyStatus(s) {
    const v = String(s || "").toLowerCase();
    if (!v) return "—";
    if (v === "verified") return "Verified";
    if (v === "pending") return "Pending";
    if (v === "needs_fix") return "Needs fix";
    if (v === "denied") return "Denied";
    if (v === "missing") return "Missing";
    return s;
  }

  async function loadProfile() {
    const data = await apiJSON("/api/clinician/profile", { method: "GET" });

    const u = data.user || {};
    const c = data.clinician || {};

    if (name) name.value = u.name || "";
    if (surname) surname.value = u.surname || "";
    if (email) email.value = u.email || "";
    if (phone) phone.value = u.phone || "";
    if (address) address.value = u.address || "";
    if (dob) dob.value = u.dob || "";

    if (medicalRegNo) medicalRegNo.value = c.medical_college_reg_no || "";
    if (provCollege) provCollege.value = c.provincial_college || "";
    if (specialty) specialty.value = c.specialty || "";
    if (mirYear) mirYear.value = c.mir_year ?? "";
    if (liabilityInsurance) liabilityInsurance.value = c.liability_insurance || "";

    if (verificationStatus) verificationStatus.value = prettyStatus(c.verification_status);

    initialSnapshot = snapshot();
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (btnSaveProfile) btnSaveProfile.disabled = true;

      await apiJSON("/api/clinician/profile", {
        method: "PUT",
        body: JSON.stringify({
          user: {
            name: name?.value.trim(),
            surname: surname?.value.trim(),
            phone: phone?.value.trim(),
            address: address?.value.trim(),
            dob: dob?.value,
          },
          clinician: {
            medical_college_reg_no: (medicalRegNo?.value || "").trim() || null,
            provincial_college: (provCollege?.value || "").trim() || null,
            specialty: (specialty?.value || "").trim() || null,
            mir_year: mirYear?.value ? Number(mirYear.value) : null,
            liability_insurance: (liabilityInsurance?.value || "").trim() || null,
          },
        }),
      });

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
      const msg = String(e?.message || "");
      if (msg.includes("401") || msg.toLowerCase().includes("token")) {
        localStorage.removeItem("token");
        const qp = new URLSearchParams();
        qp.set("role", "CLINICIAN");
        qp.set("next", "/pages/clinician_profile.html");
        window.location.href = "/pages/login.html?" + qp.toString();
        return;
      }
      showToast(e.message || "Could not load profile", "error");
    } finally {
      setFormEnabled(true);
      if (email) email.readOnly = true;
      if (verificationStatus) verificationStatus.readOnly = true;
    }
  })();

  const apPwStep1 = $("apPwStep1");
  const apPwStep2 = $("apPwStep2");
  const apNewPassword = $("apNewPassword");
  const apNewPassword2 = $("apNewPassword2");
  const apCode = $("apCode");

  $("btnApSendCode")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const np1 = String(apNewPassword?.value || "").trim();
      const np2 = String(apNewPassword2?.value || "").trim();

      if (np1.length < 8) return showToast("Password must be at least 8 characters", "warning");
      if (np1 !== np2) return showToast("Passwords do not match", "warning");

      $("btnApSendCode").disabled = true;

      await apiJSON("/api/auth/password-change/request", {
        method: "POST",
        body: JSON.stringify({ new_password: np1 }),
      });

      apPwStep1?.classList.add("is-hidden");
      apPwStep2?.classList.remove("is-hidden");
      if (apCode) {
        apCode.value = "";
        apCode.focus();
      }

      showToast("Code sent to your email", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Could not send code", "error");
    } finally {
      $("btnApSendCode").disabled = false;
    }
  });

  $("btnApBackPw")?.addEventListener("click", (e) => {
    e.preventDefault();
    apPwStep2?.classList.add("is-hidden");
    apPwStep1?.classList.remove("is-hidden");
    if (apCode) apCode.value = "";
  });

  $("btnApChangePassword")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const code = String(apCode?.value || "").trim();
      const np1 = String(apNewPassword?.value || "").trim();

      if (!/^\d{6}$/.test(code)) return showToast("Enter a valid 6-digit code", "warning");
      if (np1.length < 8) return showToast("Password must be at least 8 characters", "warning");

      $("btnApChangePassword").disabled = true;

      await apiJSON("/api/auth/password-change/confirm", {
        method: "POST",
        body: JSON.stringify({ code, new_password: np1 }),
      });

      showToast("Password updated", "success");

      if (apCode) apCode.value = "";
      if (apNewPassword) apNewPassword.value = "";
      if (apNewPassword2) apNewPassword2.value = "";
      apPwStep2?.classList.add("is-hidden");
      apPwStep1?.classList.remove("is-hidden");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Password change failed", "error");
    } finally {
      $("btnApChangePassword").disabled = false;
    }
  });

  const apDelStep1 = $("apDelStep1");
  const apDelStep2 = $("apDelStep2");
  const apDeleteCode = $("apDeleteCode");

  $("btnApSendDeleteCode")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      $("btnApSendDeleteCode").disabled = true;

      await apiJSON("/api/auth/account-delete/request", {
        method: "POST",
        body: JSON.stringify({}),
      });

      apDelStep1?.classList.add("is-hidden");
      apDelStep2?.classList.remove("is-hidden");
      if (apDeleteCode) {
        apDeleteCode.value = "";
        apDeleteCode.focus();
      }

      showToast("Delete code sent to your email", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Could not send delete code", "error");
    } finally {
      $("btnApSendDeleteCode").disabled = false;
    }
  });

  $("btnApBackDelete")?.addEventListener("click", (e) => {
    e.preventDefault();
    apDelStep2?.classList.add("is-hidden");
    apDelStep1?.classList.remove("is-hidden");
    if (apDeleteCode) apDeleteCode.value = "";
  });

  $("btnApConfirmDelete")?.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const code = String(apDeleteCode?.value || "").trim();
      if (!/^\d{6}$/.test(code)) return showToast("Enter a valid 6-digit code", "warning");

      const ok = window.confirm("This will delete/disable your account. Are you sure?");
      if (!ok) return;

      $("btnApConfirmDelete").disabled = true;

      await apiJSON("/api/auth/account-delete/confirm", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      showToast("Account deleted", "success");
      localStorage.removeItem("token");
      setTimeout(() => (window.location.href = "/pages/login.html?role=CLINICIAN"), 350);
    } catch (err) {
      console.error(err);
      showToast(err.message || "Account delete failed", "error");
    } finally {
      $("btnApConfirmDelete").disabled = false;
    }
  });

});
