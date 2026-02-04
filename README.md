# MlForge - Machine Learning Model Builder Platform

A web-based platform for training and evaluating machine learning models with support for both classification and regression tasks using scikit-learn.

## Features

- **Model Training**: Train ML models on custom CSV datasets
- **Auto Model Selection**: Automatically find the best performing model for your data
- **Multiple Algorithms**: Support for 40+ scikit-learn algorithms including:
  - Linear models (Linear Regression, Ridge, Lasso, ElasticNet, etc.)
  - Classification models (Logistic Regression, SVM, Decision Trees, etc.)
  - Neural networks (MLPClassifier, MLPRegressor)
  - Ensemble methods and more
- **Task Type Detection**: Automatic detection of classification vs regression tasks
- **Model Evaluation**: Comprehensive metrics for model performance
- **Web Interface**: User-friendly frontend for uploading data and managing models
- **REST API**: FastAPI backend for programmatic access
- **Model Persistence**: Save and load trained models as pickle files

## Project Structure

```
MlForge/
├── api/                          # FastAPI backend
│   ├── main.py                   # Main API endpoints
│   └── find-best-model.py        # Best model selection logic
├── frontend/                     # Web interface
│   ├── index.html                # Main page
│   ├── app.js                    # Frontend logic
│   ├── style.css                 # Styling
│   ├── classification-analysis.html
│   ├── regression-analysis.html
│   ├── find-model.html
│   └── use-model.html
├── src/                          # Core ML training code
│   ├── model.py                  # Model configuration and training
│   ├── train.py                  # Training pipeline
│   ├── test.py                   # Testing pipeline
│   ├── metrics.py                # Performance metrics calculation
│   └── config.py                 # Configuration management
├── MlForge_files/                   # Data and outputs
│   ├── csv_configurations/       # Model configuration CSVs
│   ├── pickle_files/             # Saved trained models
│   ├── training_output/          # Training results and metrics
│   ├── api_uploads/              # Uploaded CSV files
│   └── ...
└── requirements.txt              # Python dependencies
```

## Installation

### Prerequisites

- Python 3.x
- pip

### Setup

1. Clone the repository:
```bash
cd MlForge
```

2. Create a virtual environment:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

### Starting the API Server

```bash
cd api
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

### Accessing the Web Interface

Open your browser and navigate to:
```
http://localhost:8000/frontend/index.html
```

### API Endpoints

#### Get Available Models
```bash
GET /models
```
Returns a list of all available machine learning models.

#### Train a Model
```bash
POST /train-model
```
**Parameters:**
- `file`: CSV file containing training data
- `model_name`: Name of the model to train
- `input_cols`: Comma-separated list of input column names
- `target_col`: Target column name
- `model_params`: JSON string of model parameters (optional)

**Response:**
```json
{
  "status": "success",
  "model_name": "Linear Regression",
  "pickle_path": "MlForge_files/pickle_files/model.pkl",
  "metrics_path": "MlForge_files/training_output/metric_files/model_metric.csv",
  "logs": "..."
}
```

#### Find Best Model
```bash
POST /find-best-model
```
**Parameters:**
- `file`: CSV file containing training data
- `input_cols`: Comma-separated list of input column names
- `target_col`: Target column name
- `task_type`: Either "classification" or "regression"

**Response:**
```json
{
  "status": "success",
  "task_type": "classification",
  "best_model": "Random Forest Classifier",
  "results": [...]
}
```

### Command Line Training

You can also train models directly from the command line:

```bash
python3 src/model.py \
  --header_id 1 \
  --training_id my_training_job \
  --csv_file_name path/to/data.csv \
  --input_col feature1 feature2 feature3 \
  --target_col target \
  --model_name "Linear Regression" \
  --model_params "{}"
```

## Configuration

### Model Configuration

Models are configured in `MlForge_files/csv_configurations/model_capabilities.csv` with the following columns:
- `MODEL_NAME`: Human-readable model name
- `MODEL_CLASS`: scikit-learn class name
- `IS_CLASSIFICATION`: 1 if model supports classification, 0 otherwise
- `IS_REGRESSION`: 1 if model supports regression, 0 otherwise

### Adding New Models

1. Add the model entry to `MlForge_files/csv_configurations/model_capabilities.csv`
2. Import the model class in `src/model.py`
3. Restart the API server

## Metrics

### Classification Metrics
- Accuracy Score
- F1 Score
- Precision
- Recall
- Confusion Matrix

### Regression Metrics
- R² Score
- Mean Squared Error (MSE)
- Root Mean Squared Error (RMSE)
- Mean Absolute Error (MAE)

## Technologies Used

- **Backend**: FastAPI, Python 3
- **ML Framework**: scikit-learn
- **Data Processing**: pandas, numpy
- **Frontend**: HTML, CSS, JavaScript
- **Model Persistence**: pickle

## License

This project is provided as-is for educational and development purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
