from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Form
import shutil
import subprocess
import uuid
import pandas as pd
import os
import json
from fastapi.staticfiles import StaticFiles

def get_allowed_models(task_type: str):
    cap_path = "MLForge_files/csv_configurations/model_capabilities.csv"
    cap_df = pd.read_csv(cap_path)

    if task_type == "classification":
        allowed = cap_df[cap_df["IS_CLASSIFICATION"] == 1]
    else:
        allowed = cap_df[cap_df["IS_REGRESSION"] == 1]

    return allowed["MODEL_NAME"].tolist()


def detect_task_type(csv_path: str, target_col: str):
    df = pd.read_csv(csv_path)
    unique_vals = df[target_col].nunique()

    if unique_vals <= 20:
        return "classification"
    return "regression"


app = FastAPI(title="ML Model Builder Platform")
app.mount("/files", StaticFiles(directory="MLForge_files"), name="files")

# Allow frontend (JS) to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


@app.get("/")
def root():
    return {"status": "ML Model Builder API is running"}


@app.get("/models")
def get_models():
    """
    Returns list of available model names
    (read from MLForge_model_tbl.csv)
    """
    import pandas as pd
    from src.config import Config

    df = pd.read_csv(Config.CSV_CONFIG)
    return {"models": df["MODEL_NAME"].tolist()}

@app.post("/train-model")
def train_model(
    file: UploadFile = File(...),
    model_name: str = Form(...),
    input_cols: str = Form(...),   # comma-separated
    target_col: str = Form(...),   # single column
    model_params: str = Form("{}")
):
    """
    Train a single ML model and return metrics + pickle path
    """

    job_id = str(uuid.uuid4())
    upload_dir = "MLForge_files/api_uploads"
    os.makedirs(upload_dir, exist_ok=True)

    csv_path = os.path.join(upload_dir, f"{job_id}.csv")

    with open(csv_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    input_cols_list = input_cols.split(",")

    cmd = [
        "python3",
        "src/model.py",
        "--header_id", "1",
        "--training_id", job_id,
        "--csv_file_name", csv_path,
        "--input_col", *input_cols_list,
        "--target_col", target_col,
        "--model_name", model_name,
        "--model_params", model_params
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        return {
            "status": "error",
            "stderr": result.stderr,
            "stdout": result.stdout
        }

    base_name = os.path.splitext(os.path.basename(csv_path))[0]

    pkl_path = f"MLForge_files/pickle_files/{base_name}.pkl"
    metrics_path = f"MLForge_files/training_output/metric_files/{base_name}_metric.csv"

    return {
        "status": "success",
        "model_name": model_name,
        "pickle_path": pkl_path,
        "metrics_path": metrics_path,
        "logs": result.stdout
    }

@app.post("/find-best-model")
def find_best_model(
    file: UploadFile = File(...),
    input_cols: str = Form(...),
    target_col: str = Form(...),
    task_type: str = Form(...)
):
    job_id = str(uuid.uuid4())
    upload_dir = "MLForge_files/api_uploads"
    os.makedirs(upload_dir, exist_ok=True)

    csv_path = os.path.join(upload_dir, f"{job_id}.csv")

    with open(csv_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    csv_base = os.path.splitext(os.path.basename(csv_path))[0]

    # ✅ Detect task and allowed models
    allowed_models = get_allowed_models(task_type)

    results = []

    for model_name in allowed_models:

        cmd = [
            "python3",
            "src/model.py",
            "--header_id", "1",
            "--training_id", "FIND_BEST",
            "--csv_file_name", csv_path,
            "--input_col", *[c.strip() for c in input_cols.split(",")],
            "--target_col", target_col,
            "--model_name", model_name,
            "--model_params", "{}"
        ]

        run = subprocess.run(cmd, capture_output=True, text=True)

        if run.returncode != 0:
            continue

        metric_file = f"MLForge_files/training_output/metric_files/{csv_base}_metric.csv"
        if not os.path.exists(metric_file):
            continue

        metrics_df = pd.read_csv(metric_file)
        metrics = metrics_df.iloc[0].to_dict()
        metrics["model"] = model_name
        results.append(metrics)

        # backup metric file per model
        safe_metric_path = (
            f"MLForge_files/training_output/metric_files/"
            f"{csv_base}_{model_name.replace(' ', '_')}_metric.csv"
        )
        shutil.copy(metric_file, safe_metric_path)

    if not results:
        return {"status": "error", "message": "No models succeeded"}

    results_df = pd.DataFrame(results)

    if task_type == "classification":
        if "_f1_score_" in results_df.columns:
            results_df["f1"] = results_df["_f1_score_"]
        elif "f1score" in results_df.columns:
            results_df["f1"] = results_df["f1score"]
        elif "F1Score" in results_df.columns:
            results_df["f1"] = results_df["F1Score"]
        else:
            results_df["f1"] = None

    if task_type == "classification":

        if "f1" in results_df.columns and results_df["f1"].notna().any():
            best_row = results_df.sort_values("f1", ascending=False).iloc[0]

        elif "_accuracy_score_" in results_df.columns:
            best_row = results_df.sort_values("_accuracy_score_", ascending=False).iloc[0]

        else:
            raise ValueError("No valid classification metric found")

    elif task_type == "regression":

        # -----------------------------
        # FIND AVAILABLE REGRESSION METRICS
        # -----------------------------
        cols = [c.lower() for c in results_df.columns]

        def find_col(keyword_list):
            for c in results_df.columns:
                for k in keyword_list:
                    if k in c.lower():
                        return c
            return None

        r2_col = find_col(["r2"])
        mse_col = find_col(["mse", "mean_squared"])
        rmse_col = find_col(["rmse"])

        # -----------------------------
        # SELECT BEST MODEL
        # -----------------------------
        if r2_col:
            # Higher R² is better
            best_row = results_df.sort_values(r2_col, ascending=False).iloc[0]

        elif rmse_col:
            # Lower RMSE is better
            best_row = results_df.sort_values(rmse_col, ascending=True).iloc[0]

        elif mse_col:
            # Lower MSE is better
            best_row = results_df.sort_values(mse_col, ascending=True).iloc[0]

        else:
            # 🚨 LAST RESORT — DO NOT CRASH
            print("⚠️ Regression metrics not found. Columns:", results_df.columns.tolist())
            best_row = results_df.iloc[0]


    return {
        "status": "success",
        "task_type": task_type,
        "best_model": best_row["model"],
        "results": results
    }

