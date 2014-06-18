var util = require('util'),
    Reporter = require('../../models/Reporter'),
    Survey = require('../../models/Survey'),
    SurveyResponse = require('../../models/SurveyResponse');

var MESSAGES = {
    noSurveyFound: 'No survey found for this phone number.',
    registerFirst: 'This phone number has not yet been registered - text the "register" command to sign up.',
    questions: '[MSF]: Please enter the following data for ACHIDA in epi week 25:',
    numericInputRequired: 'Error: numeric input required for %s.',
    confirm: 'Submit this report for ',
    generalError: 'Sorry, there was a problem with the system.  Please try again.'
};

// Handle a command to create a new report 
exports.report = function(number, message, surveyId, callback) {
    var survey, reporter;

    // Determine which survey we're working with...
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
        return MESSAGES.questions + '\n' + dataList.join(',\n');
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
            phoneNumber: number,
            complete: true,
            completedOn: new Date(),
            commentText: '',
            responses: responses
        });
        // TODO: Ask for confirmation before saving the response.
        // TODO: Push the response to Crisis Map.
        sr.save(function(err) {
            if (err) {
                console.log(err);
                callback(err, MESSAGES.generalError);
            } else {
                callback(null, 'Your report has been successfully completed.  Thank you for this information.');
            }
        });
    }
};

exports.change = function(number, message, surveyId, callback) {
    callback(null, 'testing change...');
};
