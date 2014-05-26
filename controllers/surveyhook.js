var Survey = require('../models/Survey');

// A webhook to be used by Twilio or Telerivet to build a survey response
exports.webhook = function(request, response) {
    Survey.findById(request.param('id'), function(err, doc) {
        response.type('text/xml');
        response.send('<Response><Message>Testing '+doc.name+'</Message></Response>');
    });
};