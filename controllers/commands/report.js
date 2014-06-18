var util = require('util'),
    Reporter = require('../../models/Reporter'),
    Survey = require('../../models/Survey'),
    SurveyResponse = require('../../models/SurveyResponse');

var MESSAGES = {
    noSurveyFound: 'No survey found for this phone number.',
    registerFirst: 'This phone number has not yet been registered - text the "register" command to sign up.',
    questions: '[MSF]: Please enter the following data for ACHIDA in epi week 25:',
    numericInputRequired: 'Error: numeric input required for %s.',
    confirm: 'Submit this report for '
};

// Handle a command to create a new report 
exports.report = function(number, message, surveyId, callback) {
    var survey, reporter, answers = [];

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
        return [MESSAGES.questions].concat(dataList).join('\n');
    }

    // process user command input
    function processInput() {

        // Attempt to grab responses from a comma separated list
        var answerInputs = message.split(',');

        if (answerInputs.length === survey.questions.length) {
            // try to use these answers for the actual report
            for (var i = 0; i<answerInputs.length; i++) {
                var answerText = answerInputs[i].trim(),
                    question = survey.questions[i];

                if (question.responseType === 'number') {
                    var casted = Number(answerText);
                    if (!isNaN(casted)) {
                        answers.push(casted);
                    } else {
                        callback(null, util.format(
                            MESSAGES.numericInputRequired,
                            question.summaryText
                        )+' '+printSurvey());
                        return;
                    }
                } else {
                    // for now throw everything else in as just text
                    answers.push(answerText);
                }
            }

            // Now that we have answers processed, create a survey response
            createSurveyResponse();

        } else {
            // otherwise, print out current questions
            callback(null, printSurvey());
        }
    }

    // With current data collected, create and save a SurveyResponse
    function createSurveyResponse() {
        console.log(answers);
        callback(null, 'derp');
    }
};

exports.change = function(number, message, surveyId, callback) {
    callback(null, 'testing change...');
};