var mongoose = require('mongoose');

var LocationSchema = new mongoose.Schema({
    // Optional lat/long centroid of a location
    lat: Number,
    lng: Number,
    
    // Array of associated administrative levels for this location, starting
    // with the least specific at index 0 to the most specific, which is located 
    // at the lat/long centroid above
    adminLevels: [{
        type: String, // the type of admin area, like "state"
        value: String, // the text of the admin area, like "Minnesota"
        code: String // any short code associated with it, like "MN"
    }]
});

// Return a place ID, which is a concatenation of admin levels
LocationSchema.virtual('placeId').get(function() {
    var code = [];
    this.adminLevels.forEach(function(lvl) {
        code.push(lvl.code);
    });
    return code.join('.');
});

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
    // Store recent locations for this reporter
    locations: [LocationSchema]
});

module.exports = mongoose.model('Reporter', ReporterSchema);
