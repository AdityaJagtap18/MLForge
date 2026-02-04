from fastapi import UploadFile, File, Form
import pandas as pd
import uuid
import subprocess
import shutil
import os

@app.post("/find-best-model")
def find_best_model(
    file: UploadFile = File(...),
    input_cols: str = Form(...),
    target_col: str = Form(...)
):
    """
    Train ALL models and compare metrics
    """

    # 1️⃣ Save uploaded CSV
    job_id = str(uuid.uuid4())
    upload_dir = "MLForge_files/api_uploads"
    os.makedirs(upload_dir, exist_ok=True)

    csv_path = os.path.join(upload_dir, f"{job_id}.csv")

    with open(csv_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 2️⃣ Load available models
    from src.config import Config
    model_df = pd.read_csv(Config.CSV_CONFIG)

    results = []

    # 3️⃣ Loop through models
    for _, row in model_df.iterrows():
        model_name = row["MODEL_NAME"]

        training_id = str(uuid.uuid4())

        cmd = [
            "python3",
            "src/model.py",
            "--header_id", "1",
            "--training_id", training_id,
            "--csv_file_name", csv_path,
            "--input_col", *input_cols.split(","),
            "--target_col", target_col,
            "--model_name", model_name,
            "--model_params", "{}"
        ]

        run = subprocess.run(cmd, capture_output=True, text=True)

        if run.returncode != 0:
            continue  # skip failed models

        # 4️⃣ Read metrics
        metric_file = f"MLForge_files/training_output/metric_files/{training_id}_metric.csv"
        if not os.path.exists(metric_file):
            continue

        metrics_df = pd.read_csv(metric_file)
        metrics = metrics_df.iloc[0].to_dict()

        metrics["model"] = model_name
        results.append(metrics)

    if not results:
        return {"status": "error", "message": "No models succeeded"}

    # 5️⃣ Pick best model (classification → f1score, regression → R2Score)
    results_df = pd.DataFrame(results)

    if "f1score" in results_df.columns:
        best_row = results_df.sort_values("f1score", ascending=False).iloc[0]
    else:
        best_row = results_df.sort_values("R2Score", ascending=False).iloc[0]

    return {
        "status": "success",
        "best_model": best_row["model"],
        "results": results
    }
