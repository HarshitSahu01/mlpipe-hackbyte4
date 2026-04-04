import os
from pymongo import MongoClient
from bson import ObjectId

try:
    client = MongoClient('mongodb://localhost:27017')
    db = client['ml-pipeline']
    # Find the most recent build task
    task = db.tasks.find_one({'taskType': 'build'}, sort=[('createdAt', -1)])
    if task:
        print(f"Task _id: {task.get('_id')}")
        print(f"Status: {task.get('status')}")
        print(f"localLogsPath: '{task.get('localLogsPath')}'")
        print(f"celeryTaskId: {task.get('celeryTaskId')}")
    else:
        print("No build tasks found.")
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
