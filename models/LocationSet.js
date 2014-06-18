var mongoose = require('mongoose');

var LocationSetSchema = new mongoose.Schema({
    name: String,
    adminLevels: mongoose.Schema.Types.Mixed
});

// Create mongoose model
var LocationSet = mongoose.model('LocationSet', LocationSetSchema);
module.exports = LocationSet;