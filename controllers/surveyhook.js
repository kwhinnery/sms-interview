var twilio = require('twilio');
var commands = require('./commands');
var Reporter = require('../models/Reporter');
var Survey = require('../models/Survey');


// Will require localization
var MESSAGES = {
    commandNotRecognized: 'We didn\'t recognize that command - use "report" to start a report or "register" to get started.'
};

// Respond with the appropriate content, depending on the messaging provider
// Right now, it's either Twilio or Telerivet
function respond(message, gateway, request, response, phoneNumber) {
    console.log('['+phoneNumber+'] sending reply: ' + message);
    if (gateway === 'telerivet') {
        // Telerivet requires JSON response
        var res = {
            messages: [ { content: message } ]
        };
        response.send(res);
    } else {
        // Render Twilio-style response 
        var twiml = new twilio.TwimlResponse();
        twiml.message(message);
        response.type('text/xml');
        response.send(twiml.toString());
    }
}

// A webhook to be used by Twilio or Telerivet to build a survey response
exports.webhook = function(request, response) {
    var gateway = 'twilio', number, message;

    // determine which messaging provider we are dealing with
    if (request.param('from_number')) {
        // this is a Telerivet webhook
        gateway = 'telerivet';
        number = request.param('from_number'),
        message = request.param('content');
    } else {
        // Default is Twilio
        number = request.param('From'),
        message = request.param('Body');
    }
    console.log('[' + number + '] incoming message: ' + message);

    // Get the Survey and Reporter associated with the sender's phone number.
    Survey.findById(request.param('id'), function(err, survey) {
        if (err) {
            console.error(err);
            return;
        }
        Reporter.findOne({
            phoneNumbers: number
        }, function(err, reporter) {
            if (err) {
                console.error(err);
                return;
            }
            reporter = reporter || new Reporter({
                phoneNumbers: [number],
                placeIds: [],
                currentCommand: null,
                nextStep: 0
            });
            console.log('[' + number + '] command=' + reporter.currentCommand +
                ' nextStep=' + reporter.nextStep +
                ' placeIds=[' + reporter.placeIds + ']');
            dispatchCommand(number, message.trim(), survey, reporter);
        });
    });

    // Invoke the appropriate step of the appropriate command.
    function dispatchCommand(number, message, survey, reporter) {
        var step = 0;
        if (reporter.currentCommand) {
            commandName = reporter.currentCommand;
            step = reporter.nextStep;
        } else {
            var commandName = message.split(' ')[0].toLowerCase();
            message = message.substr(commandName.length).trim();
        }
        var command = commands[commandName];
        if (command) {
            command(number, step, message, survey, reporter,
                function(err, message, nextStep) {
                    if (err) {
                        console.error(err);
                    }
                    reporter.currentCommand = nextStep ? commandName : null;
                    reporter.nextStep = nextStep || 0;
                    reporter.save(function (err) {
                        if (err) console.error(err);
                    });
                    console.log('[' + number + '] step completed:' +
                        ' command=' + reporter.currentCommand +
                        ' nextStep=' + reporter.nextStep);
                    respond(message, gateway, request, response, number);
                }
            );
        } else {
            respond(MESSAGES.commandNotRecognized, gateway, request,
                response, number);
        }
    }
};
