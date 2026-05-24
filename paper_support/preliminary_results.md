# Preliminary Results for Paper

## Dataset Summary
- Total records: 4032
- Sensor nodes: 3
- Raw missing values injected: 288
- Missing values after preprocessing: 0
- True anomalies injected: 90
- Detected anomalies: 142

## Model
- Method: Isolation Forest
- Contamination setting: 0.035
- Precision: 0.5845
- Recall: 0.9222
- F1-score: 0.7155
- Confusion matrix: [[3883, 59], [7, 83]]

## Interpretation
The generated dataset simulates multivariate environmental monitoring from three sensor nodes.
Missing values are handled through sensor-wise linear interpolation. The anomaly detection
model identifies abnormal patterns from temperature, humidity, CO2, PM2.5, light intensity,
noise level, and temporal features. The resulting anomaly labels and anomaly scores can be
used as the main analytical output for the interactive dashboard and the Results section
of the paper.
