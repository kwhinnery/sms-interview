var mongoose = require('mongoose'),
    request = require('request');

var QuestionSchema = new mongoose.Schema({
    text: { // Actual text of a question
        type: String,
        required: true
    },
    summaryText: { // Displayed when summarizing report over SMS and in reports
        type: String,
        required: true
    },
    responseType: { // The type of data expected (text/number/boolean)
        type: String,
        required: true
    },
    // Crisis Maps data
    cmId: String
});

var SurveySchema = new mongoose.Schema({
    name: String, // Name of the survey
    active: { // Whether or not a survey is accepting responses/editable
        type: Boolean,
        default: true
    },
    locationData: { // hard coded for now to a JSON file in the project repo
        type: String,
        default: 'locations.json'
    },
    questions: [QuestionSchema],
    // Crisis Maps data
    cmId: String,
    cmApiKey: String,
    cmTopicId: String
});

// Create a new survey model from data in Crisis Maps
SurveySchema.statics.importFromCrisisMaps = function(mapId, apiKey, callback) {
    // Pull in crisis maps data
    request({
        method: 'GET',
        url: 'https://msfcrisismap.appspot.com/.api/maps/'+mapId,
        qs: {
            key: apiKey
        },
        json: true
    }, function(err, message, mapData) {
        // Bubble up API error
        if (err) {
            callback(err);
            return;
        }

        // Create a new survey based on data
        var s = new Survey({
            name: mapData.title,
            cmId: mapData.id,
            cmApiKey: apiKey,
            cmTopicId: mapData.topics[0].id
        });


        // Create questions
        mapData.topics[0].questions.forEach(function(question) {
            // Right now the only supported crisis maps types are text and number
            var responseType = 'text';
            if (question.type = 'NUMBER') {
                responseType = 'number';
            } 

            s.questions.push({
                text: question.text,
                summaryText: question.title,
                cmId: question.id,
                responseType: responseType
            });
        });

        // Save the survey
        s.save(function(err, doc) {
            callback(err, doc);
        });
    });
};

// Create mongoose model
var Survey = mongoose.model('Survey', SurveySchema);
module.exports = Survey;