var util = require('util'),
    moment = require('moment-timezone'),
    epi = require('epi-week'),
    request = require('request'),
    Reporter = require('../../models/Reporter'),
    Survey = require('../../models/Survey'),
    SurveyResponse = require('../../models/SurveyResponse');

var MESSAGES = {
    noSurveyFound: 'No survey found for this phone number.',
    registerFirst: 'This phone number has not yet been registered - text the "register" command to sign up.',
    questions: '[MSF]: Please enter the following data for %s in %s:',
    numericInputRequired: 'Error: numeric input required for %s.',
    confirm: 'About to submit the following data for %s in %s:%s \nText "confirm <any comments>" to confirm and submit this data.',
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

// Handle a command to create a new report 
exports.report = function(number, message, surveyId, callback) {
    var survey, reporter;
    // Defaults to current epi week, need to make this configurable
    var interval = epi(moment().tz('Africa/Lagos').toDate());

    // Determine which survey, reporter we're working with...
    // TODO: also determine which place we're currently reporting for, currently
    // hard coded for the first place associated with a user
    Survey.findById(surveyId, function(err, doc) {
        if (err || !doc) {
            console.log(err);
            callback(err, MESSAGES.noSurveyFound);
        } else {
            survey = doc;
            // Now find the reporter
            Reporter.findOne({
                phoneNumbers: number
            }, function(err, rep) {
                if (!rep) {
                    callback(err, MESSAGES.registerFirst);
                } else {
                    console.log('[' + number + '] found reporter: ' + rep._id);
                    reporter = rep;
                    processInput();
                }
            });
        }
    });

    // print out survey questions
    function printSurvey() {
        var dataList = survey.questions.map(function(question) {
            return question.summaryText;
        });
        var baseMessage = util.format(
            MESSAGES.questions,
            reporter.placeIds[0],
            'Week: '+interval.week+', Year: '+interval.year
        );
        return baseMessage + '\n' + dataList.join(',\n');
    }

    // process user command input
    function processInput() {

        // Attempt to grab responses from a comma separated list
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
                        )+' '+printSurvey());
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
            createSurveyResponse(responses);

        } else {
            // otherwise, print out current questions
            callback(null, printSurvey());
        }
    }

    // With current data collected, create and save a SurveyResponse
    function createSurveyResponse(responses) {
        var sr = new SurveyResponse({
            _surveyId: surveyId,
            _reporterId: reporter._id,
            placeId: reporter.placeIds[0],
            interval: interval,
            phoneNumber: number,
            complete: false,
            commentText: '',
            responses: responses
        });
        
        sr.save(function(err) {
            if (err) {
                console.log(err);
                callback(err, MESSAGES.generalError);
            } else {
                callback(null, 'Your report has been successfully completed.  Thank you for this information.');
                if (survey.cmId) {
                    pushToCrisisMaps(survey, sr, reporter);
                }
            }
        });
    }
};

exports.change = function(number, message, surveyId, callback) {
    callback(null, 'testing change...');
};
