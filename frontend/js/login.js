document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const nextFromUrl = params.get("next") || "";
  const forcedRole = (params.get("role") || "").toUpperCase();

  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passInput = document.getElementById("password");
  const titleEl = document.getElementById("loginTitle");
  const registerLink = document.getElementById("goRegister");
  const roleSelect = document.getElementById("roleSelect");
  const roleWrap = document.getElementById("roleWrap");


  const toast = document.getElementById("toast");
  function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 3001);
  }

  const verified = params.get("verified");
  if (verified === "1") {
    showToast("Email verified! You can sign in now.", "success");
  } else if (verified === "0") {
    showToast("Email verification failed. Please try again.", "error");
  }

  const allowedRoles = new Set(["PATIENT", "CLINICIAN", "ADMIN"]);

  if (roleSelect) {
    roleSelect.value = "PATIENT";

    if (allowedRoles.has(forcedRole)) roleSelect.value = forcedRole;
  }

  if (roleWrap && roleSelect && allowedRoles.has(forcedRole)) {
    roleSelect.disabled = true;
  }

  if (forcedRole && titleEl) {
    if (forcedRole === "ADMIN") titleEl.textContent = "Sign in to Admin";
    else if (forcedRole === "CLINICIAN") titleEl.textContent = "Sign in to Clinician";
    else if (forcedRole === "PATIENT") titleEl.textContent = "Sign in to Patient";
    else titleEl.textContent = "Sign in";
  }

  if (registerLink) {
    const regParams = new URLSearchParams();
    if (nextFromUrl) regParams.set("next", nextFromUrl);
    if (allowedRoles.has(forcedRole)) regParams.set("role", forcedRole);
    registerLink.href = "/pages/register.html" + (regParams.toString() ? `?${regParams}` : "");
  }

  async function fetchMe(token) {
    const res = await fetch("/api/profiles/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Failed to load profile");
    return data;
  }

  function roleToPath(roleUpper) {
    if (roleUpper === "PATIENT") return "/pages/area_patient.html";
    if (roleUpper === "CLINICIAN") return "/pages/area_clinician.html";
    if (roleUpper === "ADMIN") return "/pages/area_admin.html";
    return "/";
  }

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = (emailInput?.value || "").trim();
    const password = passInput?.value || "";

    const chosenRole = allowedRoles.has(forcedRole)
      ? forcedRole
      : (roleSelect?.value || "PATIENT").toUpperCase();

    if (!email || !password) {
      showToast("Please enter email and password.", "warning");
      return;
    }

    if (!allowedRoles.has(chosenRole)) {
      showToast("Missing or invalid role.", "warning");
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role: chosenRole }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {

        if (data?.code === "VERIFICATION_PENDING") {
          const qp = new URLSearchParams();
          qp.set("stage", "waiting");
          qp.set("role", data.role || chosenRole);
          qp.set("status", data.status || "pending");
          qp.set("email", email);
          window.location.href = `/pages/register.html?${qp.toString()}`;
          return;
        }

        showToast(data?.error || "Login failed.", "error");
        return;
      }


      const token = data?.token;
      if (!token) {
        showToast("Login failed (missing token).", "error");
        return;
      }

      localStorage.setItem("token", token);

      const me = await fetchMe(token);

      let next = nextFromUrl;

      if (!next) {
        if (allowedRoles.has(chosenRole)) {
          next = roleToPath(chosenRole);
        } else {
          const lp = (me?.user?.last_profile || "").toLowerCase();
          if (lp === "patient") next = roleToPath("PATIENT");
          else if (lp === "clinician") next = roleToPath("CLINICIAN");
          else if (lp === "admin") next = roleToPath("ADMIN");
          else {
            const intended = (localStorage.getItem("intendedRole") || "").toUpperCase();
            next = intended ? roleToPath(intended) : "/";
          }
        }
      }

      if (chosenRole === "ADMIN" && !me?.profiles?.admin) {
        localStorage.removeItem("token");
        showToast("This account has no Admin profile.", "error");
        return;
      }
      if (chosenRole === "CLINICIAN" && !me?.profiles?.clinician) {
        localStorage.removeItem("token");
        showToast("This account has no Clinician profile.", "error");
        return;
      }
      if (chosenRole === "PATIENT" && !me?.profiles?.patient) {
        localStorage.removeItem("token");
        showToast("This account has no Patient profile.", "error");
        return;
      }

      window.location.href = next;
    } catch (err) {
      console.error(err);
      showToast("Server connection error.", "error");
    }
  });

});
