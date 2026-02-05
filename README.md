# TesaHealth
**Final Degree Project (TFG) — AI-assisted symptom intake + MIR-style vignette + multi-clinician consensus**

Repository: https://github.com/oliviagallego/TesaHealth

---

## 1. Description

TesaHealth is my Final Degree Project (TFG). It is a web application that collects patient-reported symptoms and, through externally orchestrated AI tools, generates two main outputs: a MIR-style clinical vignette and a set of differential diagnoses with an associated urgency level.

On the clinician side, there is a dedicated portal where multiple professionals can review each case independently (blindly) and submit their assessments. The different responses for the same case are then aggregated and evaluated, and a final consensus option is produced and sent back to the patient.

For the patient, the final output is meant to be a safe orientation, not a replacement for a real consultation. It includes the proposed diagnosis, the urgency level, a recommended care pathway, and a short explanation of how that conclusion was reached.

The application is designed with a future scenario in mind where it could be integrated into a diagnostic kiosk with medical devices connected to it, so the TesaHealth framework would not only receive symptoms (as in this prototype) but also real clinical data. In that setting, the kiosk would include a patient login verified with an official ID, and clinicians from anywhere in the world could answer cases—optionally receiving monetary rewards to acknowledge their contribution.

Overall, the goal of this approach is to help optimize the health system by reducing waiting lists, enabling pre-assessment that stratifies urgency, improving interoperability and person-centred care (PCC), and increasing health literacy. It combines clinical AI with specialized human oversight to deliver more reliable and trustworthy results.

---

## 2. Project status
Functional academic prototype (local environment), including:
- Role-based areas: **Patient / Clinician / Admin**
- Login/registration with **JWT** + basic access control
- Case creation, clinician review, and **consensus** workflow
- SQLite persistence with Sequelize models
- PDF report generation (Puppeteer)
- Hospital search & map integration (Leaflet + OpenStreetMap/Overpass)
- Notifications / real-time support (Socket.io)

> Note: Some AI-generated artefacts require API keys. If `OPENAI_API_KEY` is not set, the system returns **stub outputs** for the MIR vignette so you can still test the flow.

---

## 3. Author
**Olivia Gallego Toscano**  
For commercial licensing or collaboration inquiries: **o.gallego1@usp.ceu.es**

---

## 4. Tech stack
### Front-end
- HTML5, CSS3, JavaScript
- Leaflet + OpenStreetMap (maps)

### Back-end
- Node.js, Express
- Sequelize + SQLite
- Socket.io (real-time notifications)
- jsonwebtoken (JWT), bcrypt
- multer (uploads)
- nodemailer (emails)
- puppeteer (PDF generation)
- dotenv, cors, node-fetch

### AI services (part of the system)
- Infermedica (differential / triage-oriented outputs)
- OpenAI (structured clinical text generation)

---

## 5. Repository structure

```text
TesaHealth/
├── backend/                   # Node.js server + REST API + Socket.io
│   ├── app.js                 # Express configuration + routes + serves static frontend
│   ├── server.js              # Server bootstrap + Socket.io + DB sync/init
│   ├── routes/                # Endpoints (auth, cases, clinician, admin, geo...)
│   ├── middleware/            # Auth + role/permission guards
│   ├── database/
│   │   ├── index.js           # Sequelize + SQLite (tesahealth.db)
│   │   └── model/             # Sequelize models (User, Case, Review, Consensus, etc.)
│   ├── utils/                 # Email, PDF, OpenAI, Infermedica, consensus logic, etc.
│   └── seed/                  # Initial admin seed (demo/local)
├── frontend/                  # Static web (served by the backend)
│   ├── index.html
│   ├── pages/                 # Role-based screens (patient/clinician/admin)
│   ├── css/
│   ├── js/
│   └── assets/                # Images and fonts
├── docs/                      # Documentation (mockups, ER, implementation notes)
└── README.md                  # This file
```

---

## 6. Install dependencies
1) Clone the repository:
```
git clone https://github.com/oliviagallego/TesaHealth.git
cd TesaHealth
```
2) Install backend dependencies:
```
cd backend
npm install
```

---
## 8. Run locally

From `backend/`:

```bash
npm start
````

This will:

* start the server on `http://localhost:3001/`
* create the SQLite database at `backend/database/tesahealth.db` (if not present)
* run the initial seed logic (see `backend/seed/`)

Open in your browser:

* `http://localhost:3001/`

For development (auto-reload):

```bash
npm run dev
```

---

## 9. Main roles (quick overview)

* **Patient:** create cases, review history, access outputs and PDFs, search hospitals.
* **Clinician:** complete clinician profile, review cases independently, submit assessment.
* **Admin:** verify clinician/admin accounts, audit/log views, account management.

---

## 10. Important disclaimer

This is an **academic prototype**. Outputs are intended as **orientation only** and do not replace professional medical advice, diagnosis, or treatment.

---

## 11. Copyright & usage

Copyright © 2025 Olivia Gallego Toscano. All rights reserved.

No part of this software or its source code may be used, reproduced, modified, or distributed in any form or by any means without the prior express written permission of the author.

For commercial licensing or collaboration inquiries, please contact: **[o.gallego1@usp.ceu.es](mailto:o.gallego1@usp.ceu.es)**

```

