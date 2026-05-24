"""
AI Model - Spike Detection untuk Suhu
Mendeteksi kenaikan/penurunan suhu yang tiba-tiba (spike)
menggunakan kombinasi:
  1. Z-Score per sensor (statistik)
  2. Delta/diff antar timestamp (perubahan mendadak)
  3. Rolling mean threshold (konteks waktu)
"""

import pandas as pd
import numpy as np
import json
import os

# ─── PATH ────────────────────────────────────────────────────────────────────
# os.path.dirname dipanggil DUA KALI:
#   __file__          → .../ai_model/train_anomaly_model.py
#   dirname sekali    → .../ai_model/
#   dirname dua kali  → .../ (project root, tempat folder dataset & paper_support)
BASE_DIR    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
OUTPUT_DIR  = os.path.join(BASE_DIR, "paper_support")

RAW_CSV      = os.path.join(DATASET_DIR, "raw_environmental_data.csv")
RESULT_CSV   = os.path.join(DATASET_DIR, "anomaly_results.csv")
METRICS_JSON = os.path.join(OUTPUT_DIR,  "model_metrics.json")

# ─── THRESHOLD CONFIG ─────────────────────────────────────────────────────────
# Sesuaikan nilai ini kalau mau lebih/kurang sensitif
DELTA_THRESHOLD   = 2.5   # °C — perubahan suhu antar 15 menit dianggap spike
ZSCORE_THRESHOLD  = 2.5   # standar deviasi dari mean per sensor
ROLLING_WINDOW    = 8     # jumlah data sebelumnya untuk rolling mean (8 x 15min = 2 jam)
ROLLING_THRESHOLD = 3.0   # °C — selisih dari rolling mean dianggap spike

# ─── LOAD DATA ────────────────────────────────────────────────────────────────
print("Loading data...")
df = pd.read_csv(RAW_CSV)
df["timestamp"] = pd.to_datetime(df["timestamp"])
df = df.sort_values(["sensor_id", "timestamp"]).reset_index(drop=True)

# Konversi suhu ke numerik, isi yang kosong dengan median per sensor
df["temperature_c"] = pd.to_numeric(df["temperature_c"], errors="coerce")
df["temperature_c"] = df.groupby("sensor_id")["temperature_c"].transform(
    lambda x: x.fillna(x.median())
)

print(f"Total data: {len(df)} baris, {df['sensor_id'].nunique()} sensor")

# ─── SPIKE DETECTION ──────────────────────────────────────────────────────────
print("Mendeteksi spike suhu...")

# 1. Delta: selisih suhu dengan data sebelumnya (per sensor)
df["temp_delta"] = df.groupby("sensor_id")["temperature_c"].diff().abs()

# 2. Z-Score: seberapa jauh dari rata-rata per sensor
df["temp_zscore"] = df.groupby("sensor_id")["temperature_c"].transform(
    lambda x: (x - x.mean()) / x.std()
).abs()

# 3. Rolling mean: rata-rata 2 jam terakhir per sensor
df["temp_rolling_mean"] = df.groupby("sensor_id")["temperature_c"].transform(
    lambda x: x.rolling(window=ROLLING_WINDOW, min_periods=1).mean()
)
df["temp_rolling_delta"] = (df["temperature_c"] - df["temp_rolling_mean"]).abs()

# ─── KOMBINASI DETEKSI ────────────────────────────────────────────────────────
# Dianggap spike kalau memenuhi MINIMAL SATU kondisi:
# - Delta tiba-tiba > 2.5°C dalam 15 menit, ATAU
# - Z-Score > 2.5 (jauh banget dari rata-rata sensor), ATAU
# - Selisih dari rolling mean > 3.0°C

spike_delta   = df["temp_delta"]         > DELTA_THRESHOLD
spike_zscore  = df["temp_zscore"]        > ZSCORE_THRESHOLD
spike_rolling = df["temp_rolling_delta"] > ROLLING_THRESHOLD

df["anomaly_prediction"] = ((spike_delta | spike_zscore | spike_rolling)).astype(int)

# Anomaly score: gabungan normalized (0-1, makin tinggi makin anomali)
df["anomaly_score"] = (
    (df["temp_delta"].fillna(0)   / DELTA_THRESHOLD).clip(0, 1) * 0.4 +
    (df["temp_zscore"].fillna(0)  / ZSCORE_THRESHOLD).clip(0, 1) * 0.3 +
    (df["temp_rolling_delta"]     / ROLLING_THRESHOLD).clip(0, 1) * 0.3
).round(4)

# ─── EVALUASI ─────────────────────────────────────────────────────────────────
print("Menghitung metrics...")

# Hanya evaluasi baris yang punya true_anomaly
df["true_anomaly"] = pd.to_numeric(df["true_anomaly"], errors="coerce").fillna(0).astype(int)
eval_df = df[df["true_anomaly"].isin([0, 1])].copy()

true_pos  = ((eval_df["anomaly_prediction"] == 1) & (eval_df["true_anomaly"] == 1)).sum()
false_pos = ((eval_df["anomaly_prediction"] == 1) & (eval_df["true_anomaly"] == 0)).sum()
false_neg = ((eval_df["anomaly_prediction"] == 0) & (eval_df["true_anomaly"] == 1)).sum()

precision = true_pos / (true_pos + false_pos) if (true_pos + false_pos) > 0 else 0
recall    = true_pos / (true_pos + false_neg) if (true_pos + false_neg) > 0 else 0
f1        = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

total_detected = df["anomaly_prediction"].sum()
total_true     = df["true_anomaly"].sum()

print(f"\n=== HASIL DETEKSI SPIKE SUHU ===")
print(f"Total data        : {len(df)}")
print(f"True anomalies    : {total_true}")
print(f"Detected anomalies: {total_detected}")
print(f"Precision         : {precision:.4f}")
print(f"Recall            : {recall:.4f}")
print(f"F1 Score          : {f1:.4f}")
print(f"\nSpike breakdown:")
print(f"  Delta spike     : {spike_delta.sum()} kejadian")
print(f"  Z-Score spike   : {spike_zscore.sum()} kejadian")
print(f"  Rolling spike   : {spike_rolling.sum()} kejadian")

# ─── SIMPAN HASIL ─────────────────────────────────────────────────────────────
# Kolom output untuk anomaly_results.csv
output_cols = [
    "timestamp", "sensor_id", "location",
    "temperature_c", "humidity_pct", "co2_ppm",
    "pm25_ugm3", "light_lux", "noise_db",
    "true_anomaly", "anomaly_prediction", "anomaly_score"
]

# Pastiin semua kolom ada
for col in ["humidity_pct","co2_ppm","pm25_ugm3","light_lux","noise_db"]:
    if col not in df.columns:
        df[col] = None

df[output_cols].to_csv(RESULT_CSV, index=False)
print(f"\nHasil disimpan ke: {RESULT_CSV}")

# Update model_metrics.json
metrics = {
    "method"              : "Spike Detection (Delta + Z-Score + Rolling Mean)",
    "target_parameter"    : "temperature_c",
    "delta_threshold_c"   : DELTA_THRESHOLD,
    "zscore_threshold"    : ZSCORE_THRESHOLD,
    "rolling_window"      : ROLLING_WINDOW,
    "rolling_threshold_c" : ROLLING_THRESHOLD,
    "total_records"       : len(df),
    "total_sensors"       : int(df["sensor_id"].nunique()),
    "true_anomalies"      : int(total_true),
    "detected_anomalies"  : int(total_detected),
    "precision"           : round(precision, 4),
    "recall"              : round(recall, 4),
    "f1_score"            : round(f1, 4),
}

os.makedirs(OUTPUT_DIR, exist_ok=True)
with open(METRICS_JSON, "w") as f:
    json.dump(metrics, f, indent=2)

print(f"Metrics disimpan ke: {METRICS_JSON}")
print("\nSelesai!")