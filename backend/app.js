const express = require('express');
const cors = require('cors');
const path = require("path");


const publicRoutes = require("./routes/public");
const authRoutes = require('./routes/auth');
const profilesRoutes = require('./routes/profiles');
const casesRoutes = require('./routes/cases');
const clinicianRoutes = require('./routes/clinician');
const adminRoutes = require('./routes/admin');
const interviewRoutes = require("./routes/interview");
const infermedicaRoutes = require("./routes/infermedica");
const patientProfileRoutes = require("./routes/patient");
const geoRouter = require("./routes/geo");
const notificationsRoutes = require("./routes/notifications");
const app = express();

app.use(cors());

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const rootDir = path.join(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");

app.use(express.static(frontendDir));

app.get("/", (req, res) => res.sendFile(path.join(frontendDir, "pages", "index.html")));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/public", publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profilesRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/clinician', clinicianRoutes);
app.use('/api/admin', adminRoutes);
app.use("/api/interview", interviewRoutes);
app.use("/api/infermedica", infermedicaRoutes);
app.use("/api/patient", patientProfileRoutes);
app.use("/api/geo", geoRouter);
app.use("/api/notifications", notificationsRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
