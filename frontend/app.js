const API_BASE = "http://127.0.0.1:8000";

async function loadMetricsLayered(metricsUrl) {
    const res = await fetch(metricsUrl);
    const text = await res.text();

    const rows = text.trim().split("\n").map(r => r.split(","));
    const headers = rows[0];
    const values = rows[1];

    const metrics = {};
    headers.forEach((h, i) => {
        metrics[h.replace(/_/g, "")] = parseFloat(values[i]);
    });

    /* ---------- SUMMARY METRICS ---------- */
    const summaryDiv = document.getElementById("summaryMetrics");
    summaryDiv.style.display = "block";

    const summaryKeys = [];

    if (metrics.f1score !== undefined) {
        // Classification
        summaryKeys.push("accuracyscore", "precision", "recall", "f1score");
    } else {
        // Regression
        summaryKeys.push("RMSE", "MeanAbsoluteError", "R2Score");
    }

    let cardsHTML = `<h3>Model Summary</h3><div class="metrics-grid">`;

    summaryKeys.forEach(k => {
        if (metrics[k] !== undefined && !isNaN(metrics[k])) {
            cardsHTML += `
                <div class="metric-card">
                    <h4>${k}</h4>
                    <p>${metrics[k].toFixed(3)}</p>
                </div>
            `;
        }
    });

    cardsHTML += "</div>";
    summaryDiv.innerHTML = cardsHTML;

    /* ---------- QUALITY BADGE ---------- */
    const qualityDiv = document.getElementById("qualityBadge");
    qualityDiv.style.display = "block";

    let quality = "Average";
    let cssClass = "quality-ok";

    if (metrics.f1score !== undefined) {
        const f1 = metrics.f1score;

        if (f1 >= 0.75) {
            quality = "Excellent";
            cssClass = "quality-good";
        } else if (f1 >= 0.60) {
            quality = "Good";
            cssClass = "quality-good";
        } else if (f1 >= 0.45) {
            quality = "Average";
            cssClass = "quality-ok";
        } else {
            quality = "Poor";
            cssClass = "quality-bad";
        }
    }


    qualityDiv.className = `card ${cssClass}`;
    qualityDiv.innerHTML = `<h3>Model Quality</h3><p>${quality}</p>`;

    /* ---------- DETAILED METRICS ---------- */
    const tableDiv = document.getElementById("detailsSection");
    const table = document.getElementById("metricsTable");

    tableDiv.style.display = "block";
    table.innerHTML = "";

    const ignoreKeys = ["WeightedAverage"];

    Object.keys(metrics).forEach(k => {
        if (ignoreKeys.includes(k)) return;
        if (isNaN(metrics[k])) return;

        table.innerHTML += `
            <tr>
                <td><b>${k}</b></td>
                <td>${metrics[k].toFixed(4)}</td>
            </tr>
        `;
    });
}


// Load models into dropdown
async function loadModels() {
    const res = await fetch(`${API_BASE}/models`);
    const data = await res.json();

    const select = document.getElementById("modelName");
    data.models.forEach(model => {
        const opt = document.createElement("option");
        opt.value = model;
        opt.textContent = model;
        select.appendChild(opt);
    });
}

loadModels();

// Handle form submit
document.getElementById("trainForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById("csvFile");
    const formData = new FormData();

    formData.append("file", fileInput.files[0]);
    formData.append("model_name", document.getElementById("modelName").value);
    formData.append("input_cols", document.getElementById("inputCols").value);
    formData.append("target_col", document.getElementById("targetCol").value);
    formData.append("model_params", document.getElementById("modelParams").value);

    const resultDiv = document.getElementById("result");
    resultDiv.style.display = "block";
    resultDiv.className = "card";
    resultDiv.innerHTML = "<b>⏳ Training in progress...</b>";


    const response = await fetch(`${API_BASE}/train-model`, {
        method: "POST",
        body: formData
    });

    const data = await response.json();

    if (data.status === "success") {
        resultDiv.className = "card result";
resultDiv.innerHTML = `
    <h3>✅ Training Successful</h3>
    <p><b>Model:</b> ${data.model_name}</p>

    <div class="links">
        <a href="http://127.0.0.1:8000/files/pickle_files/${data.pickle_path.split('/').pop()}" target="_blank">
            ⬇ Download Pickle
        </a>
        <a href="http://127.0.0.1:8000/files/training_output/metric_files/${data.metrics_path.split('/').pop()}" target="_blank">
            📊 View Metrics
        </a>
    </div>

    <pre>${data.logs}</pre>
`;
        loadMetricsLayered(
  `http://127.0.0.1:8000/files/training_output/metric_files/${data.metrics_path.split('/').pop()}`
);

    } else {
        resultDiv.innerHTML = `<pre>Error:\n${data.stderr}</pre>`;
    }
});


const uploadBox = document.getElementById("fileUploadBox");
const fileInput = document.getElementById("csvFile");
const uploadText = document.getElementById("uploadText");


uploadBox.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
        uploadText.textContent = `📄 ${fileInput.files[0].name}`;
    }
});
