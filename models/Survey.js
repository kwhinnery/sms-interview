var mongoose = require('mongoose');

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
    }
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
    questions: [QuestionSchema]
});

module.exports = mongoose.model('Survey', SurveySchema);