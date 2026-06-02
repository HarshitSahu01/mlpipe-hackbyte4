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
    raise FileNotFoundError(f"❌ Input path not found at {INPUT_PATH}")

input_data_list = []
source_files = []

# Logic to handle different input types (Directory vs File)
if os.path.isdir(INPUT_PATH):
    print(f"📂 Detected directory input: {INPUT_PATH}")
    # Priority 1: look for input.json
    json_path = os.path.join(INPUT_PATH, "input.json")
    if os.path.exists(json_path):
        with open(json_path, "r") as f:
            input_data_list.append(json.load(f))
            source_files.append("input.json")
    else:
        # Priority 2: look for CSV files (Batch processing)
        csv_files = [f for f in os.listdir(INPUT_PATH) if f.lower().endswith(".csv")]
        if csv_files:
            print(f"📊 Found {len(csv_files)} CSV files for batch processing")
            for csv_f in csv_files:
                import pandas as pd
                df = pd.read_csv(os.path.join(INPUT_PATH, csv_f))
                # Convert to standard features format
                # If the CSV has a 'features' column (JSON string) or just columns
                # We'll assume columns match feature requirements or use the whole row
                input_data_list.append({"data": {"features": df.values.tolist()}})
                source_files.append(csv_f)
        else:
            # Priority 3: try any other file in the directory
            any_files = [f for f in os.listdir(INPUT_PATH) if os.path.isfile(os.path.join(INPUT_PATH, f))]
            if any_files:
                first_file = os.path.join(INPUT_PATH, any_files[0])
                print(f"📄 Trying first file found: {any_files[0]}")
                with open(first_file, "r") as f:
                    try:
                        input_data_list.append(json.load(f))
                        source_files.append(any_files[0])
                    except:
                        raise ValueError(f"❌ First file {any_files[0]} is not valid JSON")
            else:
                raise FileNotFoundError(f"❌ Input directory is empty: {INPUT_PATH}")
else:
    # INPUT_PATH is a direct file (e.g. from a previous node)
    print(f"📄 Detected file input: {INPUT_PATH}")
    with open(INPUT_PATH, "r") as f:
        input_data_list.append(json.load(f))
        source_files.append(os.path.basename(INPUT_PATH))

print(f"✅ Total inputs detected: {len(input_data_list)}")

# -------------------------------
# 2. MODEL DETECTION & EXECUTION
# -------------------------------
final_results = []
model = None
model_type = None

# Initialize Model detection items
files = os.listdir()
pickle_file = next((f for f in files if f.endswith(".pkl")), None)
python_model = "model.py" if "model.py" in files else None

if pickle_file:
    print(f"📦 Loading Pickle model: {pickle_file}")
    with open(pickle_file, "rb") as f:
        model = pickle.load(f)
    model_type = "pickle"
elif python_model:
    print("📦 Loading Python model (model.py)")
    spec = importlib.util.spec_from_file_location("model", python_model)
    model_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(model_module)
    if not hasattr(model_module, "predict"):
        raise Exception("❌ model.py must contain a predict() function")
    model = model_module
    model_type = "python"
else:
    raise Exception("❌ No valid model found (.pkl or model.py)")

# ---- Execute all inputs ----
for i, input_json in enumerate(input_data_list):
    data = input_json.get("data", {})
    features = np.array(data.get("features", []))
    
    if features.size == 0:
        print(f"⚠ Skipping input {i}: No features found")
        continue
    
    if model_type == "pickle":
        preds = model.predict(features).tolist()
    else:
        # model.py might return numpy array or list
        preds = model.predict(features)
        if isinstance(preds, np.ndarray):
            preds = preds.tolist()
        
    final_results.append({
        "source": source_files[i],
        "predictions": preds
    })

# -------------------------------
# 3. OUTPUT FORMAT (Pipeline Standard)
# -------------------------------
output = {
    "status": "success",
    "step": "inference",
    "results": final_results,
    # For backward compatibility with older components:
    "predictions": final_results[0]["predictions"] if final_results else []
}

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

with open(OUTPUT_PATH, "w") as f:
    json.dump(output, f)

print(f"✅ Output saved at {OUTPUT_PATH}")
print("🎯 Step execution completed successfully")