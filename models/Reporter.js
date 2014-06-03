var mongoose = require('mongoose');

var ReporterSchema = new mongoose.Schema({
    name: {
        type: String,
        default: 'Anonymous Reporter'
    }, // Name of the reporter
    phoneNumbers: [String], // Phone numbers associated with reporter
    trusted: { // Whether or not a survey is accepting responses/editable
        type: Boolean,
        default: false
    },
    
    // Lat/long of the most specific admin level associated with this reporter
    locationLat: Number,
    locationLng: Number,

    // May need to generalize this eventually, just track an array of admin
    // levels - separating for now to assist with querying
    admin0: String, // Highest admin level, Country typically
    admin1: String,
    admin2: String,
    admin3: String,
    admin4: String,
    admin5: String // Lowest admin level
});

module.exports = mongoose.model('Reporter', ReporterSchema);