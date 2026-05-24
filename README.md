# AI-Based Interactive Dashboard for Environmental Monitoring

This project foundation contains a synthetic environmental monitoring datasource,
preprocessing output, anomaly detection results, and a Node.js/Express backend API.

## Folder Structure

```text
tvi_environmental_ai_dashboard_foundation/
├── dataset/
│   ├── raw_environmental_data.csv
│   ├── clean_environmental_data.csv
│   ├── anomaly_results.csv
│   └── summary_by_sensor.csv
├── ai_model/
│   └── train_anomaly_model.py
├── backend/
│   ├── package.json
│   └── server.js
├── frontend_stub/
│   └── preview.html
├── paper_support/
│   ├── model_metrics.json
│   └── preliminary_results.md
└── README.md
```

## Dataset Description

The dataset simulates environmental monitoring from three sensor nodes:

- ENV-01: Indoor Lab A
- ENV-02: Indoor Lab B
- ENV-03: Outdoor Area

Main variables:

- timestamp
- sensor_id
- location
- temperature_c
- humidity_pct
- co2_ppm
- pm25_ugm3
- light_lux
- noise_db
- true_anomaly

## Preliminary Model Result

- Total records: 4032
- Raw missing values: 288
- Missing values after preprocessing: 0
- True anomalies: 90
- Detected anomalies: 142
- Method: Isolation Forest
- Precision: 0.5845
- Recall: 0.9222
- F1-score: 0.7155

## Run Backend/API Gateway

```bash
cd backend
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `/api/data/raw` | Get raw environmental data |
| `/api/data/clean` | Get cleaned/preprocessed data |
| `/api/summary` | Get summary statistics and model metrics |
| `/api/anomaly` | Get detected anomaly records |
| `/api/visualization` | Get visualization-ready time-series data |
| `/api/health` | Check API status |

## Example API Calls

```text
http://localhost:3000/api/summary
http://localhost:3000/api/data/raw?limit=10
http://localhost:3000/api/anomaly?limit=20
http://localhost:3000/api/visualization?sensor_id=ENV-01&variable=temperature_c
```

## Regenerate AI/ML Results

```bash
cd ai_model
python train_anomaly_model.py
```

## Paper Direction

Suggested paper title:

AI-Based Interactive Dashboard for Environmental Monitoring Using Time-Series Anomaly Detection

The generated dataset and results can support the Methods and Results sections,
especially dataset description, preprocessing, AI/ML model evaluation, API design,
and dashboard visualization.
