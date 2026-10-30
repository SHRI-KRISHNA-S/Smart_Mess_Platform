"""
Data Loader Module for Smart Mess ML Pipeline
Fetches and caches the empirical institutional dining food waste dataset.
Primary dataset: Food waste dataset: secondary school in Finland 2024-2025 (Zenodo DOI: 10.5281/zenodo.20825233)
License: Creative Commons Attribution 4.0 International (CC-BY-4.0)
"""

import os
import urllib.request
import pandas as pd
from typing import Optional

ZENODO_RECORD_ID = "20825233"
ZENODO_FILE_URL = "https://zenodo.org/api/records/20825233/files/Food%20waste%20data%20school%20Finland%202024-2025.xlsx/content"
DEFAULT_RAW_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "raw"))
RAW_FILENAME = "food_waste_school_finland_2024_2025.xlsx"


def get_raw_filepath(raw_dir: Optional[str] = None) -> str:
    directory = raw_dir or DEFAULT_RAW_DIR
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, RAW_FILENAME)


def download_dataset(target_path: Optional[str] = None, force: bool = False) -> str:
    path = target_path or get_raw_filepath()
    if os.path.exists(path) and not force:
        return path

    print(f"[DataLoader] Downloading institutional food waste dataset from Zenodo ({ZENODO_FILE_URL})...")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    
    headers = {"User-Agent": "SmartMess-MLPipeline/1.0"}
    req = urllib.request.Request(ZENODO_FILE_URL, headers=headers)
    with urllib.request.urlopen(req) as response, open(path, "wb") as out_file:
        out_file.write(response.read())

    print(f"[DataLoader] Successfully saved raw dataset to {path} ({os.path.getsize(path)} bytes).")
    return path


def load_raw_data(raw_path: Optional[str] = None) -> pd.DataFrame:
    """
    Loads raw Excel file and returns the primary sheet as a DataFrame.
    """
    path = raw_path or get_raw_filepath()
    if not os.path.exists(path):
        download_dataset(path)

    df = pd.read_excel(path, sheet_name=0)
    print(f"[DataLoader] Loaded raw data: {df.shape[0]} records, {df.shape[1]} columns.")
    return df


if __name__ == "__main__":
    df = load_raw_data()
    print("Columns:", df.columns.tolist())
    print("Head:\n", df.head(3))
