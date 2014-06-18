// Init MongoDB/Mongoose
require('mongoose').connect(process.env.MONGODB_URL);

var locations = require('../data/locations.json'),
    LocationSet = require('../models/LocationSet');

var l = new LocationSet({
    name: 'Nigeria Wards',
    adminLevels: locations
});

l.save(function(err) {
    console.log(err);
});