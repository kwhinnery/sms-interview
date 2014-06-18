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
    survey: 'Please enter data for %s, %s in order: %s. For unknowns enter "U".',
    chooseLocation: 'Which location are you reporting for? Reply with a number:\n%s',
    fieldsRequired: 'Please enter data for %s, %s as %d items with a comma after each: %s. For unknowns enter "U".',
    numberRequired: 'A number (or "U" for unknown) is required for %s. Please enter data for %s, %s in order: %s.',
    locationNumberRequired: 'Please reply with a number in this list:\n%s',
    anyOtherDiseases: 'Any other diseases to report? Please provide details.',
    confirmReport: 'For %s, %s we have:\n%s.\nIs this correct? Reply "yes" or "no".',
    generalError: 'Sorry, there was a problem with the system. Please try again.',
    thanks: 'Your report has been submitted. Thank you!',
};

// Steps
var GIVE_INSTRUCTIONS = 0;
var EXPECT_LOCATION = 1;
var EXPECT_DATA = 2;
var EXPECT_CONFIRMATION = 3;
var EXPECT_COMMENT = 4;

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
        text: response.commentText,
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
        return callback(null, MESSAGES.noSurveyFound);
    }
    if (!reporter.placeIds || !reporter.placeIds.length) {
        return callback(null, MESSAGES.notRegistered);
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

    if (step === GIVE_INSTRUCTIONS) {
        // determine the current place ID
        if (reporter.placeIds.length === 1) {
            // If the user only has one, set it and move on
            reporter.currentPlaceId = reporter.placeIds[0];
            return callback(null, printSurvey(), EXPECT_DATA);
        } else {
            // Ask the user to choose their location
            return callback(null, util.format(MESSAGES.chooseLocation,
                printLocations(reporter.placeIds)), EXPECT_LOCATION);
        }
    }

    if (step === EXPECT_LOCATION) {
        // grab the chosen place ID
        var words = message.replace(/[^\w\s]/g, '').trim().split(/\s+/);
        var placeIndex = Number(words[0]);
        if (!(placeIndex >= 1 && placeIndex <= reporter.placeIds.length)) {
            return callback(null, util.format(MESSAGES.locationNumberRequired,
                printLocations(reporter.placeIds)), EXPECT_LOCATION);
        }
        reporter.currentPlaceId = reporter.placeIds[placeIndex-1];
        return callback(null, printSurvey(), EXPECT_DATA);
    }

    if (step === EXPECT_DATA) {
        // Receive comma-separated data, ask for confirmation.
        var answerInputs = message.split(',');
        if (answerInputs.length < survey.questions.length) {
            return callback(null, util.format(MESSAGES.fieldsRequired,
                getPlaceName(), intervalName, survey.questions.length,
                questionList), EXPECT_DATA);
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
                    return callback(null, util.format(MESSAGES.numberRequired,
                        question.summaryText, getPlaceName(), intervalName,
                        questionList), EXPECT_DATA);
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
                    return callback(err, MESSAGES.generalError);
                }
                return callback(null, util.format(
                    MESSAGES.confirmReport, getPlaceName(), intervalName,
                    printResponses(survey.questions, sr.responses)
                ), EXPECT_CONFIRMATION);
            });
        });
        return;
    }

    if (step === EXPECT_CONFIRMATION) {
        // Receive yes/no confirmation, ask for comments.
        var words = message.replace(/[^\w\s]/g, '').trim().split(/\s+/);
        if (words[0].toLowerCase() === 'yes') {
            // Even if the next message starts with "report" or "register",
            // treat it as part of the comment.
            reporter.lockCurrentCommand = true;
            return callback(null, MESSAGES.anyOtherDiseases, EXPECT_COMMENT);
        }
        if (words[0].toLowerCase() === 'no') {
            return callback(null, printSurvey(), EXPECT_DATA);
        }
        SurveyResponse.findOne({
            _surveyId: survey._id,
            _reporterId: reporter._id,
            placeId: reporter.currentPlaceId,
            interval: interval
        }, function(err, sr) {
            if (err || !sr) {
                return callback(err || 'missing sr', printSurvey(), EXPECT_DATA);
            }
            return callback(null, util.format(
                MESSAGES.confirmReport, getPlaceName(), intervalName,
                printResponses(survey.questions, sr.responses)
            ), EXPECT_CONFIRMATION);
        });
        return;
    }

    if (step === EXPECT_COMMENT) {
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
                    return callback(err, MESSAGES.generalError);
                }
                if (survey.cmId) {
                    pushToCrisisMap(survey, sr, reporter);
                }
                return callback(err, MESSAGES.thanks);
            });
        });
    }
};
