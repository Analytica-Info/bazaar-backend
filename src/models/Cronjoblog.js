const mongoose = require('mongoose');

const cronjobSchema = new mongoose.Schema({
  cron_job_start: {
    type: String,
    required: true
  },
  new_products: {
    type: String,
    required: true
  },
  total_products: {
    type: String,
    required: true
  },
  parked_products: {
    type: String,
    required: true
  },
  inactive_products: {
    type: String,
    required: true
  },
  
  cron_job_end: {
    type: String,
    required: true
  },
 
});

const Cronjoblog = mongoose.model('cronjoblog', cronjobSchema);

module.exports = Cronjoblog;