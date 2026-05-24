const express = require("express");
const cors    = require("cors");
const fs      = require("fs");
const path    = require("path");
const csv     = require("csv-parser");
const { exec } = require("child_process");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname, "..", "dataset");

function loadCsv(filename) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(path.join(DATA_DIR, filename))
      .pipe(csv())
      .on("data", (data) => rows.push(data))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

app.get("/", (req, res) => {
  res.json({
    project: "AI-Based Interactive Dashboard for Environmental Monitoring",
    description: "Backend/API Gateway for raw data, clean data, summaries, anomaly detection results, and visualization-ready data.",
    endpoints: [
      "/api/data/raw",
      "/api/data/clean",
      "/api/summary",
      "/api/anomaly",
      "/api/visualization",
      "/api/insight",
      "/api/run-detection",
      "/api/health"
    ]
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "environmental-monitoring-api", timestamp: new Date().toISOString() });
});

app.get("/api/data/raw", async (req, res) => {
  try {
    const data = await loadCsv("raw_environmental_data.csv");
    const limit = Number(req.query.limit || 100000);
    const sensorId = req.query.sensor_id;
    let result = data;
    if (sensorId) result = result.filter(row => row.sensor_id === sensorId);
    res.json({ count: Math.min(limit, result.length), total: result.length, data: result.slice(0, limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/data/clean", async (req, res) => {
  try {
    const data = await loadCsv("clean_environmental_data.csv");
    const limit = Number(req.query.limit || 200);
    const sensorId = req.query.sensor_id;
    let result = data;
    if (sensorId) result = result.filter(row => row.sensor_id === sensorId);
    res.json({ count: Math.min(limit, result.length), total: result.length, data: result.slice(0, limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/summary", async (req, res) => {
  try {
    const summary = await loadCsv("summary_by_sensor.csv");
    const metricsPath = path.join(__dirname, "..", "paper_support", "model_metrics.json");
    const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
    res.json({ model_metrics: metrics, summary_by_sensor: summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/anomaly", async (req, res) => {
  try {
    const data = await loadCsv("anomaly_results.csv");
    const limit = Number(req.query.limit || 200);
    const sensorId = req.query.sensor_id;
    let result = data.filter(row => Number(row.anomaly_prediction) === 1);
    if (sensorId) result = result.filter(row => row.sensor_id === sensorId);
    res.json({ count: Math.min(limit, result.length), total_anomalies: result.length, data: result.slice(0, limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/visualization", async (req, res) => {
  try {
    const data = await loadCsv("anomaly_results.csv");
    const sensorId = req.query.sensor_id || "ENV-01";
    const variable = req.query.variable || "temperature_c";
    const allowedVariables = ["temperature_c","humidity_pct","co2_ppm","pm25_ugm3","light_lux","noise_db","environmental_risk_index"];
    if (!allowedVariables.includes(variable)) {
      return res.status(400).json({ error: "Invalid variable", allowedVariables });
    }
    const result = data
      .filter(row => row.sensor_id === sensorId)
      .map(row => ({
        timestamp: row.timestamp,
        sensor_id: row.sensor_id,
        location: row.location,
        value: toNumber(row[variable]),
        variable,
        anomaly_prediction: toNumber(row.anomaly_prediction),
        anomaly_score: toNumber(row.anomaly_score)
      }));
    res.json({ sensor_id: sensorId, variable, total: result.length, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── AI INSIGHT ───────────────────────────────────────────────────────────────
app.get("/api/insight", async (req, res) => {
  try {
    const anomalyData = await loadCsv("anomaly_results.csv");
    const summaryData = await loadCsv("summary_by_sensor.csv");
    const metricsPath = path.join(__dirname, "..", "paper_support", "model_metrics.json");
    const metrics     = JSON.parse(fs.readFileSync(metricsPath, "utf8"));

    // Hitung anomali per sensor
    const anomaliesOnly = anomalyData.filter(r => Number(r.anomaly_prediction) === 1);

    const perSensor = {};
    anomaliesOnly.forEach(r => {
      const key = r.sensor_id || "Unknown";
      perSensor[key] = (perSensor[key] || 0) + 1;
    });

    // Sensor dengan anomali terbanyak
    const worstSensor = Object.entries(perSensor)
      .sort((a, b) => b[1] - a[1])[0];

    // Sensor dengan rata-rata suhu tertinggi
    const hotSensor = summaryData
      .map(s => ({ sensor: s.sensor_id || s.location, avgTemp: parseFloat(s.avg_temperature_c) || 0 }))
      .sort((a, b) => b.avgTemp - a.avgTemp)[0];

    // Severity level berdasarkan total anomali
    const totalAnomalies = anomaliesOnly.length;
    let severity, severityColor, action;

    if (totalAnomalies === 0) {
      severity      = "NORMAL";
      severityColor = "#27ae60";
      action        = "Tidak ada tindakan khusus diperlukan. Sistem berjalan normal.";
    } else if (totalAnomalies <= 10) {
      severity      = "WASPADA";
      severityColor = "#f39c12";
      action        = "Pantau sensor secara berkala. Lonjakan suhu terdeteksi tapi masih terkendali.";
    } else if (totalAnomalies <= 30) {
      severity      = "PERINGATAN";
      severityColor = "#e67e22";
      action        = "Periksa kondisi ruangan dan ventilasi. Anomali cukup sering terjadi.";
    } else {
      severity      = "KRITIS";
      severityColor = "#e74c3c";
      action        = "Tindakan segera diperlukan! Lonjakan suhu ekstrem terdeteksi berkali-kali.";
    }

    // Generate narasi
    const narrative = [
      `Sistem mendeteksi total ${totalAnomalies} anomali suhu dari seluruh sensor menggunakan metode Delta, Z-Score, dan Rolling Mean.`,
      worstSensor
        ? `Sensor ${worstSensor[0]} menjadi sensor paling bermasalah dengan ${worstSensor[1]} anomali terdeteksi.`
        : null,
      hotSensor
        ? `Rata-rata suhu tertinggi tercatat di ${hotSensor.sensor} (${hotSensor.avgTemp.toFixed(1)}°C).`
        : null,
      `Model memiliki Precision ${metrics.precision}, Recall ${metrics.recall}, dan F1 Score ${metrics.f1_score}.`,
    ].filter(Boolean);

    res.json({
      severity,
      severityColor,
      totalAnomalies,
      worstSensor: worstSensor ? { sensor_id: worstSensor[0], count: worstSensor[1] } : null,
      hotSensor:   hotSensor   ? hotSensor : null,
      action,
      narrative,
      metrics,
      anomaliesPerSensor: perSensor,
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── RUN DETECTION ────────────────────────────────────────────────────────────
app.post("/api/run-detection", (req, res) => {
  const scriptPath = path.join(__dirname, "..", "ai_model", "train_anomaly_model.py");
  console.log(`[run-detection] Menjalankan: python "${scriptPath}"`);
  exec(`python3 "${scriptPath}"`, { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      console.error("[run-detection] Error:", stderr || err.message);
      return res.status(500).json({ success: false, message: "Deteksi anomali gagal.", error: stderr || err.message });
    }
    console.log("[run-detection] Selesai:\n", stdout);
    res.json({ success: true, message: "Deteksi anomali selesai. Data sudah diperbarui.", output: stdout });
  });
});

app.listen(PORT, () => {
  console.log(`Environmental Monitoring API running at http://localhost:${PORT}`);
});