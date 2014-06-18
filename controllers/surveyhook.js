var twilio = require('twilio'),
    commands = require('./commands');

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
    var gateway = 'twilio', phoneNumber, messageBody;

    // determine which messaging provider we are dealing with
    if (request.param('from_number')) {
        // this is a Telerivet webhook
        gateway = 'telerivet';
        phoneNumber = request.param('from_number'),
        messageBody = request.param('content');
    } else {
        // Default is Twilio
        phoneNumber = request.param('From'),
        messageBody = request.param('Body');
    }
    console.log('[' + phoneNumber + '] incoming message: ' + messageBody);

    // Parse command and delegate to proper command
    var message = messageBody.trim(),
        commandText = message.split(' ')[0], 
        commandTextCompare = commandText.toLowerCase(),
        command;

    if (commandTextCompare === 'register') {
        command = commands.register;
    } else if (commandTextCompare === 'report') {
        command = commands.report;
    } else if (commandTextCompare === 'change') {
        command = commands.change;
    } else if (commandTextCompare === 'ok') {
        command = commands.ok;
    } else if (commandTextCompare === 'comment') {
        command = commands.comment;
    }

    if (command) {
        var commandInput = message.replace(commandText, '').trim();
        command(phoneNumber, commandInput, function(err, responseMessage) {
            respond(responseMessage, gateway, request, response, phoneNumber);
        });
    } else {
        respond(MESSAGES.commandNotRecognized, gateway, request, response, phoneNumber);
    }
};
