var httpAuth = require('http-auth'),
    config = require('../config'),
    sessionsController = require('./sessions'),
    surveysController = require('./surveys'),
    webhookController = require('./surveyhook');

// Define web app routes
module.exports = function(app) {
    // Basic auth - TODO: remove
    var basic = httpAuth.basic({
        realm: 'SMS Interview'
    }, function(username, password, callback) {
        callback(username == config.un && password == config.pw);
    });

    // Basic auth middleware
    var auth = httpAuth.connect(basic);

    // Signup, login, and token generation
    //app.post('/signup', sessionsController.createUser);
    //app.post('/login', sessionsController.createToken);

    // Middleware to check authorization token
    //var auth = sessionsController.checkAuth;

    // Survey routes
    app.get('/surveys', auth, surveysController.index);
    app.get('/surveys/all', auth, surveysController.list);
    app.post('/surveys', auth, surveysController.create);
    app.post('/surveys/crisismaps', auth, surveysController.createFromCrisisMaps);
    app.post('/surveys/:id/deactivate', auth, surveysController.deactivate);
    app.post('/surveys/:id/update', auth, surveysController.update);
    app.post('/surveys/:id/settings', auth, surveysController.updateSettings);

    // Survey webhook
    app.post('/surveys/:id', webhookController.webhook);

    // Responses placeholder
    app.get('/responses', auth, function(request, response) {
        response.render('responses', {
            title: 'Survey Responses',
            pageId: 'responses'
        });
    });

    // Reporters placeholder
    app.get('/reporters', auth, function(request, response) {
        response.render('reporters', {
            title: 'Reporters',
            pageId: 'reporters'
        });
    });

    // Home page placholder
    app.get('/', function(request, response) {
        response.render('index', {
            title: 'Home',
            pageId: 'home'
        });
    });

};
