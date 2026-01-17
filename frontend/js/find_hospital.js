document.addEventListener("DOMContentLoaded", () => {
  const toast = document.getElementById("toast");
  const $ = (id) => document.getElementById(id);

  const API_BASE =
    localStorage.getItem("apiBase") ||
    (location.port === "3001" ? location.origin : "http://localhost:3001");

  const apiUrl = (p) => (p.startsWith("http") ? p : API_BASE + p);

  function showToast(message, type = "success") {
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  const rawToken = localStorage.getItem("token");
  const token = rawToken ? rawToken.replace(/^"(.+)"$/, "$1") : null;

  if (!token) {
    const qp = new URLSearchParams();
    qp.set("role", "PATIENT");
    qp.set("next", "/pages/find_hospital.html");
    window.location.href = "/pages/login.html?" + qp.toString();
    return;
  }

  $("btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    setTimeout(() => (window.location.href = "/pages/login.html?role=PATIENT"), 200);
  });

  function authHeaders() {
    return { Authorization: `Bearer ${token}` };
  }

  async function apiGet(path, { auth = true } = {}) {
    const res = await fetch(apiUrl(path), {
      headers: auth ? authHeaders() : {},
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
    return data;
  }

  (async () => {
    try {
      await apiGet("/api/geo/ping", { auth: false });
    } catch (e) {
      console.error("API ping failed:", e);
      showToast(
        `No conecto con el backend (${API_BASE}). Abre esta página desde http://localhost:3001/pages/find_hospital.html o fija localStorage.apiBase`,
        "error"
      );
    }
  })();

  let overpassController = null;
  let isLoading = false;

  const map = L.map("map", { zoomControl: true }).setView([40.4168, -3.7038], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  let userMarker = null;
  let placesLayer = L.layerGroup().addTo(map);
  let origin = null;

  function setUserMarker(lat, lon) {
    origin = { lat, lon };
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([lat, lon], {
      radius: 7,
      weight: 2,
      color: "#b91c1c",
      fillColor: "#ef4444",
      fillOpacity: 0.9,
    }).addTo(map);
    userMarker.bindPopup("You are here").openPopup();
  }

  function escapeHtml(str = "") {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toKm(meters) {
    return Math.round((meters / 1000) * 10) / 10;
  }

  function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function getTag(tags, keys) {
    for (const k of keys) {
      if (tags && tags[k]) return tags[k];
    }
    return "";
  }

  async function geocodeAddress(q) {
    const data = await apiGet(
      "/api/geo/geocode?" + new URLSearchParams({ q }).toString()
    );
    return { lat: data.lat, lon: data.lon, display: data.display };
  }

  async function fetchPlacesOverpass(lat, lon, radiusMeters, signal) {
    const radiusKm = Math.round(radiusMeters / 1000);

    const res = await fetch(
      apiUrl(
        "/api/geo/hospitals?" +
        new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
          radiusKm: String(radiusKm),
        }).toString()
      ),
      {
        headers: authHeaders(),
        signal,
      }
    );

    const data = await res.json().catch(() => ({}));

    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);

    return { elements: Array.isArray(data.elements) ? data.elements : [] };
  }

  function normalizeOverpassElements(json) {
    const els = Array.isArray(json?.elements) ? json.elements : [];
    const out = [];
    const seen = new Set();

    const bannedName = /centro de salud|centro medico|centro médico|cl[ií]nica|consultorio|ambulatorio|cruz roja|red cross|farmacia|odont/i;

    for (const e of els) {
      const tags = e.tags || {};

      const isHospitalTag = tags.amenity === "hospital" || tags.healthcare === "hospital";
      if (!isHospitalTag) continue;

      const name =
        tags.name || tags["name:es"] || tags["official_name"] || "Unnamed hospital";


      if (bannedName.test(String(name))) continue;

      const lat = e.type === "node" ? e.lat : e.center?.lat;
      const lon = e.type === "node" ? e.lon : e.center?.lon;
      if (typeof lat !== "number" || typeof lon !== "number") continue;

      const id = `${e.type}:${e.id}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const phone = getTag(tags, [
        "phone",
        "contact:phone",
        "telephone",
        "contact:telephone",
        "mobile",
        "contact:mobile",
      ]);

      const website = getTag(tags, ["website", "contact:website"]);

      const addrFull = tags["addr:full"] || "";
      const street = tags["addr:street"] || "";
      const housenumber = tags["addr:housenumber"] || "";
      const city =
        tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "";
      const postcode = tags["addr:postcode"] || "";

      const address =
        addrFull ||
        [street && street + (housenumber ? " " + housenumber : ""), postcode, city]
          .filter(Boolean)
          .join(", ");

      out.push({
        id,
        name,
        lat,
        lon,
        phone,
        website,
        address,
        rawTags: tags,
      });
    }

    return out;
  }


  function hideGmBanner() {
    $("gmBanner")?.classList.add("is-hidden");
  }

  function buildGmapsDirUrl(place) {
    if (!origin) return "#";

    const originStr = `${origin.lat},${origin.lon}`;

    const destinationStr = place.address
      ? `${place.name}, ${place.address}`
      : `${place.lat},${place.lon}`;

    return (
      "https://www.google.com/maps/dir/?" +
      new URLSearchParams({
        api: "1",
        origin: originStr,
        destination: destinationStr,
        travelmode: "driving",
      }).toString()
    );
  }


  function showGmBanner(place) {
    if (!origin) return;
    const gm = $("gmBanner");
    const gmTitle = $("gmTitle");
    const gmSub = $("gmSub");
    const gmOpen = $("gmOpen");

    gmTitle.textContent = place.name || "Selected center";
    gmSub.textContent = `Open directions from your location?`;

    gmOpen.href = buildGmapsDirUrl(place);
    gm.classList.remove("is-hidden");
  }

  $("gmClose")?.addEventListener("click", hideGmBanner);

  function clearPlaces() {
    placesLayer.clearLayers();
    $("resultsList").innerHTML = "";
    $("resultsEmpty").classList.add("is-hidden");
    $("resultsMeta").textContent = "—";
    hideGmBanner();
  }

  function addPlaceMarker(place) {
    const marker = L.marker([place.lat, place.lon]).addTo(placesLayer);
    marker.bindPopup(
      `<strong>${escapeHtml(place.name)}</strong><br/>${escapeHtml(
        place.address || ""
      )}`
    );
    marker.on("click", () => showGmBanner(place));
    return marker;
  }

  function formatPhoneTel(phone) {
    if (!phone) return "";
    return phone.replace(/\s+/g, "");
  }

  function renderList(placesWithDistance) {
    const list = $("resultsList");
    list.innerHTML = "";

    if (!placesWithDistance.length) {
      $("resultsEmpty").classList.remove("is-hidden");
      return;
    }
    $("resultsEmpty").classList.add("is-hidden");

    for (const p of placesWithDistance) {
      const el = document.createElement("div");
      el.className = "result-card";
      el.innerHTML = `
        <div class="result-top">
          <div class="result-name">${escapeHtml(p.name)}</div>
          <div class="result-dist">${escapeHtml(String(p.km))} km</div>
        </div>
        <div class="result-sub">${escapeHtml(
        p.address || "Address not available"
      )}</div>
        <div class="result-actions">
          <button class="btn btn-ghost" type="button" data-action="focus">Show on map</button>
          ${p.phone
          ? `<a class="btn btn-primary" href="tel:${escapeHtml(
            formatPhoneTel(p.phone)
          )}">Call ${escapeHtml(p.phone)}</a>`
          : `<button class="btn btn-ghost" type="button" disabled>No phone</button>`
        }
        <a class="btn btn-ghost" href="${escapeHtml(buildGmapsDirUrl(p))}" target="_blank" rel="noopener">Directions</a>
        </div>
      `;

      el.querySelector('[data-action="focus"]')?.addEventListener("click", (ev) => {
        ev.stopPropagation();
        map.setView([p.lat, p.lon], 15);
      });

      el.addEventListener("click", () => {
        map.setView([p.lat, p.lon], 15);
        showGmBanner(p);
      });

      list.appendChild(el);
    }
  }

  async function runSearchFromOrigin() {
    if (!origin) {
      showToast("Set your address or use your location first", "warning");
      return;
    }
    if (isLoading) return;
    isLoading = true;

    const radiusKm = Math.max(1, Math.min(200, Number($("radiusKm").value || 10)));
    const radiusMeters = Math.round(radiusKm * 1000);

    showToast("Searching nearby hospitals…", "success");
    clearPlaces();

    if (overpassController) overpassController.abort();
    overpassController = new AbortController();

    if ($("btnSearch")) $("btnSearch").disabled = true;
    if ($("btnRefresh")) $("btnRefresh").disabled = true;
    if ($("btnUseMyLocation")) $("btnUseMyLocation").disabled = true;

    try {
      const json = await fetchPlacesOverpass(
        origin.lat,
        origin.lon,
        radiusMeters,
        overpassController.signal
      );

      const places = normalizeOverpassElements(json);

      const placesWithDistance = places
        .map((p) => {
          const meters = haversineMeters(
            { lat: origin.lat, lon: origin.lon },
            { lat: p.lat, lon: p.lon }
          );
          return { ...p, meters, km: toKm(meters) };
        })
        .sort((a, b) => a.meters - b.meters);

      for (const p of placesWithDistance) addPlaceMarker(p);

      const bounds = L.latLngBounds([]);
      bounds.extend([origin.lat, origin.lon]);
      placesWithDistance.slice(0, 150).forEach((p) => bounds.extend([p.lat, p.lon]));
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.15));

      $("resultsMeta").textContent = `${placesWithDistance.length} hospitals found within ${radiusKm} km. Sorted by distance.`;

      renderList(placesWithDistance);

      if (!placesWithDistance.length) showToast("No hospitals found in that radius", "warning");
      else showToast("Results updated", "success");
    } catch (e) {
      console.error(e);

      if (e.name === "AbortError") return;

      if (e.message === "RATE_LIMIT") {
        showToast("Too many searches. Wait 10–20 seconds and try again.", "warning");
        $("resultsMeta").textContent = "Rate limit reached. Try again shortly.";
        return;
      }

      showToast("Could not load hospitals (network/Overpass)", "error");
      $("resultsMeta").textContent = "Search failed. Try again in a moment.";
    } finally {
      isLoading = false;
      if ($("btnSearch")) $("btnSearch").disabled = false;
      if ($("btnRefresh")) $("btnRefresh").disabled = false;
      if ($("btnUseMyLocation")) $("btnUseMyLocation").disabled = false;
    }
  }


  $("btnSearch")?.addEventListener("click", async () => {
    const q = String($("address").value || "").trim();
    if (!q) return showToast("Enter an address", "warning");

    try {
      showToast("Locating address…", "success");
      const r = await geocodeAddress(q);
      if (!r) return showToast("Address not found. Try a more specific one.", "warning");

      setUserMarker(r.lat, r.lon);
      map.setView([r.lat, r.lon], 13);

      await runSearchFromOrigin();
    } catch (e) {
      console.error(e);
      showToast("Geocoding failed. Try again.", "error");
    }
  });

  $("btnUseMyLocation")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Geolocation not available", "warning");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserMarker(lat, lon);
        map.setView([lat, lon], 13);
        await runSearchFromOrigin();
      },
      (err) => {
        console.error(err);
        showToast("Could not access your location (check permissions)", "error");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });

  $("btnRefresh")?.addEventListener("click", runSearchFromOrigin);

  $("address")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("btnSearch")?.click();
    }
  });

  (async () => {
    try {
      await apiGet("/api/profiles/me");
    } catch {
      localStorage.removeItem("token");
      const qp = new URLSearchParams();
      qp.set("role", "PATIENT");
      qp.set("next", "/pages/find_hospital.html");
      window.location.href = "/pages/login.html?" + qp.toString();
    }
  })();
});
