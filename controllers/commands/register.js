var util = require('util'), 
    Reporter = require('../../models/Reporter');

/*
    Module interface is a function which handles in inbound SMS.
    the callback takes two arguments - an error object (if applicable, or null)
    and a string message which will be sent back to the user.

    Example text: register SO.1.1
    number == '+23xxxxxx'
    message == 'SO.1.1'

    This thing should create a new Reporter model with 
*/
module.exports = function(number, message, callback) {
    callback(null, util.format('got %s from %s', message, number));
};