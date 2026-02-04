
import os

# src/
SRC_DIR = os.path.dirname(os.path.abspath(__file__))

# project_root/
BASE_DIR = os.path.dirname(SRC_DIR)

# project_root/MLForge_files
MLForge_FILES_DIR = os.path.join(BASE_DIR, "MLForge_files")


class Config:
    TRAINING_FOLDER = os.path.join(MLForge_FILES_DIR, "training")
    TESTING_FOLDER = os.path.join(MLForge_FILES_DIR, "testing")

    TESTING_OUTPUT_FOLDER = os.path.join(
        MLForge_FILES_DIR, "testing_output", "output_files"
    )

    TEXT_CLASSIFIER_TRAIN_FOLDER = os.path.join(
        MLForge_FILES_DIR, "text_classifier_training"
    )

    TEXT_CLASSIFIER_TEST_FOLDER = os.path.join(
        MLForge_FILES_DIR, "text_classifier_testing"
    )

    TEXT_CLASSIFIER_TEST_OUTPUT_FOLDER = os.path.join(
        MLForge_FILES_DIR, "text_classifier_testing_output", "output_files"
    )

    TRAINING_OUTPUT_FOLDER = os.path.join(
        MLForge_FILES_DIR, "training_output", "metric_files"
    )

    TEXT_CLASSIFIER_TRAIN_OUTPUT_FOLDER = os.path.join(
        MLForge_FILES_DIR, "text_classifier_training_output", "metric_files"
    )

    PICKLE_FOLDER = os.path.join(MLForge_FILES_DIR, "pickle_files")

    CSV_CONFIG = os.path.join(
        MLForge_FILES_DIR, "csv_configurations", "MLForge_model_tbl.csv"
    )
