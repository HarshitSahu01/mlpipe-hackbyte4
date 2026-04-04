import os
import json
import pickle
import pandas as pd
import numpy as np

# Pipeline paths (mapped in Docker via environment variables)
INPUT_DIR = os.environ.get("INPUT_PATH", "/tmp/input")
OUTPUT_DIR = os.environ.get("OUTPUT_PATH", "/tmp/output")
# We now process all CSV files in INPUT_DIR

def load_model():
    model_path = "regressor.pkl"
    with open(model_path, "rb") as f:
        return pickle.load(f)

def run_inference():
    print("🚀 House Regressor: Starting Batch Inference...")
    
    # Ensure output dir exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Find all CSV files in Input
    files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(".csv")]
    if not files:
        print(f"⚠ No CSV files found in {INPUT_DIR}")
        return

    model = load_model()
    required_features = ['Lot Area', 'Overall Qual', 'Year Built', 'Full Bath', 'Gr Liv Area']

    for filename in files:
        input_path = os.path.join(INPUT_DIR, filename)
        print(f"--- Processing: {filename} ---")
        
        try:
            # Read CSV
            df_input = pd.read_csv(input_path)
            
            # Ensure all required features are present
            for feat in required_features:
                if feat not in df_input.columns:
                    df_input[feat] = 0 # Default if missing
            
            X = df_input[required_features].fillna(0)
            predictions = model.predict(X).tolist()

            # Try to pass through listing prices if available in CSV
            listing_prices = []
            if 'SalePrice' in df_input.columns:
                listing_prices = df_input['SalePrice'].tolist()
            elif 'listing_price' in df_input.columns:
                listing_prices = df_input['listing_price'].tolist()

            output = {
                "status": "success",
                "source_file": filename,
                "predictions": predictions,
                "listing_prices": listing_prices
            }

            output_filename = filename.rsplit('.', 1)[0] + "_output.json"
            output_path = os.path.join(OUTPUT_DIR, output_filename)
            
            with open(output_path, "w") as f:
                json.dump(output, f)
            print(f"✅ Results saved to {output_path}")
            
        except Exception as e:
            print(f"❌ Error processing {filename}: {e}")

if __name__ == "__main__":
    run_inference()
