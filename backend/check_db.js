const mongoose = require('mongoose');

async function check() {
  await mongoose.connect('mongodb://localhost:27017/ml-pipeline');
  const Task = mongoose.model('Task', new mongoose.Schema({}, { strict: false }));
  const task = await Task.findOne({ taskType: 'build' }).sort({ createdAt: -1 });
  if (task) {
    console.log('Task ID:', task._id);
    console.log('Status:', task.status);
    console.log('localLogsPath:', task.localLogsPath);
    console.log('celeryTaskId:', task.celeryTaskId);
  } else {
    console.log('No build task found.');
  }
  process.exit();
}

check();
