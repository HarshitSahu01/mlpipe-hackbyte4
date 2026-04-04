import os
import json
import pickle
import importlib.util
import numpy as np

# -------------------------------
# ENV VARIABLES (Pipeline Controlled)
# -------------------------------
INPUT_PATH = os.getenv("INPUT_PATH", "/tmp/input.json")
OUTPUT_PATH = os.getenv("OUTPUT_PATH", "/tmp/output.json")

print("🚀 ML Pipeline Step Execution Started")

# -------------------------------
# 1. LOAD INPUT
# -------------------------------
if not os.path.exists(INPUT_PATH):
    raise FileNotFoundError(f"Input file not found at {INPUT_PATH}")

with open(INPUT_PATH, "r") as f:
    input_json = json.load(f)

data = input_json.get("data", {})
features = np.array(data.get("features", []))

if features.size == 0:
    raise ValueError("❌ No features provided in input")

print(f"✅ Input loaded: {features.shape}")

# -------------------------------
# 2. MODEL DETECTION LOGIC
# -------------------------------
model = None
predictions = None

files = os.listdir()

# ---- Case 1: Pickle Model ----
for file in files:
    if file.endswith(".pkl"):
        print(f"📦 Detected Pickle model: {file}")
        with open(file, "rb") as f:
            model = pickle.load(f)
        predictions = model.predict(features).tolist()
        break

# ---- Case 2: model.py ----
if predictions is None and "model.py" in files:
    print("📦 Detected Python model (model.py)")

    spec = importlib.util.spec_from_file_location("model", "model.py")
    model_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(model_module)

    if hasattr(model_module, "predict"):
        predictions = model_module.predict(features)
    else:
        raise Exception("❌ model.py must contain a predict() function")

# ---- Case 3: config-driven (future-ready) ----
if predictions is None and "config.json" in files:
    print("📦 Detected config.json (future pipeline support)")
    raise Exception("⚠️ Config-based execution not implemented yet")

# ---- No Model Found ----
if predictions is None:
    raise Exception("❌ No valid model found (.pkl or model.py)")

# -------------------------------
# 3. OUTPUT FORMAT (Pipeline Standard)
# -------------------------------
output = {
    "status": "success",
    "step": "inference",
    "predictions": predictions
}

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

with open(OUTPUT_PATH, "w") as f:
    json.dump(output, f)

print(f"✅ Output saved at {OUTPUT_PATH}")
print("🎯 Step execution completed successfully")