function SurveyListViewModel() {
    var self = this;

    // Observable properties on VM
    self.newSurveyName = ko.observable();
    self.surveys = ko.observableArray();
    self.selectedSurvey = ko.observable(false);
    self.questions = ko.observableArray();

    // Create a new survey
    self.createSurvey = function() {
        $.ajax({
            url:'/surveys',
            method:'POST',
            data: {
                surveyName: self.newSurveyName()
            }
        }).done(function(surveyData) {
            self.surveys.push(surveyData);
            self.newSurveyName('');
        }).fail(function(err) {
            alert('Error creating new survey');
        });
    };

    // Select a survey to edit
    self.selectSurvey = function(data, event) {
        // Update app state for selected survey
        self.selectedSurvey(data);
        self.questions(data.questions);

        // Add a selection class to the current survey
        var $anchor;
        if (event) {
            $anchor = $(event.target);
        } else {
            $anchor = $('#surveyList').children().first();
        }

        $anchor.addClass('active')
            .siblings()
            .removeClass('active');
    };

    // Retrieve a list of all surveys
    self.getSurveys = function() {
        $.ajax({
            url: '/surveys/all',
            method: 'GET'
        }).done(function(data) {
            self.surveys(data);
            if (self.surveys().length > 0) {
                self.selectSurvey(self.surveys()[0]);
            }
        }).fail(function(err) {
            alert('Problem listing surveys');
        });
    };

    // Save any updates to the currently selected survey
    self.save = function(data, event) {
        var survey = self.selectedSurvey();

        $.ajax({
            url: '/surveys/'+survey._id+'/update',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(self.questions())
        }).done(function(data) {
            alert('Saved!');
        }).fail(function(err) {
            alert('Problem saving survey questions');
        });

    };

    // Deactivate the current survey
    self.deactivate = function(data, event) {
        var cont = confirm('Are you sure you want to deactivate this survey?');
        if (cont) {
            var survey = self.selectedSurvey();

            $.ajax({
                url: '/surveys/'+survey._id+'/deactivate',
                method: 'POST'
            }).done(function(data) {
                alert('Survey deactivated.');
                self.surveys.remove(survey);
                if (self.surveys().length > 0) {
                    self.selectSurvey(self.surveys()[0]);
                } 
            }).fail(function(err) {
                alert('Problem deactivating survey');
            });
        }
    };

    // Add a question
    self.addQuestion = function(data, target) {
        self.questions.push({
            text: '',
            responseType: 'text'
        });
    };

    // Nuke the question
    self.removeQuestion = function(question, target) {
        self.questions.remove(question);
    };

    // Initialize UI
    self.getSurveys();
}

module.exports = SurveyListViewModel;