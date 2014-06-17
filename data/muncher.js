var fs = require('fs'),
    path = require('path'),
    csv = require('fast-csv');

/* 
An object literal with location data for a administrative hierarchy. Here's
the format:

{
    childAdminLevel: 'state',
    children: {
        'SOKOTO': {
            code: 'SO',
            centroidLat: null,
            centroidLng: null,
            childAdminLevel: 'district',
            children: {
                'WURNO': {
                    code: '22',
                    centroidLat: null,
                    centroidLng: null,
                    childAdminLevel: 'ward',
                    children: {
                        'ACHIDA': {
                            code: '8',
                            centroidLat: 13.1670,
                            centroidLng: 5.3959
                        }
                    }
                }
            }
        }
    }
}

*/
var locations = { childAdminLevel: 'state', children: {} },
    rowsProcessed = 0,
    first = true;

// Read in location data and store in an array
csv.fromPath(path.join(__dirname, 'wards.csv')).on('record', function(data) {
    if (first) {
        first = false;
        return;
    }

    // Grab relevant data
    var wardLng = data[0],
        wardLat = data[1],
        ward = data[3],
        wardCode = data[4],
        state = data[5],
        stateCode = data[6],
        district = data[7],
        districtCode = data[8];

    // Create admin hierarchy
    if (!locations.children[state]) {
        locations.children[state] = {
            code: stateCode,
            centroidLat: null,
            centroidLng: null,
            childAdminLevel: 'district',
            children: {}
        };
    }

    if (!locations.children[state].children[district]) {
        locations.children[state].children[district] = {
            code: districtCode,
            centroidLat: null,
            centroidLng: null,
            childAdminLevel: 'ward',
            children: {}
        };
    }

    if (!locations.children[state].children[district].children[ward]) {
        locations.children[state].children[district].children[ward] = {
            code: wardCode,
            centroidLat: Number(wardLat),
            centroidLng: Number(wardLng)
        };
    }

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
