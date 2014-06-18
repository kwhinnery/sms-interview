var Reporter = require('../../models/Reporter'),
    Survey = require('../../models/Survey');

// Handle a command to create a new report 
exports.report = function(number, message, surveyId, callback) {
    if (message === '') {
        // If there's no input, determine which survey they should be taking and
        // display the data needed for collection

    } else {

    }

    callback(null, 'testing report...');
};

exports.change = function(number, message, surveyId, callback) {
    callback(null, 'testing change...');
};