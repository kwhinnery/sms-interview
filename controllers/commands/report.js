var util = require('util'),
    moment = require('moment-timezone'),
    epi = require('epi-week'),
    request = require('request'),
    locations = require('../../data/locations.json'),
    Reporter = require('../../models/Reporter'),
    SurveyResponse = require('../../models/SurveyResponse');

var MESSAGES = {
    noSurveyFound: 'No survey found for this phone number.',
    registerFirst: 'This phone number has not been registered. Please use a registered phone or call the hotline for help.',
    questions: '[MSF]: Please enter data for %s, %s:',
    chooseLocation: 'What location would you like to report for? Text the number in front of the name to choose:\n',
    numericInputRequired: 'Error: numeric input required for %s.',
    locationNumberError: 'Error: Please choose a valid number from these choices:\n',
    anyOtherDiseases: 'Any other diseases to report? Please provide details.',
    confirmReport: 'Please review your report for %s, %s:\n%s.\nIs this correct? Text "yes" or "no".',
    generalError: 'Sorry, there was a problem with the system. Please try again.',
    thanks: 'Your report has been submitted. Thank you!',
};

var SOURCE_URL = 'http://sms-interview-msf.herokuapp.com/';
var CRISIS_MAP_API_URL = 'https://msfcrisismap.appspot.com/.api/reports';

// print out question responses
function printResponses(questions, responses) {
    var answers = [];
    for (var i = 0; i < responses.length; i++) {
        var q = questions[i], r = responses[i];
        var tr = r.textResponse;
        if (q.responseType === 'number' && r.numberResponse === null) {
            tr = 'Unknown';
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

    if (!survey) {
        callback(null, MESSAGES.noSurveyFound);
        return;
    }
    if (!reporter.placeIds || !reporter.placeIds.length) {
        callback(null, MESSAGES.registerFirst);
        return;
    };

    if (step === 0) {
        // determine the current place ID
        if (reporter.placeIds.length === 1) {
            // If the user only has one, set it and move on
            reporter.currentPlaceId = reporter.placeIds[0];
            step = 2;
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
        } else {
            reporter.currentPlaceId = reporter.placeIds[placeIndex-1];
            callback(null, printSurvey(), 2);
            return;
        }
    }

    if (step === 2) {
        // Receive comma-separated data, ask for confirmation.
        var answerInputs = message.split(',');
        if (answerInputs.length === survey.questions.length) {
            // try to use these answers for the actual report
            var responses = [];
            for (var i = 0; i<answerInputs.length; i++) {
                var answerText = answerInputs[i].trim(),
                    question = survey.questions[i];

                if (question.responseType === 'number') {
                    var casted = Number(answerText);
                    if (answerText.toUpperCase() === 'U') {
                        // let users enter "u" to mean "unknown"
                        casted = null;
                    }
                    if (!isNaN(casted)) {
                        responses.push({
                            _questionId: question._id,
                            textResponse: answerText,
                            numberResponse: casted  // a number or null
                        });
                    } else {
                        callback(null, util.format(
                            MESSAGES.numericInputRequired,
                            question.summaryText
                        ) + ' ' + printSurvey(), 2);
                        return;
                    }
                } else {
                    // for now throw everything else in as just text
                    responses.push({
                        _questionId: question._id,
                        textResponse: answerText
                    });
                }
            }

            // Now that we have answers processed, create a survey response
            updateSurveyResponse(responses);

        } else {
            // otherwise, print out current questions
            callback(null, printSurvey(), 2);
        }
        return;
    }

    if (step === 3) {
        // Receive yes/no confirmation, ask for comments.
        var words = message.replace(/[^\w\s]/g, '').trim().split(/\s+/);
        if (words[0].toLowerCase() === 'yes') {
            callback(null, MESSAGES.anyOtherDiseases, 4);
        } else if (words[0].toLowerCase() === 'no') {
            callback(null, printSurvey(), 2);
        } else {
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
                    MESSAGES.confirmReport,
                    locations.all[reporter.currentPlaceId].name,
                    'Week ' + interval.week,
                    printResponses(survey.questions, sr.responses)
                ), 3);
            });
        }
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

    // print out survey questions
    function printSurvey() {
        var dataList = survey.questions.map(function(question) {
            return question.summaryText;
        });
        var baseMessage = util.format(
            MESSAGES.questions,
            locations.all[reporter.currentPlaceId].name,
            'Week ' + interval.week
        );
        return baseMessage + '\n' + dataList.join(',\n');
    }

    // Save the current data to a new or existing SurveyResponse.
    function updateSurveyResponse(responses) {
        // Create new or update pending response
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
                } else {
                    callback(null, util.format(
                        MESSAGES.confirmReport,
                        locations.all[reporter.currentPlaceId].name,
                        'Week ' + interval.week,
                        printResponses(survey.questions, sr.responses)
                    ), 3);
                }
            });
        });
    }
};
