var SurveyListViewModel = require('./viewmodels/SurveyListViewModel');

$(function() {
    // Knockout ViewModel bindings
    var surveyListView = document.getElementById('SurveyListView');
    ko.applyBindings(new SurveyListViewModel(), surveyListView);
});