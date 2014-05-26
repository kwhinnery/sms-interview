var User = require('../models/User'),
    Token = require('../models/Token');

// Create a new User
exports.createUser = function(request, response) {
    var user = new User({
        username: request.param('username'),
        password: request.param('password')
    });

    user.save(function(err, user) {
        if (err) {
            var msg = 'An error occurred during signup, please try again.';
            if (err.code == 11000) {
                msg = 'Sorry, that user already exists.'
            }
            response.send(500, {
                status: 500,
                message: msg
            });
        } else {
            delete user.password;
            response.send({
                id: user._id,
                username: user.username
            });
        }
    });
};

// Generate an API token for the current user
function generateToken(userId, callback) {
    var tkn = new Token({
        userId: userId
    });
    tkn.save(callback);
}

// Log in a user and create an API access token
exports.createToken = function(request, response) {
    var un = request.param('username'),
        pw = request.param('password');

    User.getAuthenticated(un, pw, function(err, user, reason) {
        // General DB error
        if (err) {
            response.send(500, {
                status: 500,
                message: 'An error occurred while logging you in, please try again.'
            });
            return;
        }

        // User model means auth success
        if (user) {
            // Create an API token that can be used to authenticate future reqs
            generateToken(user._id, function(err, token) {
                if (err) {
                    response.send(500, {
                        status: 500,
                        messsage: 'An error occurred while logging you in, please try again.'
                    });
                } else {
                    response.send(token);
                }
            });
            return;
        }

        // Failed login
        var reasons = User.failedLogin;
        switch (reason) {
            case reasons.NOT_FOUND:
            case reasons.PASSWORD_INCORRECT:
                response.send(401, {
                    status: 401,
                    message: 'The username/password you provided were incorrect.'
                });
                break;
            case reasons.MAX_ATTEMPTS:
                response.send(403, {
                    status: 403,
                    message: 'You have reached the maximum allowed failed logins, your account is temporarily locked.'
                });
                break;
        }
    });
};