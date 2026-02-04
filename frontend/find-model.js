// ===== ELEMENT REFERENCES =====
const uploadBox = document.getElementById("fileUploadBox");
const fileInput = document.getElementById("csvFile");
const uploadText = document.getElementById("uploadText");

const loader = document.getElementById("loader");
const submitBtn = document.querySelector(
    '#findForm button[type="submit"]'
);

// ===== CSV UPLOAD BOX LOGIC =====
if (uploadBox && fileInput && uploadText) {
    uploadBox.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            uploadText.textContent = `📄 ${fileInput.files[0].name}`;
        }
    });
}

// ===== FORM SUBMIT LOGIC =====
document.getElementById("findForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    // ---- VALIDATE FILE ----
    if (!fileInput.files.length) {
        alert("Please upload a CSV file first");
        return;
    }

    // ---- READ TASK TYPE ----
    const taskType = document.querySelector(
        'input[name="taskType"]:checked'
    ).value;

    // ---- BUILD FORM DATA ----
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    formData.append(
        "input_cols",
        document.getElementById("inputCols").value
    );
    formData.append(
        "target_col",
        document.getElementById("targetCol").value
    );
    formData.append("task_type", taskType);

    try {
        // ===== SHOW LOADER =====
        loader.style.display = "flex";
        submitBtn.disabled = true;
        submitBtn.textContent = "⏳ Processing...";

        // ===== API CALL =====
        const res = await fetch(
            "http://127.0.0.1:8000/find-best-model",
            {
                method: "POST",
                body: formData
            }
        );

        if (!res.ok) {
            loader.style.display = "none";
            submitBtn.disabled = false;
            submitBtn.textContent = "🔍 Find Best Model";
            alert("Backend error while finding model");
            return;
        }

        const data = await res.json();
        console.log("API RESPONSE:", data);

        if (data.status !== "success") {
            loader.style.display = "none";
            submitBtn.disabled = false;
            submitBtn.textContent = "🔍 Find Best Model";
            alert(data.message || "Model comparison failed");
            return;
        }

        // ===== STORE RESULT =====
        sessionStorage.setItem("analysisData", JSON.stringify(data));

        // ===== REDIRECT (KEEP LOADER VISIBLE) =====
        window.location.href =
            taskType === "classification"
                ? "/frontend/classification-analysis.html"
                : "/frontend/regression-analysis.html";

    } catch (err) {
        loader.style.display = "none";
        submitBtn.disabled = false;
        submitBtn.textContent = "🔍 Find Best Model";
        console.error(err);
        alert("Unable to connect to backend");
    }
});
