var util = require('util'),
    mongoose = require('mongoose'),
    request = require('request'),
    Levenshtein = require('levenshtein'),
    Survey = require('./Survey'),
    Reporter = require('./Reporter'),
    locations = require('../data/locations');

// System message strings - TODO: localize, externalize
var MESSAGES = {
    yes: 'yes',
    no: 'no',
    generalError: 'There was a problem recording your response - please try again later',
    promptLocation:'%s: Please text the name of the ward you are reporting for (example: Adunu):',
    chooseLocation: 'Which of these locations did you mean? Text the number to choose: %s',
    chooseLocationError: 'I\'m sorry, I did not understand. Please text a single number for one of the following: %s',
    confirmLocation: 'It looks like you are located in %s. Is that correct? (text "yes" or "no")',
    confirmSurvey: 'Are these answers correct (text "yes" or "no")?\n',
    comment: 'Is there any other information you would like to share?',
    done: 'Thank you for this information.'
};

// Interview states
var STATES = {
    promptLocation:1, // Prompt for free-form entry of location info
    chooseLocation:2, // Give the user a list of known locations to choose from
    confirmLocation:3, // Confirm the user's location, allow them to change
    fillOutSurvey:4, // While in this state, collect answers for all survey questions
    confirmSurvey:5, // Present survey confirmation
    done:6, // finished state
    comment:7 // prompting for comment
};

var QuestionResponseSchema = new mongoose.Schema({
    textResponse: { // Actual text of a response
        type: String,
        required: true
    },
    booleanResponse: Boolean, // casted response, if relevant
    numberResponse: Number, // casted response, if relevant
    _questionId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    }
});

var SurveyResponseSchema = new mongoose.Schema({
    _surveyId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    _reporterId: mongoose.Schema.Types.ObjectId,
    state: Number, // state of the interview process
    phoneNumber: { // phone number of the reporter
        type: String,
        required: true
    },
    preLocated: { // whether or not to use the reporter's existing info
        type:Boolean,
        default:false
    },
    closestLocations: mongoose.Schema.Types.Mixed,
    chosenLocationIndex: Number,
    _currentQuestionId: mongoose.Schema.Types.ObjectId,
    complete: {
        type: Boolean,
        default: false
    },
    completedOn: Date,
    commentText: String, // Each survey ends with a comment
    responses: [QuestionResponseSchema]
});

// Save a survey to crisis maps via API
function pushToCrisisMaps(survey, response, reporter) {
    // data needed to submit a reply to the Crisis Maps API
    var sourceUrl = 'http://example.org/';
    var formData = {
        source: sourceUrl,
        author: 'tel:'+response.phoneNumber,
        id: sourceUrl+'responses/'+response._id,
        map_id: survey.cmId,
        topic_ids: [ survey.cmId+'.'+survey.cmTopicId ],
        published: response.completedOn.getTime()/1000,
        effective: new Date().getTime()/1000, // TODO: EPI week
        location: [reporter.locationLat, reporter.locationLng],
        answers: {}
    };

    // Format answers
    for (var i = 0, l = response.responses.length; i<l; i++) {
        var resp = response.responses[i],
            cmAnswer = {};

        // Create specially formatted answer key
        var cmAnswerKey = [
            survey.cmId, 
            survey.cmTopicId, 
            survey.questions[i].cmId
        ].join('.');

        // Use casted value if present
        var actualAnswer = resp.textResponse;
        if (typeof resp.booleanResponse !== 'undefined') {
            actualAnswer = resp.booleanResponse;
        } else if (typeof resp.numberResponse !== 'undefined') {
            actualAnswer = resp.numberResponse;
        }

        formData.answers[cmAnswerKey] = actualAnswer;
    }

    // Submit new crisis maps API response
    console.log(formData);
    request({
        method: 'POST',
        url: 'https://msfcrisismap.appspot.com/.api/reports',
        qs: {
            key: survey.cmApiKey
        },
        json: [formData]
    }, function(err, message, apiResponse) {
        console.log(apiResponse);
        // For now this is out of band, just log any error or success
        if (err) { 
            console.error(err); 
        } else {
            console.log('Sent response to Crisis Map, ID was: '+response._id);
        }
    });
}

// Get the closest match to a given input, given a range of possible values
function getClosest(input, possibleValues) {
    var matches = [], maxMatches = 3;

    for (var i = 0, l = possibleValues.length; i<l; i++) {
        var possibleLocation = possibleValues[i];
        possibleLocation.levDistance = new Levenshtein(
            possibleLocation.ward.toLowerCase().trim(), 
            input.toLowerCase().trim()
        ).distance;

        // See if this one should replace another in the list
        for (var j = 0; j < maxMatches; j++) {
            var currentMatch = matches[j];
            if (currentMatch) {
                // Test to see if this one is better than the top ones
                if (possibleLocation.levDistance < currentMatch.levDistance) {
                    matches.splice(j,0,possibleLocation);
                    matches = matches.slice(0,maxMatches);
                    break;
                }
            } else {
                // If there is no better match, throw it in at the current index
                matches.splice(j,0,possibleLocation);
                break;
            }
        }
    }

    return matches;
}

// Helper method to format a string of location choices
function printChoices(locationData) {
    var choices = '\n';
    for (var i = 0; i < locationData.length; i++) {
        choices = choices + (i+1)+': ' + locationData[i].ward
            + ' (' + locationData[i].district + ', '
            + locationData[i].state + ')\n';
    }
    return choices;
} 

// Process the given message and determine an appropriate text response,
// given the current state of this response.
SurveyResponseSchema.methods.processMessage = function(survey, message, number, callback) {
    var self = this, reporter;

    // Find an associated reporter, if we have one for this number
    Reporter.findOne({
        phoneNumbers: number
    }, function(err, rep) {
        if (!rep) {
            reporter = new Reporter({
                phoneNumbers: [number]
            });
            reporter.save(function(err) {
                if (err) {
                    callback(err, MESSAGES.generalError);
                } else {
                    determineLocation();
                }
            });
        } else {
            reporter = rep;
            determineLocation();
        }
    });

    // After finding the reporter, we need to determine the reporter's current
    // location
    function determineLocation() {
        self._reporterId = reporter._id;

        // If the response has not been started, determine location
        if (!self.state) {
            // Use the reporter's location (if we have it)
            if (reporter.locationLat && reporter.locationLng) {
                self.state = STATES.confirmLocation;
                self.preLocated = true;
                self.save(function(err) {
                    var msg = util.format(
                        MESSAGES.confirmLocation,
                        reporter.admin0
                    );
                    callback(err, msg);
                });
            } else {
                // Otherwise, prompt the reporter to tell us where they are 
                // reporting from
                self.state = STATES.promptLocation;
                self.preLocated = false;
                self.save(function(err) {
                    var msg = util.format(MESSAGES.promptLocation, survey.name);
                    callback(err, msg);
                });
            }
        } else if (self.state === STATES.promptLocation) {
            // handle location input - Levenshtein distance of top 3
            var closest = getClosest(message.trim(), locations);
            self.state = STATES.chooseLocation;
            self.closestLocations = closest;
            self.save(function(err) {
                var choices = printChoices(closest);
                var msg = util.format(MESSAGES.chooseLocation, choices);
                callback(err, msg);
            });
        } else if (self.state === STATES.chooseLocation) {
            // Process selection of location
            var choice = Number(message);
            if (!isNaN(choice) && choice <= self.closestLocations.length) {
                self.chosenLocationIndex = choice-1;
                self.state = STATES.confirmLocation;
                self.save(function(err) {
                    var msg = util.format(
                        MESSAGES.confirmLocation,
                        self.closestLocations[self.chosenLocationIndex].ward
                    );
                    callback(err, msg);
                });
            } else {
                // If it's not something we can work with, ask them to choose again
                var choices = printChoices(self.closestLocations);
                var msg = util.format(MESSAGES.chooseLocationError, choices);
                callback(null, msg);
            }
        } else if (self.state === STATES.confirmLocation) {
            // After the reporter location is all set, continue
            function updateWithLocation() {
                // then go through the survey questions
                self.state = STATES.fillOutSurvey;
                self.save(function(err) {
                    doSurvey();
                });
            }

            if (message.toLowerCase() === MESSAGES.yes) {
                // If the reporter is already located, just update the interview
                // state
                if (self.preLocated) {
                    updateWithLocation();
                } else {
                    var selectedLocation = self.closestLocations[self.chosenLocationIndex];
                    reporter.locationLat = selectedLocation.lat;
                    reporter.locationLng = selectedLocation.lng;
                    reporter.admin0 = selectedLocation.ward;
                    reporter.admin1 = selectedLocation.district;
                    reporter.admin2 = selectedLocation.state;
                    reporter.save(function(err) {
                        if (err) {
                            self.state = STATES.promptLocation;
                            self.save(function(err2) {
                                callback(err, STATES.promptLocation, MESSAGES.generalError);
                            });
                        } else {
                            // then go through the survey questions
                            updateWithLocation();
                        }
                    });
                }
            } else {
                // If no or anything but yes, start location process over
                self.state = STATES.promptLocation;
                self.preLocated = false;
                self.closestLocations = null;
                self.chosenLocationIndex = null;
                self.save(function(err) {
                    var msg = util.format(MESSAGES.promptLocation, survey.name);
                    callback(err, msg);
                });
            }
        } else {
            doSurvey();
        }
    }

    // Fill out survey questions
    function doSurvey() {
        if (self.state === STATES.fillOutSurvey) {
            // Determine if processing a question  response is needed
            if (self._currentQuestionId) {
                // Create a response for the given question
                var questions = survey.questions, question;
                for (var i = 0, l = questions.length; i<l; i++) {
                    var q = questions[i];
                    if (q._id = self._currentQuestionId) {
                        question = q;
                        break;
                    }
                }

                // Process question answer and cast to relevant type if needed
                if (question) {
                    var questionResponse = {
                        _questionId: question._id,
                        textResponse: message
                    };

                    // Try and cast to number, if needed
                    if (question.responseType === 'number') {
                        var n = Number(message);
                        if (!isNaN(n)) {
                            questionResponse.numberResponse = n;
                        } else {
                            // TODO: Error when the response is wrong
                        }
                    } else if (question.responseType === 'boolean') {
                        var b = message.trim().toLowerCase() === MESSAGES.yes;
                        questionResponse.booleanResponse = b;
                    }

                    // Save in responses array
                    self.responses.push(questionResponse);
                    self._currentQuestionId = null;
                    self.save(function(err) {
                        if (err) {
                            callback(err, MESSAGES.generalError);
                        } else {
                            askOrFinish();
                        }
                    });

                } else {
                    self._currentQuestionId = null;
                    self.save(function(err) {
                        askOrFinish();
                    });
                }

            } else {
                askOrFinish();
            }

        } else if (self.state === STATES.confirmSurvey) {
            
            // Confirm question answers before comment
            if (message.toLowerCase() === MESSAGES.yes) {

                self.state = STATES.comment;
                self.save(function(err) {
                    callback(err, MESSAGES.comment);
                });

            } else {
                // If no or anything but yes, start the whole process over!
                self.state = STATES.promptLocation;
                self.responses = [];
                self.save(function(err) {
                    var msg = util.format(MESSAGES.promptLocation, survey.name);
                    callback(err, msg);
                });
            }

        } else if (self.state === STATES.comment) {
            
            // Save and finalize report
            self.commentText = message;
            self.state = STATES.done;
            self.complete = true;
            self.completedOn = new Date();
            self.save(function(err) {
                callback(err, MESSAGES.done);
                // Out of band, save to crisis maps if needed
                if (survey.cmId) {
                    pushToCrisisMaps(survey, self, reporter);
                }
            });

        } else {
            // The absolute default case is to print out the current status
            // of the survey and prompt for confirmation
            printSurvey();
        }

        // Show current survey status and prompt for confirmation
        function printSurvey() {
            var questions = survey.questions,
                responses = self.responses,
                summary = '';

            for (var i = 0, l = questions.length; i<l; i++) {
                summary = summary + questions[i].summaryText +': '+
                    responses[i].textResponse;
                if (i+1 != questions.length) {
                    summary = summary+', \n';
                }
            }

            self.state = STATES.confirmSurvey;
            self.save(function(err) {
                var msg = MESSAGES.confirmSurvey+summary;
                callback(err, msg);
            });
        }

        // Ask the next question, if needed
        function askOrFinish() {
            // Grab the survey questions for this survey
            var questions = survey.questions,
                responses = self.responses;

            // if we have a question, ask it
            if (responses.length < questions.length) {
                self._currentQuestionId = questions[responses.length]._id;
                self.save(function(err) {
                    callback(err, questions[responses.length].text);
                });
            } else {
                // If all the questions have been answered,
                // Update survey state
                printSurvey();
            }
        }
    }
};

module.exports = mongoose.model('SurveyResponse', SurveyResponseSchema);