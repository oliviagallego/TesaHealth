const crypto = require("crypto");

function headers(interviewId) {
  return {
    "App-Id": process.env.INFERMEDICA_APP_ID,
    "App-Key": process.env.INFERMEDICA_APP_KEY,
    "Interview-Id": interviewId,
    "Content-Type": "application/json",
    ...(process.env.INFERMEDICA_DEV_MODE === "true" ? { "Dev-Mode": "true" } : {}),
  };
}

function newInterviewId() {
  return crypto.randomUUID();
}
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

async function infermedicaPost(path, body, interviewId) {
  const base = "https://api.infermedica.com/v3";
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: headers(interviewId),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Infermedica ${path} failed: ${r.status} ${t}`);
  }
  return r.json();
}

async function searchSymptom({ phrase, ageValue = 30, sex = "female", interviewId }) {
  const url = new URL("https://api.infermedica.com/v3/search");
  url.searchParams.set("phrase", phrase);
  url.searchParams.set("age.value", String(ageValue));
  url.searchParams.set("sex", sex);
  url.searchParams.set("types", "symptom");

  const r = await fetch(url.toString(), { method: "GET", headers: headers(interviewId) });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Infermedica search failed: ${r.status} ${t}`);
  }
  return r.json();
}

async function diagnosis({ sex, ageValue, evidence, interviewId }) {
  const body = {
    sex,
    age: { value: ageValue },
    evidence,
  };

  const r = await fetch("https://api.infermedica.com/v3/diagnosis", {
    method: "POST",
    headers: headers(interviewId),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Infermedica diagnosis failed: ${r.status} ${t}`);
  }
  return r.json();
}

async function triage({ sex, ageValue, evidence, interviewId }) {
  const body = {
    sex,
    age: { value: ageValue },
    evidence,
  };

  const r = await fetch("https://api.infermedica.com/v3/triage", {
    method: "POST",
    headers: headers(interviewId),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Infermedica triage failed: ${r.status} ${t}`);
  }
  return r.json();
}



module.exports = { newInterviewId, searchSymptom, diagnosis, triage, infermedicaPost };

