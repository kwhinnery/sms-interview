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
    findLocation: 'What %s are you reporting for? Example Response: "%s".',
    adminLevelReportHelp: 'Text "none" if you are reporting at the %s level.',
    inputError: 'We didn\'t understand that reply.',
    generalError: 'There was a problem recording your response - please try again later.',
    promptLocation:'Please text the number of the location you are reporting for:\n%s',
    promptLocationError:'We didn\'t understand that response - please text the number of the location you are reporting for, or "new" for another location:',
    chooseLocation: 'Which %s did you mean? Text the number to choose:\n%s',
    chooseLocationError: 'I\'m sorry, I did not understand. Please text a single number for one of the following: %s',
    confirmLocation: 'Here is the information we have for your current location:\n%s\nIs that correct? (text "yes" or "no")',
    confirmSurvey: 'Are these answers correct (text "yes" or "no")?\n',
    comment: 'Any other diseases or comments (please specify disease and number)?',
    doneWithLocation: 'Or text "done" if you are reporting for %s.',
    doneInput: 'done',
    done: 'Thank you for this information.',
    noneOfThese: 'None of these are what I meant, let me text the name again.',
    noneOfTheseLocations: 'None of these - I want to report for a new location.',
    previousLevel: 'None of these, I am reporting for the previous administrative level.'
};

// Interview states
var STATES = {
    promptLocation:1, // Prompt for free-form entry of location info
    chooseLocation:2, // Give the user a list of known locations to choose from
    confirmLocation:3, // Confirm the user's location, allow them to change
    fillOutSurvey:4, // While in this state, collect answers for all survey questions
    confirmSurvey:5, // Present survey confirmation
    done:6, // finished state
    comment:7, // prompting for comment
    findLocation: 8,
    parseLocation: 9,
    chooseFromPastLocations: 10,
    choosePossibleLocation: 11,
    acceptLocation:12,
    establishTimeframe:13
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

    // a hierarchy of admin levels the person is reporting for - this is used
    adminLevels: [mongoose.Schema.Types.Mixed],

    closestLocations: mongoose.Schema.Types.Mixed,
    currentSearchAdminLevel:String,

    // final location information about the interview
    locationData: mongoose.Schema.Types.Mixed,

    // For dynamic survey questions
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
        place_id: reporter.placeId,
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
    console.log('[' + response.phoneNumber + '] posting to Crisis Map: ' + formData);
    request({
        method: 'POST',
        url: 'https://msfcrisismap.appspot.com/.api/reports',
        qs: {
            key: survey.cmApiKey
        },
        json: [formData]
    }, function(err, message, apiResponse) {
        console.log('[' + response.phoneNumber + '] reply from Crisis Map: ' + apiResponse);
        // For now this is out of band, just log any error or success
        if (err) { 
            console.error(err); 
        } else {
            console.log('[' + response.phoneNumber + '] posted to Crisis Map, ID was: '+response._id);
        }
    });
}

// Get the closest match to a given input, given a range of possible values
function getClosest(input, possibleValues) {
    var matches = [], maxMatches = 5;

    for (var i = 0, l = possibleValues.length; i<l; i++) {
        var possibleLocation = possibleValues[i];
        var levDistance = new Levenshtein(
            possibleLocation.toLowerCase().trim(), 
            input.toLowerCase().trim()
        ).distance;

        // See if this one should replace another in the list
        for (var j = 0; j < maxMatches; j++) {
            var currentMatch = matches[j];
            if (currentMatch) {
                // Test to see if this one is better than the top ones
                if (levDistance < currentMatch.levDistance) {
                    matches.splice(j,0, {
                        value: possibleLocation,
                        levDistance: levDistance
                    });
                    matches = matches.slice(0,maxMatches);
                    break;
                }
            } else {
                // If there is no better match, throw it in at the current index
                matches.splice(j,0,{
                    value: possibleLocation,
                    levDistance: levDistance
                });
                break;
            }
        }
    }

    return matches.map(function(el) {
        return el.value;
    });
}

// Helper method to format a string of location choices for an interview
function printChoices(choices, skipPrevious) {
    var choiceString = '\n';
    for (var i = 0; i < choices.length; i++) {
        var choice = choices[i];
        choiceString = choiceString + (i+1)+': '+choice+'\n';
    }

    // Include choices for "none of these"
    choiceString = choiceString + (choices.length+1) + ': ' + MESSAGES.noneOfThese +'\n';
    choiceString = choiceString + (choices.length+2) + ': ' + MESSAGES.previousLevel; 
    return choiceString;
} 

// Print out a selection of historical locations to choose from for quick usage
function printPastLocations(locationHistory) {
    var choiceString = '\n', maxChoices = 5;
    for (var i = 0; i < locationHistory.length; i++) {
        var locationData = locationHistory[i], 
            adminHierarchy = '';

        for (var j = locationData.adminLevels.length-1; j >= 0; j--) {
            adminHierarchy = adminHierarchy + locationData.adminLevels[j].value;
            if (j-1 >= 0) {
                adminHierarchy = adminHierarchy + ', ';
            }
        }
        choiceString = choiceString + (i+1) + ': ' + adminHierarchy+'\n';

        if (maxChoices == (i+1)) {
            break;
        }
    }

    // Include choices for "none of these"
    choiceString = choiceString + (locationHistory.length+1) + ': ' 
        + MESSAGES.noneOfTheseLocations +'\n';
    return choiceString;
}

// Process the given message and determine an appropriate text response,
// given the current state of this response. TODO: This is a garbage implementation.
// A better approach would be a stack of "middleware" that could be applied for
// a given survey. Each would be responsible for updating its own part of the
// SurveyResponse state before passing control on to the next middleware.
SurveyResponseSchema.methods.processMessage = function(survey, message, number, callback) {
    var self = this, reporter;
    console.log('[' + number + '] surveyResponse state: ' + self.state);

    // Find an associated reporter, if we have one for this number
    Reporter.findOne({
        phoneNumbers: number
    }, function(err, rep) {
        if (err) {
            // There's a problem with the data store, nuke this response and
            // start over
            doOver(MESSAGES.generalError);
        } else {
            if (!rep) {
                console.log('[' + number + '] no reporter found, creating one');
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
                console.log('[' + number + '] found reporter: ' + rep._id);
                reporter = rep;
                determineLocation();
            }
        }
    });

    // After finding the reporter, we need to determine the reporter's current
    // location
    function determineLocation() {
        self._reporterId = reporter._id;

        if (!self.state) {
            // Use one of the reporter's last locations
            if (reporter.locationHistory && reporter.locationHistory.length > 0) {
                self.state = STATES.chooseLocation;
                choosePreviousLocation();
            } else {
                // Otherwise, prompt the reporter to tell us where they are 
                // reporting from
                self.state = STATES.findLocation;
                interviewForLocation();
            }
        }  else if (
            self.state === STATES.chooseLocation ||
            self.state === STATES.chooseFromPastLocations
        ) {
            // Choose a previous location, react to location choice
            choosePreviousLocation();
        } else if (
            self.state === STATES.findLocation ||
            self.state === STATES.choosePossibleLocation ||
            self.state === STATES.parseLocation ||
            self.state === STATES.confirmLocation ||
            self.state === STATES.acceptLocation
        ) {
            // conduct/continue an interview process to get a new location
            interviewForLocation();
        } else {
            // The default next step is to establish the timeframe for the survey
            doTimeframe();
        }
    }

    // choose location from previous set of locations
    function choosePreviousLocation() {
        if (self.state === STATES.chooseLocation) {
            var reply = util.format(
                MESSAGES.promptLocation,
                printPastLocations(reporter.locationHistory)
            );
            self.state = STATES.chooseFromPastLocations;
            self.save(function(err) {
                if (err) {
                    doOver(MESSAGES.generalError);
                } else {
                    callback(err, reply)
                }
            });
        } else if (self.state === STATES.chooseFromPastLocations) {
            console.log('['+number+'] processing location from history...');

            // Try to parse a number response
            var enteredNumber = Number(message);
            if (isNaN(enteredNumber)) {
                // If not a number, prompt them to enter again
                callback(null, util.format(
                    MESSAGES.inputError + ' ' + MESSAGES.promptLocation,
                    printPastLocations(reporter.locationHistory)
                ));
            } else {

                // If it is a number, grab info about the chosen option
                if (reporter.locationHistory[enteredNumber-1]) {
                    self.locationData = reporter.locationHistory[enteredNumber-1];
                    self.state = STATES.establishTimeframe;
                    doTimeframe();
                } else if (enteredNumber === self.locationHistory.length+1) {
                    // If it's the none response (length+1) interview for location
                    self.state = STATES.findLocation;
                    self.adminLevels = [];
                    interviewForLocation();
                } else {
                    // if it's not a recognized choice, have them do it again
                    callback(null, util.format(
                        MESSAGES.inputError + ' ' + MESSAGES.promptLocation,
                        printPastLocations(reporter.locationHistory)
                    ));
                }
            }
        } else {
            // The default next step is to establish the timeframe for the survey
            doTimeframe();
        }
    }

    // manage an interview process to determine and add a new location to a
    // reporter's history
    function interviewForLocation() {
        if (self.state === STATES.findLocation) {
            console.log('['+number+'] prompting for location data...');

            if (!self.adminLevels || self.adminLevels.length === 0) {
                // find the root admin level and ask for one of those
                var rootAdminLevel = locations.childAdminLevel,
                    example = Object.keys(locations.children)[0];

                var reply = util.format(
                    MESSAGES.findLocation,
                    rootAdminLevel,
                    example
                );
                self.adminLevels = [];
                self.state = STATES.parseLocation;
                self.save(function(err) {
                    callback(err, reply);
                });
            } else {
                var searchObject = locations;
                for (var i = 0; i < self.adminLevels.length; i++) {
                    if (searchObject.children) {
                        searchObject = searchObject.children[self.adminLevels[i]];
                    }
                }

                if (searchObject.children) {
                    // if the lowest admin level still has children, ask them to
                    // drill down
                    var reply = util.format(
                        MESSAGES.findLocation,
                        searchObject.childAdminLevel,
                        Object.keys(searchObject.children)[0]
                    );

                    // Allow people to text "done" if they are reporting for
                    // the last admin level
                    var instructions = util.format(
                        MESSAGES.doneWithLocation,
                        self.adminLevels[self.adminLevels.length-1]
                    );
                    reply = reply+' '+instructions;

                    self.state = STATES.parseLocation;
                    self.save(function(err) {
                        callback(err, reply);
                    });
                } else {
                    // If there are no more admin levels, move to confirm location
                    self.state = STATES.confirmLocation;
                    interviewForLocation();
                }
            }
        } else if (self.state === STATES.parseLocation) {
            console.log('['+number+'] parsing entered location...');

            if (message.toLowerCase().trim() === MESSAGES.doneInput) {
                // If they text done, we assume they have no more location info
                // to offer
                self.state = STATES.confirmLocation;
                interviewForLocation();
            } else {
                // deal with location input from the previous interview step. Figure out
                // which admin level to search against...
                var searchObject = locations;
                for (var i = 0; i < self.adminLevels.length; i++) {
                    searchObject = searchObject.children[self.adminLevels[i]];
                }
                var searchSet = Object.keys(searchObject.children);

                // Get closest matches for input
                var closest = getClosest(message, searchSet);

                // If we have an exact match, go ahead and use that
                var match;
                for (var i = 0, l = closest.length; i<l; i++) {
                    var test = closest[i];
                    if (test.toLowerCase().trim() === message.toLowerCase().trim()) {
                        match = test;
                        break;
                    }
                }
                if (match) {
                    self.state = STATES.findLocation;
                    self.adminLevels.push(match);
                    interviewForLocation();
                } else {
                    // If we don't have a 100% match, ask the user which one is them
                    self.state = STATES.choosePossibleLocation;
                    self.currentSearchAdminLevel = searchObject.childAdminLevel;
                    self.closestLocations = closest;
                    self.save(function(err) {
                        if (err) {
                            doOver(MESSAGES.generalError);
                        } else {
                            var reply = util.format(
                                MESSAGES.chooseLocation,
                                searchObject.childAdminLevel,
                                printChoices(closest)
                            );
                            callback(err, reply);
                        }
                    });
                }
            }

        } else if (self.state === STATES.choosePossibleLocation) {
            console.log('['+number+'] processing location choice...');

            // Try to parse a number response
            var enteredNumber = Number(message);
            if (isNaN(enteredNumber)) {
                // If not a number, prompt them to enter again
                callback(null, util.format(
                    MESSAGES.inputError + ' ' + MESSAGES.chooseLocation,
                    self.currentSearchAdminLevel,
                    printChoices(self.closestLocations)
                ));
            } else {

                // If it is a number, grab info about the chosen admin level
                if (self.closestLocations[enteredNumber-1]) {
                    self.adminLevels.push(self.closestLocations[enteredNumber-1]);
                    self.state = STATES.findLocation;
                    interviewForLocation();
                } else if (enteredNumber === self.closestLocations.length+1) {
                    // If it's the none response (length+1) prompt again
                    self.state = STATES.findLocation;
                    self.adminLevels = [];
                    interviewForLocation();
                } else if (enteredNumber === self.closestLocations.length+2) {
                    // If we're cool at the current admin level (length+2),
                    // That's fine - we can move on
                    self.state = STATES.confirmLocation;
                    interviewForLocation();
                } else {
                    // bad state
                    doOver(MESSAGES.generalError);
                }
            }

        } else if (self.state === STATES.confirmLocation) {
            // Print back and confirm the location being used 
            var locationSummary = '', locationObject = locations;
            for (var i = 0; i < self.adminLevels.length; i++) {
                var adminLevel = self.adminLevels[i];
                var adminLevelLabel = locationObject.childAdminLevel;
                locationSummary = locationSummary + adminLevelLabel +
                    ': ' + adminLevel + '\n';
                locationObject = locationObject.children[adminLevel];
            }

            var reply = util.format(MESSAGES.confirmLocation, locationSummary);
            self.state = STATES.acceptLocation;
            self.save(function(err) {
                if (err) {
                    doOver(MESSAGES.generalError);
                } else {
                    callback(err, reply);
                }
            });
        } else if (self.state === STATES.acceptLocation) {
            // process user input, confirming/rejecting location interview data
            if (message.toLowerCase().trim() === MESSAGES.yes) {
                // Save the current location to the history for the reporter,
                // and to the location info field for the response
                var savedLocationData = { adminLevels: [] };

                var locationObject = locations;
                for (var i = 0; i < self.adminLevels.length; i++) {
                    var adminLevel = self.adminLevels[i],
                        adminLevelInfo = locationObject.children[adminLevel],
                        savedAdminLevelData = {
                            type: locationObject.childAdminLevel,
                            value: adminLevel,
                            code: adminLevelInfo.code
                        };

                    savedLocationData.centroidLat = adminLevelInfo.centroidLat;
                    savedLocationData.centroidLng = adminLevelInfo.centroidLng;
                    savedLocationData.adminLevels.push(savedAdminLevelData);

                    locationObject = locationObject.children[adminLevel];
                }

                self.state = STATES.establishTimeframe;
                self.locationData = savedLocationData;
                self.save(function(err) {
                    // save in history for reporter
                    reporter.saveToHistory(savedLocationData, doTimeframe);
                });
            } else {
                // If not, start the interview process over again
                self.adminLevels = [];
                self.state = STATES.findLocation;
                interviewForLocation();
            }
        } else {
            // This is a bad state, prompt to start over
            doOver(MESSAGES.generalError);
        }
    }

    // establish the timeframe (EPI week) for the current report
    function doTimeframe() {
        callback(null, 'establishing timeframe...');
    }

    // Fill out dynamic survey questions
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

        // do over and reset interview state
        function doOver(doOverMessage) {
            console.log('[' + number + '] deleting interview with message: '+doOverMessage);
            self.remove(function(err, doc) {
                callback(err, doOverMessage);
            });
        }
    }
};

module.exports = mongoose.model('SurveyResponse', SurveyResponseSchema);
