import os
import json
import pickle
import numpy as np

# Pipeline paths (mapped in Docker via environment variables)
INPUT_DIR = os.environ.get("INPUT_PATH", "/tmp/input")
OUTPUT_DIR = os.environ.get("OUTPUT_PATH", "/tmp/output")
# We now process all JSON files (outputs from regressor) in INPUT_DIR

def load_model():
    model_path = "classifier.pkl"
    with open(model_path, "rb") as f:
        return pickle.load(f)

def run_prediction():
    print("🚀 House Classifier: Starting Batch Decision making...")
    
    # Ensure output dir exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Find all JSON files in Input (outputs from previous stage)
    files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(".json")]
    if not files:
        print(f"⚠ No JSON result files found in {INPUT_DIR}")
        return

    model = load_model()

    for filename in files:
        input_path = os.path.join(INPUT_DIR, filename)
        print(f"--- Processing: {filename} ---")
        
        try:
            with open(input_path, "r") as f:
                regressor_output = json.load(f)

            if regressor_output.get("status") != "success":
                print(f"⚠ Skipping {filename}: Status is {regressor_output.get('status')}")
                continue

            predictions = np.array(regressor_output.get("predictions", []))
            listing_prices = np.array(regressor_output.get("listing_prices", []))

            if len(predictions) == 0 or len(listing_prices) == 0:
                print(f"⚠ Skipping {filename}: Missing data")
                continue

            # Prepare features for Model 2: [predicted market value, price gap]
            price_gap = predictions - listing_prices
            X_model2 = np.column_stack((predictions, price_gap))

            class_decisions = model.predict(X_model2)
            results = ["BUY" if dec == 1 else "PASS" for dec in class_decisions]

            output = {
                "status": "success",
                "source_file": filename,
                "decisions": results,
                "raw_predictions": predictions.tolist(),
                "listing_prices": listing_prices.tolist()
            }

            output_filename = filename.rsplit('.', 1)[0] + "_final.json"
            output_path = os.path.join(OUTPUT_DIR, output_filename)
            
            with open(output_path, "w") as f:
                json.dump(output, f)
            print(f"✅ Final decision saved to {output_path}")
            
        except Exception as e:
            print(f"❌ Error processing {filename}: {e}")

if __name__ == "__main__":
    run_prediction()
