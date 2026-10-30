"""
FastAPI Prediction Microservice for Smart Mess AI.
Provides high-performance REST endpoints for model inference and metrics.
"""

import os
import sys
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure src directory is in path
sys.path.insert(0, os.path.dirname(__file__))
from predict import predict_wastage
from model_utils import load_model, DEFAULT_MODELS_DIR

app = FastAPI(
    title="Smart Mess AI Prediction Service",
    description="Microservice providing machine learning food wastage predictions for college mess dining.",
    version="1.0.0"
)

# Enable CORS for local backend and frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    total_students: int = Field(..., gt=0, description="Total expected or attending students for the meal")
    food_prepared: Optional[float] = Field(None, ge=0, description="Planned or prepared food quantity in kg")
    meal_type: Optional[str] = Field("lunch", description="Type of meal: breakfast, lunch, or dinner")
    historical_wastage: Optional[float] = Field(None, ge=0, description="Known historical waste from previous day in kg")
    meal_date: Optional[str] = Field(None, description="Target meal date in YYYY-MM-DD format")


class PredictResponse(BaseModel):
    success: bool
    predicted_wastage: float
    unit: str
    model_version: str
    algorithm: str
    inputs: Dict[str, Any]
    estimated_useful_food_kg: float
    waste_percentage: float
    confidence_interval: Dict[str, float]
    evaluation_summary: Dict[str, float]
    timestamp: str
    message: str


@app.get("/health")
def health_check():
    try:
        _, metadata = load_model()
        return {
            "status": "healthy",
            "service": "smart-mess-ml-service",
            "model_version": metadata.get("model_version", "v2.0.0"),
            "algorithm": metadata.get("algorithm", "Random Forest Regressor")
        }
    except Exception as e:
        return {"status": "degraded", "error": str(e)}


@app.get("/info")
def model_info():
    try:
        _, metadata = load_model()
        return metadata
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict", response_model=PredictResponse)
def predict_endpoint(req: PredictRequest):
    try:
        result = predict_wastage(
            total_students=req.total_students,
            food_prepared=req.food_prepared,
            meal_type=req.meal_type or "lunch",
            historical_wastage=req.historical_wastage,
            meal_date=req.meal_date
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


@app.get("/history")
def actual_vs_predicted_history():
    reports_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "reports"))
    samples_file = os.path.join(reports_dir, "actual_vs_predicted_samples.json")
    if os.path.exists(samples_file):
        import json
        with open(samples_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 5001))
    uvicorn.run("service:app", host="127.0.0.1", port=port, reload=False)
