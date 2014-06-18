var util = require('util');
var Reporter = require('../../models/Reporter');
var locations = require('../../data/locations.json');

// Produces a human-readable list of locations for a given array of place IDs.
function formatPlaces(placeIds) {
    var names = [];
    for (var i = 0; i < placeIds.length; i++) {
        var location = locations.all[placeIds[i]];
        if (location) {
            names.push(location.levelName + ': ' +
                       location.allNames.join(', '));
        }
    }
    return placeIds.length + ' location' +
        (placeIds.length == 1 ? '' : 's') +
        (placeIds.length == 0 ? '.' : ':\n') +
        names.join(';\n');
}

// Looks for any valid place IDs among all whitespace-separated words that
// follow the command.  If any are found, registers the current sender as a
// reporter with those place IDs; otherwise lists the current places for
// this sender without changing them.  To clear the list of places for a
// sender, text "register clear".
module.exports = function(number, message, surveyId, callback) {
    var words = message.toUpperCase().split(/\s+/);
    var placeIds = [];
    var clear = false;
    for (var i = 0; i < words.length; i++) {
        var word = words[i].toUpperCase();
        if (locations.all[word]) {
            placeIds.push(word);
        }
        if (word === 'CLEAR') {
            clear = true;
        }
    }

    reporter = Reporter.findOne({
        phoneNumbers: number
    }, function(err, reporter) {
        if (err) callback(err);
        if (reporter) {
            console.log('[' + number + '] found reporter: ' + reporter._id);
        } else {
            console.log('[' + number + '] no reporter found');
            reporter = new Reporter({
                phoneNumbers: [number],
                placeIds: []
            });
        }
        if (placeIds.length || clear) {
            reporter.placeIds = placeIds;
            reporter.save(function(err) {
                if (err) callback(err);
                console.log('[' + number + '] saved reporter with placeIds: ' +
                    '[' + placeIds + ']');
                callback(null, 'You are now registered for ' +
                    formatPlaces(placeIds));
            });
        } else {
            callback(null, 'You are currently registered for ' +
                formatPlaces(reporter.placeIds || []));
        }
    });
};
