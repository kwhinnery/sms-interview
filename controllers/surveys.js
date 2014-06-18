var Survey = require('../models/Survey');

exports.index = function(request, response) {
    response.render('surveys/index', {
        title: 'Surveys',
        pageId: 'surveys'
    });
};

exports.list = function(request, response) {
    Survey.find({
        active: true
    }).sort('name').exec(function(err, docs) {
        if (err) {
            response.send(500, err);
        } else {
            response.send(docs);
        }
    });
};

exports.create = function(request, response) {
    var name = request.param('surveyName');
    var s = new Survey({
        name: name
    });
    s.save(function(err, doc) {
        if (err) {
            response.send(500, err);
        } else {
            response.send(doc);
        }
    });
};

exports.deactivate = function(request, response) {
    var id = request.param('id');
    Survey.findByIdAndUpdate(id, {
        active: false
    }, function(err, doc) {
        if (err) {
            response.send(500, err);
        } else {
            response.send(doc);
        }
    });
};

// Update questions for a survey
exports.update = function(request, response) {
    var id = request.param('id'),
        questions = request.body;

    Survey.findByIdAndUpdate(id, {
        questions: questions
    }, function(err, doc) {
        if (err) {
            response.send(500, err);
        } else {
            response.send(doc);
        }
    }); 
};

exports.updateSettings = function(request, response) {
    var id = request.param('id'),
        mapId = request.param('mapId'),
        topicId = request.param('topicId'),
        apiKey = request.param('apiKey');
    Survey.findByIdAndUpdate(id, {
        cmId: mapId,
        cmTopicId: topicId,
        cmApiKey: apiKey
    }, function(err, doc) {
        if (err) {
            response.send(500, err);
        } else {
            response.send(doc);
        }
    }); 
};

// Import and save a survey from crisis maps data
exports.createFromCrisisMaps = function(request, response) {
    var mapId = request.param('mapId'),
        apiKey = request.param('apiKey');

    // Hit crisis maps API and create a new survey
    Survey.importFromCrisisMaps(mapId, apiKey, function(err, survey) {
        if (err) {
            response.send(500, err);
        } else {
            response.send(survey);
        }
    });
};

