FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy logic and model
COPY run.py .
COPY regressor.pkl .

# Set entry point
CMD ["python", "run.py"]
