var fs = require('fs'),
    path = require('path'),
    csv = require('fast-csv');

// An object literal with location data
var locations = [],
    rowsProcessed = 0,
    first = true;

// Read in location data and store in an array
csv.fromPath(path.join(__dirname, 'wards.csv')).on('record', function(data) {
    if (first) {
        first = false;
        return;
    }

    // Grab relevant data
    var ward = data[3],
        wardLng = data[0],
        wardLat = data[1],
        state = data[5],
        district = data[7];

    // Add to location list
    locations.push({
        lat: wardLat,
        lng: wardLng,
        ward: ward,
        district: district,
        state: state
    });

    rowsProcessed++;
}).on('end', function() {
    var outputPath = path.join(__dirname, 'locations.json'),
        str = JSON.stringify(locations, null, 2);

    // Write out results to a JSON file which can be required in JS
    fs.writeFile(outputPath, str, function(error) {
        console.log('Finished parsing locations - %s rows processed.', rowsProcessed);
        if (error) {
            console.error('Error writing JSON output: '+error);
        } else {
            console.log('Wrote output to '+outputPath);
        }
    });
});