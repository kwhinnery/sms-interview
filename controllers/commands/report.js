var util = require('util'),
    moment = require('moment-timezone'),
    epi = require('epi-week'),
    request = require('request'),
    locations = require('../../data/locations.json'),
    Reporter = require('../../models/Reporter'),
    SurveyResponse = require('../../models/SurveyResponse');

var MESSAGES = {
    noSurveyFound: 'No survey found for this phone number.',
    notRegistered: 'Your phone number has not been registered. Please use a registered phone or call the hotline for help.',
    survey: 'Please enter data for %s, %s in this order: %s. For any unknown items, enter "U".',
    chooseLocation: 'What location would you like to report for? Text the number in front of the name to choose:\n',
    commaSeparatedFieldsRequired: 'Please enter data for %s, %s as %d items with a comma after each: %s. For any unknown items, enter "U".',
    numberRequired: 'A number (or "U" for unknown) is required for %s. Please enter data for %s, %s in this order: %s.',
    locationNumberError: 'Error: Please choose a valid number from these choices:\n',
    anyOtherDiseases: 'Any other diseases to report? Please provide details.',
    confirmReport: 'Please review your report for %s, %s:\n%s.\nIs this correct? Reply "yes" or "no".',
    generalError: 'Sorry, there was a problem with the system. Please try again.',
    thanks: 'Your report has been submitted. Thank you!',
};

var SOURCE_URL = 'http://sms-interview-msf.herokuapp.com/';
var CRISIS_MAP_API_URL = 'https://msfcrisismap.appspot.com/.api/reports';

// print out question responses
function printResponses(questions, responses) {
    var answers = [];
    for (var i = 0; i < responses.length; i++) {
        var q = questions[i], r = responses[i], tr;
        if (q.responseType === 'number') {
            tr = (r.numberResponse === null) ? 'Unknown' : r.numberResponse;
        } else {
            tr = r.textResponse;
        }
        answers.push(q.summaryText + ': ' + tr);
    }
    return answers.join(',\n');
}

// print location choices
function printLocations(placeIds) {
    var answers = [];
    for (var i = 0; i < placeIds.length; i++) {
        var p = placeIds[i];
        answers.push((i+1) + ': ' + locations.all[p].name);
    }
    return answers.join(',\n');
}

// Submit a survey response to Crisis Map using its API.
function pushToCrisisMap(survey, response, reporter) {
    var location = locations.all[response.placeId];

    // data needed to submit a reply to the Crisis Map API
    var formData = {
        source: SOURCE_URL,
        author: 'tel:' + response.phoneNumber,
        id: SOURCE_URL + 'responses/' + response._id,
        map_id: survey.cmId,
        topic_ids: [survey.cmId + '.' + survey.cmTopicId],
        submitted: response.completedOn.getTime()/1000,
        effective: new Date().getTime()/1000, // TODO: EPI week
        location: [location.centroidLat, location.centroidLng],
        place_id: response.placeId,
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
        url: CRISIS_MAP_API_URL,
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

// Report submission workflow.
// Step 0: Instruct the reporter to enter disease data.
// Step 1: Receive disease data, ask for confirmation.
// Step 2: Receive confirmation, ask for other comments.
// Step 3: Save completed report.
module.exports = function(number, step, message, survey, reporter, callback) {
    // Defaults to current epi week, need to make this configurable
    var interval = epi(moment().tz('Africa/Lagos').toDate());
    var intervalName = 'Week ' + interval.week;

    if (!survey) {
        callback(null, MESSAGES.noSurveyFound);
        return;
    }
    if (!reporter.placeIds || !reporter.placeIds.length) {
        callback(null, MESSAGES.notRegistered);
        return;
    };

    var dataList = survey.questions.map(function(q) { return q.summaryText; });
    var questionList = dataList.join(',\n');
    function getPlaceName() {
        return locations.all[reporter.currentPlaceId].name;
    }
    function printSurvey() {
        return util.format(
            MESSAGES.survey, getPlaceName(), intervalName, questionList);
    }

    if (step === 0) {
        // determine the current place ID
        if (reporter.placeIds.length === 1) {
            // If the user only has one, set it and move on
            reporter.currentPlaceId = reporter.placeIds[0];
            callback(null, printSurvey(), 2);
            return;
            // fall through to step 2
        } else {
            // Ask the user to choose their location
            callback(null, 
                MESSAGES.chooseLocation+printLocations(reporter.placeIds), 1);
            return;
        }
    }

    if (step === 1) {
        // grab the chosen place ID
        var words = message.replace(/[^\w\s]/g, '').trim().split(/\s+/);
        var placeIndex = Number(words[0]);
        if (isNaN(placeIndex) || placeIndex > reporter.placeIds.length) {
            var msg = MESSAGES.locationNumberError +
                printLocations(reporter.placeIds);
            callback(null, msg, 1);
            return;
        }
        reporter.currentPlaceId = reporter.placeIds[placeIndex-1];
        callback(null, printSurvey(), 2);
        return;
    }

    if (step === 2) {
        // Receive comma-separated data, ask for confirmation.
        var answerInputs = message.split(',');
        if (answerInputs.length < survey.questions.length) {
            callback(null, util.format(MESSAGES.commaSeparatedFieldsRequired,
                getPlaceName(), intervalName, survey.questions.length,
                questionList), 2);
            return;
        }

        var responses = [];
        for (var i = 0; i < survey.questions.length; i++) {
            var answerText = answerInputs[i].trim();
            var question = survey.questions[i];
            if (question.responseType === 'number') {
                var firstWord = answerText.split(/\s+/)[0];
                var numericValue = Number(firstWord);
                if (firstWord.toUpperCase() === 'U') {
                    // Let users enter "u" to mean "unknown".
                    numericValue = null;
                }
                if (isNaN(numericValue)) {
                    callback(null, util.format(MESSAGES.numberRequired,
                        question.summaryText, getPlaceName(), intervalName,
                        questionList), 2);
                    return;
                }
                responses.push({
                    _questionId: question._id,
                    textResponse: answerText,
                    numberResponse: numericValue
                });
            } else {
                // For now throw everything else in as text.
                responses.push({
                    _questionId: question._id,
                    textResponse: answerText
                });
            }
        }

        // Save the current data to a new or existing SurveyResponse.
        SurveyResponse.findOne({
            _surveyId: survey._id,
            _reporterId: reporter._id,
            placeId: reporter.currentPlaceId,
            interval: interval
        }, function(err, sr) {
            sr = sr || new SurveyResponse({
                _surveyId: survey._id,
                _reporterId: reporter._id,
                placeId: reporter.currentPlaceId,
                interval: interval
            });
            sr.phoneNumber = number;
            sr.complete = false;
            sr.commentText = '';
            sr.responses = responses;
            sr.save(function(err) {
                if (err) {
                    console.log(err);
                    callback(err, MESSAGES.generalError);
                    return;
                }
                callback(null, util.format(
                    MESSAGES.confirmReport, getPlaceName(), intervalName,
                    printResponses(survey.questions, sr.responses)
                ), 3);
            });
        });
        return;
    }

    if (step === 3) {
        // Receive yes/no confirmation, ask for comments.
        var words = message.replace(/[^\w\s]/g, '').trim().split(/\s+/);
        if (words[0].toLowerCase() === 'yes') {
            callback(null, MESSAGES.anyOtherDiseases, 4);
            return;
        }
        if (words[0].toLowerCase() === 'no') {
            callback(null, printSurvey(), 2);
            return;
        }
        SurveyResponse.findOne({
            _surveyId: survey._id,
            _reporterId: reporter._id,
            placeId: reporter.currentPlaceId,
            interval: interval
        }, function(err, sr) {
            if (err || !sr) {
                callback(err || 'missing sr', printSurvey(), 2);
                return;
            }
            callback(null, util.format(
                MESSAGES.confirmReport, getPlaceName(), intervalName,
                printResponses(survey.questions, sr.responses)
            ), 3);
        });
        return;
    }

    if (step === 4) {
        // Last step, receive comments.
        SurveyResponse.findOne({
            _surveyId: survey._id,
            _reporterId: reporter._id,
            placeId: reporter.currentPlaceId,
            interval: interval
        }, function(err, sr) {
            sr.commentText = message;
            sr.complete = true;
            sr.completedOn = new Date();
            sr.save(function(err) {
                if (err) {
                    callback(err, MESSAGES.generalError);
                    return;
                }
                callback(err, MESSAGES.thanks);
                if (survey.cmId) {
                    pushToCrisisMap(survey, sr, reporter);
                }
            });
        });
    }
};
