var util = require('util'),
    moment = require('moment-timezone'),
    epi = require('epi-week'),
    request = require('request'),
    Reporter = require('../../models/Reporter'),
    SurveyResponse = require('../../models/SurveyResponse');

var MESSAGES = {
    noSurveyFound: 'No survey found for this phone number.',
    registerFirst: 'This phone number has not been registered. Please use a registered phone or call the hotline for help.',
    questions: '[MSF]: Please enter the following data for %s in %s:',
    numericInputRequired: 'Error: numeric input required for %s.',
    confirm: 'Please review your report for %s in %s:\n%s\nIs this correct? Text "yes" or "no".',
    generalError: 'Sorry, there was a problem with the system.  Please try again.',
    thanks: 'Your report has been submitted.  Thank you!',
};

// print out question responses
function printResponses(questions, responses) {
    var str = '';
    for (var i = 0; i < responses.length; i++) {
        var q = questions[i], r = responses[i];
        var tr = r.textResponse;
        if (q.responseType === 'number' && r.numberResponse === null) {
            tr = 'Unknown';
        }
        str = str + q.summaryText + ': ' + tr +'\n';
    }
    return str;
}

// Report submission workflow.
// Step 0: Instruct the reporter to enter disease data.
// Step 1: Receive disease data, ask for confirmation.
// TODO: Add a step to ask for any other diseases to report.
exports.report = function(number, step, message, survey, reporter, callback) {
    var survey;
    // Defaults to current epi week, need to make this configurable
    var interval = epi(moment().tz('Africa/Lagos').toDate());

    // TODO: also determine which place we're currently reporting for, currently
    // hard coded for the first place associated with a user
    if (!survey) {
        callback(null, MESSAGES.noSurveyFound);
        return;
    }
    if (!reporter.placeIds || !reporter.placeIds.length) {
        callback(null, MESSAGES.registerFirst);
        return;
    };

    if (step === 0) {
        callback(null, printSurvey(), 1);
        return;
    }

    if (step === 1) {
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
            updateSurveyResponse(responses);

        } else {
            // otherwise, print out current questions
            callback(null, printSurvey(), 1);
        }
        return;
    }

    if (step === 2) {
        var words = message.replace(/[^\w\s]/g, '').trim().split(/\s+/);
        if (words[0].toLowerCase() === 'yes') {
            finalizeSurveyResponse();
        } else if (words[0].toLowerCase() === 'no') {
            callback(null, printSurvey(), 1);
        } else {
            SurveyResponse.findOne({
                _surveyId: survey._id,
                _reporterId: reporter._id,
                placeId: reporter.placeIds[0],
                interval: interval
            }, function(err, sr) {
                if (err || !sr) {
                    callback(err || 'missing sr', printSurvey(), 1);
                }
                callback(null, util.format(
                    MESSAGES.confirm,
                    reporter.placeIds[0],
                    'Epi Week '+interval.week+' ('+interval.year+')',
                    printResponses(survey.questions, sr.responses)
                ), 2);
            });
        }
    }

    // print out survey questions
    function printSurvey() {
        var dataList = survey.questions.map(function(question) {
            return question.summaryText;
        });
        var baseMessage = util.format(
            MESSAGES.questions,
            reporter.placeIds[0],
            'Epi Week ' + interval.week + ' (' + interval.year + ')'
        );
        return baseMessage + '\n' + dataList.join(',\n');
    }

    // Save the current data to a new or existing SurveyResponse.
    function updateSurveyResponse(responses) {
        // Create new or update pending response
        SurveyResponse.findOne({
            _surveyId: survey._id,
            _reporterId: reporter._id,
            placeId: reporter.placeIds[0],
            interval: interval
        }, function(err, sr) {
            sr = sr || new SurveyResponse({
                _surveyId: survey._id,
                _reporterId: reporter._id,
                placeId: reporter.placeIds[0],
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
                    var msg = util.format(
                        MESSAGES.confirm,
                        reporter.placeIds[0],
                        'Epi Week '+interval.week+' ('+interval.year+')',
                        printResponses(survey.questions, responses)
                    );
                    callback(null, msg, 2);
                }
            });
        });
    }

    // Upon receiving confirmation, close out a pending response.
    function finalizeSurveyResponse() {
        // Find pending survey response
        SurveyResponse.findOne({
            _surveyId: survey._id,
            _reporterId: reporter._id,
            placeId: reporter.placeIds[0],
            interval: interval
        }, function(err, sr) {
            if (!sr) {
                callback(err, MESSAGES.noResponse);
                return;
            }
            sr.complete = true;
            sr.completedOn = new Date();
            sr.commentText = message;
            sr.save(function(err) {
                if (err) {
                    callback(err, MESSAGES.generalError);
                    return;
                }
                callback(err, MESSAGES.thanks);
                /*
                if (survey.cmId) {
                    pushToCrisisMaps(survey, sr, reporter);
                }
                */
            });
        });
    }
};
