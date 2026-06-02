import pandas as pd
import numpy as np
import pickle
import os
from sklearn.ensemble import RandomForestRegressor
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split

def train():
    # 1. Load Data
    data_path = 'AmesHousing.csv'
    if not os.path.exists(data_path):
        data_path = os.path.join('mytemp', 'AmesHousing.csv')
    
    df = pd.read_csv(data_path)
    print(f"Loaded {len(df)} rows.")

    # 2. Model 1: Regressor
    features = ['Lot Area', 'Overall Qual', 'Year Built', 'Full Bath', 'Gr Liv Area']
    X = df[features].fillna(0)
    y = df['SalePrice']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)
    print(f"Training Regressor on {len(X_train)} rows.")

    model_1 = RandomForestRegressor(n_estimators=100, random_state=42)
    model_1.fit(X_train, y_train)

    # Save Regressor
    with open('regressor.pkl', 'wb') as f:
        pickle.dump(model_1, f)
    print("Saved regressor.pkl")

    # 3. Model 2: Classifier
    # Use Model 1 predictions on the test set to train Model 2
    market_value_predictions = model_1.predict(X_test)
    actual_listing_prices = y_test.values 

    price_gap = market_value_predictions - actual_listing_prices
    labels = (price_gap > (actual_listing_prices * 0.05)).astype(int)

    # Input for Model 2 is predictions and gap
    X_model2 = np.column_stack((market_value_predictions, price_gap))

    print(f"Training Classifier on {len(X_model2)} rows.")
    model_2 = DecisionTreeClassifier()
    model_2.fit(X_model2, labels)

    # Save Classifier
    with open('classifier.pkl', 'wb') as f:
        pickle.dump(model_2, f)
    print("Saved classifier.pkl")

if __name__ == "__main__":
    train()
