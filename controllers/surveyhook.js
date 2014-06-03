var Survey = require('../models/Survey'),
    SurveyResponse = require('../models/SurveyResponse');

// Respond with the appropriate content, depending on the messaging provider
// Right now, it's either Twilio or Telerivet
function respond(message, request, response) {
    // Render appropriate response 
    response.type('text/xml');
    response.send('<Response><Message>'+message+'</Message></Response>');
}

// A webhook to be used by Twilio or Telerivet to build a survey response
exports.webhook = function(request, response) {
    var phoneNumber = request.param('From'),
        messageBody = request.param('Body');

    Survey.findById(request.param('id'), function(err, survey) {
        var msg = 'No survey found for this phone number.';

        // If we found the survey, continue
        if (survey) {
            // Find survey response for the current phone number and survey
            SurveyResponse.findOne({
                _surveyId: survey._id,
                phoneNumber: phoneNumber,
                complete: false
            }, function(err, surveyResponse) {
                // The message to be returned to the user after the latest
                // input
                function processed(err, message) {
                    if (err) {
                        message = 'There was an error processing your response, please try again.';
                    }
                    respond(message, request, response);
                }

                // Process from an existing response or create new
                if (surveyResponse) {
                    surveyResponse.processMessage(survey, messageBody, phoneNumber, processed);
                } else {
                    var newSurveyResponse = new SurveyResponse({
                        phoneNumber: phoneNumber,
                        _surveyId: survey._id
                    });
                    newSurveyResponse.save(function(err, nsr) {
                        if (nsr) {
                            nsr.processMessage(survey, messageBody, phoneNumber, processed);
                        } else {
                            processed(true);
                        }
                    });
                }

            }); // end find survey response
        }
    }); // end find survey
};