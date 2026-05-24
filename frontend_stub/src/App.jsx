import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, Legend,
} from "recharts";

function App() {
  // ─── STATE ───────────────────────────────────────────────────────────────
  const [summary,   setSummary]   = useState({});
  const [history,   setHistory]   = useState([]);
  const [dataRange, setDataRange] = useState({ min: "", max: "" });
  const [insight,   setInsight]   = useState(null);

  const [isRefreshing,   setIsRefreshing]   = useState(false);
  const [refreshStatus,  setRefreshStatus]  = useState(null);
  const [refreshMessage, setRefreshMessage] = useState("");

  // Filter sementara (belum apply)
  const [selectedLocation,  setSelectedLocation]  = useState("ALL");
  const [selectedParameter, setSelectedParameter] = useState("temperature_c");
  const [selectedMonth,     setSelectedMonth]     = useState("");
  const [dateFrom,          setDateFrom]          = useState("");
  const [dateTo,            setDateTo]            = useState("");

  // Filter yang sudah di-apply
  const [appliedLocation, setAppliedLocation] = useState("ALL");
  const [appliedParam,    setAppliedParam]    = useState("temperature_c");
  const [appliedMonth,    setAppliedMonth]    = useState("");
  const [appliedFrom,     setAppliedFrom]     = useState("");
  const [appliedTo,       setAppliedTo]       = useState("");

  // ─── FETCH DATA ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSummary();
    fetchHistory();
    fetchInsight();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await axios.get("http://localhost:3000/api/summary");
      setSummary(res.data);
    } catch (err) { console.error("Gagal fetch summary:", err); }
  };

  const fetchHistory = async () => {
    try {
      const res  = await axios.get("http://localhost:3000/api/data/raw");
      const data = res.data.data;
      setHistory(data);

      const timestamps = data
        .map((d) => new Date(d.timestamp))
        .filter((d) => !isNaN(d));

      if (timestamps.length) {
        const maxDate     = new Date(Math.max(...timestamps));
        const minDate     = new Date(Math.min(...timestamps));
        const maxDateStr  = maxDate.toISOString().substring(0, 10);
        const minDateStr  = minDate.toISOString().substring(0, 10);
        const maxMonthStr = maxDateStr.slice(0, 7);

        setDataRange({ min: minDateStr, max: maxDateStr });
        setDateFrom(minDateStr);
        setDateTo(maxDateStr);
        setSelectedMonth(maxMonthStr);
        setAppliedFrom(minDateStr);
        setAppliedTo(maxDateStr);
        setAppliedMonth(maxMonthStr);
      }
    } catch (err) { console.error("Gagal fetch history:", err); }
  };

  const fetchInsight = async () => {
    try {
      const res = await axios.get("http://localhost:3000/api/insight");
      setInsight(res.data);
    } catch (err) { console.error("Gagal fetch insight:", err); }
  };

  // ─── HANDLER TOMBOL TAMPILKAN ─────────────────────────────────────────────
  const handleTampilkan = () => {
    setAppliedLocation(selectedLocation);
    setAppliedParam(selectedParameter);
    setAppliedMonth(selectedMonth);
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  };

  // ─── HANDLER TOMBOL REFRESH ANOMALI ──────────────────────────────────────
  const handleRefreshAnomali = async () => {
    setIsRefreshing(true);
    setRefreshStatus(null);
    setRefreshMessage("");
    try {
      const res = await axios.post("http://localhost:3000/api/run-detection");
      setRefreshStatus("success");
      setRefreshMessage(res.data.message || "Deteksi selesai.");
      setTimeout(async () => {
        await fetchSummary();
        await fetchHistory();
        await fetchInsight();
      }, 500);
    } catch (err) {
      setRefreshStatus("error");
      setRefreshMessage(err.response?.data?.error || err.message || "Terjadi kesalahan.");
    } finally {
      setIsRefreshing(false);
      setTimeout(() => { setRefreshStatus(null); setRefreshMessage(""); }, 6000);
    }
  };

  // ─── FILTER LOGIC ─────────────────────────────────────────────────────────
  const filteredByLocAndDate = useMemo(() => {
    return history.filter((item) => {
      const locOk       = appliedLocation === "ALL" || item.location === appliedLocation;
      const itemDateStr = item.timestamp?.substring(0, 10) ?? "";
      let dateOk = true;
      if (appliedFrom && appliedTo) {
        dateOk = itemDateStr >= appliedFrom && itemDateStr <= appliedTo;
      } else if (appliedFrom) {
        dateOk = itemDateStr >= appliedFrom;
      } else if (appliedTo) {
        dateOk = itemDateStr <= appliedTo;
      } else if (appliedMonth) {
        dateOk = itemDateStr.startsWith(appliedMonth);
      }
      return locOk && dateOk;
    });
  }, [history, appliedLocation, appliedFrom, appliedTo, appliedMonth]);

  // ─── RATA-RATA HARIAN UNTUK GRAFIK ────────────────────────────────────────
  const chartData = useMemo(() => {
    const grouped = {};
    filteredByLocAndDate.forEach((item) => {
      const day = item.timestamp?.substring(0, 10);
      if (!day) return;
      if (!grouped[day]) grouped[day] = { timestamp: day, _sum: {}, _count: 0 };
      grouped[day]._count++;
      ["temperature_c","humidity_pct","light_lux","co2_ppm","noise_db"].forEach((key) => {
        grouped[day]._sum[key] = (grouped[day]._sum[key] || 0) + (parseFloat(item[key]) || 0);
      });
    });
    return Object.values(grouped)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map(({ timestamp, _sum, _count }) => ({
        timestamp,
        temperature_c: +(_sum.temperature_c / _count).toFixed(2),
        humidity_pct:  +(_sum.humidity_pct  / _count).toFixed(2),
        light_lux:     +(_sum.light_lux     / _count).toFixed(2),
        co2_ppm:       +(_sum.co2_ppm       / _count).toFixed(2),
        noise_db:      +(_sum.noise_db      / _count).toFixed(2),
      }));
  }, [filteredByLocAndDate]);

  // ─── STATISTIK CARD + RINGKASAN (avg, min, max) ───────────────────────────
  const filteredStats = useMemo(() => {
    if (!filteredByLocAndDate.length) return null;

    const validNums = (key) =>
      filteredByLocAndDate
        .map((d) => parseFloat(d[key]))
        .filter((v) => !isNaN(v));

    const avg = (arr) => arr.length
      ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)
      : "-";

    const temps  = validNums("temperature_c");
    const humids = validNums("humidity_pct");
    const lights = validNums("light_lux");

    return {
      temperature_c: avg(temps),
      humidity_pct:  avg(humids),
      light_lux:     avg(lights),
      temp_avg: avg(temps),
      temp_min: temps.length ? Math.min(...temps).toFixed(2) : "-",
      temp_max: temps.length ? Math.max(...temps).toFixed(2) : "-",
    };
  }, [filteredByLocAndDate]);

  // ─── 7 DATA TERAKHIR ─────────────────────────────────────────────────────
  const tableData = filteredByLocAndDate.slice(-7);

  // ─── HELPER ───────────────────────────────────────────────────────────────
  const getDate = (ts) => ts?.substring(0, 10)  ?? "-";
  const getTime = (ts) => ts?.substring(11, 19) ?? "-";

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#eef2f7", minHeight: "100vh", fontFamily: "Arial" }}>

      {/* ── HEADER ── */}
      <div style={{
        background: "linear-gradient(90deg,#243447,#2c5364)",
        color: "white", padding: "22px", textAlign: "center",
        fontSize: "34px", fontWeight: "bold", letterSpacing: "1px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
      }}>
        Dashboard Monitoring Lingkungan
      </div>

      {/* ── FILTER ── */}
      <div style={{
        display: "flex", gap: "12px", padding: "20px",
        alignItems: "center", flexWrap: "wrap",
      }}>
        <select style={inputStyle} value={selectedLocation}
          onChange={(e) => setSelectedLocation(e.target.value)}>
          <option value="ALL">Semua Lokasi</option>
          {summary?.summary_by_sensor?.map((sensor, i) => (
            <option key={i} value={sensor.location}>{sensor.location}</option>
          ))}
        </select>

        <select style={inputStyle} value={selectedParameter}
          onChange={(e) => setSelectedParameter(e.target.value)}>
          <option value="temperature_c">Suhu</option>
          <option value="humidity_pct">Kelembapan</option>
          <option value="light_lux">Cahaya</option>
          <option value="co2_ppm">CO2</option>
          <option value="noise_db">Noise</option>
        </select>

        <input type="month" style={inputStyle} value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)} />

        <input type="date" style={inputStyle} value={dateFrom}
          min={dataRange.min} max={dataRange.max}
          onChange={(e) => setDateFrom(e.target.value)} />

        <input type="date" style={inputStyle} value={dateTo}
          min={dataRange.min} max={dataRange.max}
          onChange={(e) => setDateTo(e.target.value)} />

        <button style={buttonStyle} onClick={handleTampilkan}>Tampilkan</button>

        <button
          style={{
            ...buttonStyle,
            background: isRefreshing ? "#7f8c8d" : "#27ae60",
            cursor: isRefreshing ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: "6px",
          }}
          onClick={handleRefreshAnomali}
          disabled={isRefreshing}
        >
          <span style={{ display: "inline-block", animation: isRefreshing ? "spin 1s linear infinite" : "none" }}>
            🔄
          </span>
          {isRefreshing ? "Mendeteksi..." : "Refresh Anomali"}
        </button>
      </div>

      {/* ── NOTIFIKASI STATUS REFRESH ── */}
      {refreshStatus && (
        <div style={{
          margin: "0 20px 10px", padding: "12px 18px", borderRadius: "10px",
          fontSize: "14px", fontWeight: "500",
          background: refreshStatus === "success" ? "#eafaf1" : "#fdecea",
          borderLeft: `5px solid ${refreshStatus === "success" ? "#27ae60" : "#e74c3c"}`,
          color: refreshStatus === "success" ? "#1e8449" : "#c0392b",
        }}>
          {refreshStatus === "success" ? "✅ " : "❌ "}{refreshMessage}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── INFO RENTANG DATA ── */}
      {dataRange.min && (
        <div style={{ padding: "4px 20px 12px", fontSize: "12px", color: "#888" }}>
          📅 Data tersedia: <b style={{ color: "#243447" }}>{dataRange.min}</b> s/d <b style={{ color: "#243447" }}>{dataRange.max}</b>
          {" · "}Pilih tanggal dalam rentang ini agar grafik muncul
        </div>
      )}

      {/* ── SUMMARY CARDS ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: "20px", padding: "0 20px",
      }}>
        <Card title="🌡 Suhu"         value={`${filteredStats?.temperature_c ?? "-"} °C`}  color="#e74c3c" />
        <Card title="💧 Kelembapan"   value={`${filteredStats?.humidity_pct  ?? "-"} %`}   color="#27ae60" />
        <Card title="☀ Cahaya"        value={`${filteredStats?.light_lux     ?? "-"} lux`} color="#f39c12" />
        <Card title="⚠ Total Anomali" value={summary?.model_metrics?.detected_anomalies ?? "-"} color="#8e44ad" />
      </div>

      {/* ── GRAFIK MONITORING ── */}
      <div style={{
        background: "white", margin: "20px", padding: "20px",
        borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}>
        <h2 style={{ color: "#243447", marginBottom: "4px" }}>Grafik Monitoring</h2>
        <p style={{ color: "#888", fontSize: "13px", marginBottom: "16px" }}>
          Rata-rata harian · {chartData.length} hari ditampilkan
        </p>

        {chartData.length === 0 ? (
          <div style={{
            height: 200, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#aaa", fontSize: "15px", flexDirection: "column", gap: "8px",
          }}>
            <span style={{ fontSize: "36px" }}>📭</span>
            Tidak ada data untuk rentang tanggal yang dipilih.
            <span style={{ fontSize: "12px" }}>Data tersedia: {dataRange.min} s/d {dataRange.max}</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={appliedParam}
                stroke="#3498db" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* ── RINGKASAN SUHU ── */}
        {filteredStats && (
          <div style={{
            marginTop: "16px", padding: "14px 18px",
            background: "#f0f7ff", borderRadius: "10px",
            borderLeft: "5px solid #3498db",
            color: "#2c3e50", fontSize: "14px", lineHeight: "1.8",
          }}>
            <b>Ringkasan Suhu — {appliedFrom} s/d {appliedTo || appliedMonth || "sekarang"}</b>
            <br />
            Rata-rata: <b style={{ color: "#e74c3c" }}>{filteredStats.temp_avg} °C</b>
            &nbsp;·&nbsp;
            Terendah: <b style={{ color: "#3498db" }}>{filteredStats.temp_min} °C</b>
            &nbsp;·&nbsp;
            Tertinggi: <b style={{ color: "#e67e22" }}>{filteredStats.temp_max} °C</b>
            <br />
            <span style={{ color: "#888", fontSize: "12px" }}>
              Dihitung dari {chartData.length} titik data harian
              {appliedLocation !== "ALL" ? ` · Lokasi: ${appliedLocation}` : " · Semua Lokasi"}
            </span>
          </div>
        )}
      </div>

      {/* ── AI INSIGHT ── */}
      <div style={{
        background: "white", margin: "20px", padding: "25px",
        borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}>
        <h2 style={{ color: "#243447", marginBottom: "16px" }}>AI Insight</h2>

        {!insight ? (
          <div style={{ color: "#aaa", fontSize: "14px" }}>Memuat insight...</div>
        ) : (
          <>
            {/* Badge Severity */}
            <div style={{
              display: "inline-block",
              padding: "6px 18px", borderRadius: "20px",
              background: insight.severityColor, color: "white",
              fontWeight: "bold", fontSize: "14px", marginBottom: "16px",
              letterSpacing: "1px",
            }}>
              ● {insight.severity}
            </div>

            {/* Narasi otomatis */}
            <div style={{
              padding: "16px 18px",
              borderLeft: "6px solid #8e44ad", background: "#f4ecff",
              borderRadius: "8px", color: "#2c3e50",
              lineHeight: "1.9", fontSize: "14px", marginBottom: "16px",
            }}>
              {insight.narrative.map((line, i) => (
                <div key={i}>{"• "}{line}</div>
              ))}
            </div>

            {/* Rekomendasi tindakan */}
            <div style={{
              padding: "14px 18px",
              borderLeft: `6px solid ${insight.severityColor}`,
              background: "#fafafa", borderRadius: "8px",
              color: "#2c3e50", fontSize: "14px", marginBottom: "16px",
            }}>
              <b>Rekomendasi:</b> {insight.action}
            </div>

            {/* Mini stats */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "12px",
            }}>
              <MiniCard label="Total Anomali"   value={insight.totalAnomalies} color="#8e44ad" />
              <MiniCard
                label="Sensor Terburuk"
                value={insight.worstSensor ? `${insight.worstSensor.sensor_id} (${insight.worstSensor.count}x)` : "-"}
                color="#e74c3c"
              />
              <MiniCard
                label="Suhu Tertinggi"
                value={insight.hotSensor ? `${insight.hotSensor.sensor} · ${insight.hotSensor.avgTemp.toFixed(1)}°C` : "-"}
                color="#e67e22"
              />
              <MiniCard label="F1 Score" value={insight.metrics?.f1_score ?? "-"} color="#27ae60" />
            </div>
          </>
        )}
      </div>

      {/* ── DATA HISTORIS ── */}
      <div style={{
        background: "white", margin: "20px", padding: "20px",
        borderRadius: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}>
        <h2 style={{ color: "#243447" }}>
          Data Historis
          <span style={{ fontSize: "14px", fontWeight: "normal", marginLeft: "10px", color: "#888" }}>
            (7 data terakhir — {appliedLocation !== "ALL" ? appliedLocation : "Semua Lokasi"})
          </span>
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table width="100%" cellPadding="12"
            style={{ borderCollapse: "collapse", marginTop: "20px" }}>
            <thead style={{ background: "#3498db", color: "white" }}>
              <tr>
                <th>Tanggal</th><th>Jam</th><th>Lokasi</th>
                <th>Suhu</th><th>Kelembapan</th><th>Cahaya</th><th>CO2</th><th>Noise</th>
              </tr>
            </thead>
            <tbody>
              {tableData.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "#aaa", padding: "20px" }}>
                    Tidak ada data untuk filter yang dipilih
                  </td>
                </tr>
              ) : (
                tableData.map((item, index) => (
                  <tr key={index} style={{ textAlign: "center", borderBottom: "1px solid #ddd" }}>
                    <td>{getDate(item.timestamp)}</td>
                    <td>{getTime(item.timestamp)}</td>
                    <td>{item.location}</td>
                    <td>{item.temperature_c}</td>
                    <td>{item.humidity_pct}</td>
                    <td>{item.light_lux}</td>
                    <td>{item.co2_ppm}</td>
                    <td>{item.noise_db}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ─── KOMPONEN CARD ────────────────────────────────────────────────────────────
function Card({ title, value, color }) {
  return (
    <div style={{
      background: "white", padding: "30px", borderRadius: "16px",
      textAlign: "center", boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    }}>
      <h2 style={{ color: "#243447", marginBottom: "15px" }}>{title}</h2>
      <h1 style={{ color, fontSize: "38px", margin: 0 }}>{value}</h1>
    </div>
  );
}

// ─── KOMPONEN MINICARD ────────────────────────────────────────────────────────
function MiniCard({ label, value, color }) {
  return (
    <div style={{
      background: "#f9f9f9", padding: "14px 16px",
      borderRadius: "10px", borderTop: `4px solid ${color}`,
      textAlign: "center",
    }}>
      <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: "bold", color: "#2c3e50" }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  padding: "10px 14px", borderRadius: "8px",
  border: "1px solid #ccc", fontSize: "14px",
};

const buttonStyle = {
  padding: "10px 22px", background: "#243447",
  color: "white", border: "none", borderRadius: "8px",
  cursor: "pointer", fontWeight: "bold",
};

export default App;