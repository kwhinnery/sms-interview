var mongoose = require('mongoose');

var QuestionResponseSchema = new mongoose.Schema({
    text: { // Actual text of a question
        type: String,
        required: true
    },
    responseType: { // The type of data expected (text/number/boolean)
        type: String,
        required: true
    }
});

var SurveyResponseSchema = new mongoose.Schema({
    _surveyId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    finished: {
        type: Boolean,
        default: false
    },
    locationLat: Number,
    locationLng: Number,
    locationText: String, // Ward name, etc

});

module.exports = mongoose.model('SurveyResponse', SurveyResponseSchema);