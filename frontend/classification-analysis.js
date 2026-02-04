const raw = sessionStorage.getItem("analysisData");

if (!raw) {
    alert("No analysis data found");
    window.location.href = "/frontend/find-model.html";
    throw new Error("No data");
}

const data = JSON.parse(raw);

// Fill summary
document.getElementById("bestModel").textContent = data.best_model;
document.getElementById("taskBadge").textContent = "Task Type: CLASSIFICATION";

// ---- BUILD SCATTER DATA (Precision vs Recall) ----
const points = [];

data.results.forEach(r => {
    const precision = r._precision_ ?? r.precision;
    const recall = r._recall_ ?? r.recall;

    if (precision != null && recall != null) {
        points.push({
            x: Number(precision),
            y: Number(recall),
            label: r.model || r._Model_Name_,
            f1: r._f1_score_,
            accuracy: r._accuracy_score_
        });
    }
});

// ---- SCATTER CHART ----
const ctx = document.getElementById("scatterChart").getContext("2d");

new Chart(ctx, {
    type: "scatter",
    data: {
        datasets: [{
            label: "Model Comparison",
            data: points,
            pointRadius: 7,
            pointBackgroundColor: "#4f46e5"
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
                            `Precision: ${p.x.toFixed(3)}`,
                            `Recall: ${p.y.toFixed(3)}`,
                            `F1: ${p.f1?.toFixed(3)}`,
                            `Accuracy: ${p.accuracy?.toFixed(3)}`
                        ];
                    }
                }
            }
        },
        scales: {
            x: { title: { display: true, text: "Precision" }},
            y: { title: { display: true, text: "Recall" }}
        }
    }
});

const tableHead = document.querySelector("#metricsTable thead");
const tableBody = document.querySelector("#metricsTable tbody");

tableHead.innerHTML = `
<tr>
    <th>Model</th>
    <th>Accuracy</th>
    <th>Precision</th>
    <th>Recall</th>
    <th>F1 Score</th>
    <th>Support</th>
</tr>
`;

tableBody.innerHTML = "";

data.results.forEach(r => {
    tableBody.innerHTML += `
        <tr>
            <td>${r.model || r._Model_Name_ || "Unknown"}</td>
            <td>${Number.isFinite(r._accuracy_score_) ? r._accuracy_score_.toFixed(4) : "-"}</td>
            <td>${Number.isFinite(r._precision_) ? r._precision_.toFixed(4) : "-"}</td>
            <td>${Number.isFinite(r.recall) ? r.recall.toFixed(4) : "-"}</td>
            <td>${Number.isFinite(r._f1_score_) ? r._f1_score_.toFixed(4) : "-"}</td>
            <td>${r._support_ ?? "-"}</td>
        </tr>
    `;
});

// ================= TOGGLE TABLE =================
const toggleBtn = document.getElementById("toggleTableBtn");
const tableWrapper = document.getElementById("metricsTableWrapper");

toggleBtn.addEventListener("click", () => {
    tableWrapper.classList.toggle("hidden");

    toggleBtn.textContent = tableWrapper.classList.contains("hidden")
        ? "⬇ Show Table"
        : "⬆ Hide Table";
});




document.addEventListener("DOMContentLoaded", () => {
    const toggleBtn = document.getElementById("themeToggle");
    const body = document.body;

    if (!toggleBtn) return; // page without navbar

    // Load saved theme
    if (localStorage.getItem("theme") === "dark") {
        body.classList.add("dark");
        toggleBtn.textContent = "☀️ Light";
    }

    toggleBtn.addEventListener("click", () => {
        body.classList.toggle("dark");

        if (body.classList.contains("dark")) {
            localStorage.setItem("theme", "dark");
            toggleBtn.textContent = "☀️ Light";
        } else {
            localStorage.setItem("theme", "light");
            toggleBtn.textContent = "🌙 Dark";
        }
    });
});
