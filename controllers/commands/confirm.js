var moment = require('moment-timezone'),
    epi = require('epi-week'),
    Survey = require('../../models/Survey'),
    SurveyResponse = require('../../models/SurveyResponse'),
    Reporter = require('../../models/Reporter');

var MESSAGES = {
    registerFirst: 'This phone number has not yet been registered - text the "register" command to sign up.',
    noResponse: 'We could not locate your report - use the "report" command first to enter data.',
    thanks: 'Your response has been submitted - thank you!',
    generalError: 'Sorry, there was a problem with the system.  Please try again.'
};

var SOURCE_URL = 'http://sms-interview-msf.herokuapp.com/';

// Submit a survey response to Crisis Map using its API.
function pushToCrisisMaps(survey, response, reporter) {
    // data needed to submit a reply to the Crisis Map API
    var formData = {
        source: SOURCE_URL,
        author: 'tel:' + response.phoneNumber,
        id: SOURCE_URL + 'responses/' + response._id,
        map_id: survey.cmId,
        topic_ids: [survey.cmId + '.' + survey.cmTopicId],
        submitted: response.completedOn.getTime()/1000,
        effective: new Date().getTime()/1000, // TODO: EPI week
        location: [reporter.locationLat, reporter.locationLng], // TODO
        place_id: reporter.placeId, // TODO
        answers: {}
    };

    // Format answers
    for (var i = 0, l = response.responses.length; i<l; i++) {
        var resp = response.responses[i];

        // Create specially formatted answer key
        var cmAnswerKey = [
            survey.cmId,
            survey.cmTopicId,
            survey.questions[i].cmId
        ].join('.');

        // Use the type appropriate for the question
        var actualAnswer = resp.textResponse;
        if (survey.questions[i].responseType === 'number') {
            actualAnswer = resp.numberResponse;
        }

        formData.answers[cmAnswerKey] = actualAnswer;
    }

    // Submit new crisis maps API response
    console.log('[' + response.phoneNumber + '] posting to Crisis Map: ',
        formData);
    request({
        method: 'POST',
        url: 'https://msfcrisismap.appspot.com/.api/reports',
        qs: {key: survey.cmApiKey},
        json: [formData]
    }, function(err, message, apiResponse) {
        console.log('[' + response.phoneNumber + '] reply from Crisis Map: ',
            apiResponse);
        // For now this is out of band, just log any error or success
        if (err) {
            console.error(err);
        }
    });
}

module.exports = function(number, message, surveyId, callback) {
    var reporter;
    // Defaults to current epi week, need to make this configurable
    var interval = epi(moment().tz('Africa/Lagos').toDate());

    // Determine which reporter we're working with...
    Reporter.findOne({
        phoneNumbers: number
    }, function(err, rep) {
        if (!rep) {
            callback(err, MESSAGES.registerFirst);
        } else {
            console.log('[' + number + '] found reporter: ' + rep._id);
            reporter = rep;
            updateSurveyResponse();
        }
    });

    // Find pending survey response
    function updateSurveyResponse() {
        SurveyResponse.findOne({
            _surveyId: surveyId,
            _reporterId: reporter._id,
            placeId: reporter.placeIds[0],
            interval: interval
        }, function(err, sr) {
            if (!sr) {
                callback(err, MESSAGES.noResponse);
            } else {
                sr.complete = true;
                sr.completedOn = new Date();
                sr.commentText = message;
                sr.save(function(err) {
                    if (err) {
                        callback(err, MESSAGES.generalError);
                    } else {
                        callback(err, MESSAGES.thanks);
                    }
                    /*
                    if (survey.cmId) {
                        pushToCrisisMaps(survey, sr, reporter);
                    }
                    */
                })
            }
        });
    }
};