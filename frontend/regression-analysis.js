console.log("✅ regression-analysis.js loaded");

const raw = sessionStorage.getItem("analysisData");

if (!raw) {
    alert("No analysis data found");
    window.location.href = "/frontend/find-model.html";
    throw new Error("No data");
}

const data = JSON.parse(raw);
console.log("Regression page data:", data);

// ---- SUMMARY ----
document.getElementById("bestModel").textContent = data.best_model;
document.getElementById("taskBadge").textContent = "Task Type: REGRESSION";

// ---- BUILD POINTS (MATCH ACTUAL KEYS) ----
const points = [];

data.results.forEach(r => {
    const mse = r._Mean_Squared_Error_;
    const r2  = r._R2_score_;
    const name = r.model || r._Model_Name_;

    if (Number.isFinite(mse) && Number.isFinite(r2)) {
        points.push({
            x: mse,
            y: r2,
            label: name
        });
    }
});

console.log("Regression points:", points);



// ---- CHART ----
const ctx = document.getElementById("scatterChart").getContext("2d");

new Chart(ctx, {
    type: "scatter",
    data: {
        datasets: [{
            label: "Model Comparison",
            data: points,
            pointRadius: 7,
            pointBackgroundColor: "#16a34a"
        }]
    },
    options: {
        plugins: {
            tooltip: {
                callbacks: {
                    label: c => {
                        const p = c.raw;
                        return [
                            `Model: ${p.label}`,
                            `MSE: ${p.x.toFixed(3)}`,
                            `R²: ${p.y.toFixed(3)}`
                        ];
                    }
                }
            }
        },
        scales: {
            x: {
                title: {
                    display: true,
                    text: "Mean Squared Error (lower is better)"
                }
            },
            y: {
                title: {
                    display: true,
                    text: "R² Score (higher is better)"
                },
                min: -1,
                max: 1
            }
        }
    }
});


const tableHead = document.querySelector("#metricsTable thead");
const tableBody = document.querySelector("#metricsTable tbody");

const headers = [
    "Model",
    "MSE",
    "MAE",
    "R²",
    "Explained Variance"
];

tableHead.innerHTML = `
    <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
`;

data.results.forEach(r => {
    tableBody.innerHTML += `
        <tr>
            <td>${r.model}</td>
            <td>${r._Mean_Squared_Error_?.toFixed(4) ?? "-"}</td>
            <td>${r._Mean_Absolute_Error_?.toFixed(4) ?? "-"}</td>
            <td>${r._R2_score_?.toFixed(4) ?? "-"}</td>
            <td>${r._Explained_Variance_Score_?.toFixed(4) ?? "-"}</td>
        </tr>
    `;
});

const toggleBtn = document.getElementById("toggleTableBtn");
const tableWrapper = document.getElementById("metricsTableWrapper");

toggleBtn.addEventListener("click", () => {
    tableWrapper.classList.toggle("hidden");

    toggleBtn.textContent = tableWrapper.classList.contains("hidden")
        ? "⬇ Show Table"
        : "⬆ Hide Table";
});