"""Configuration file for py.test."""

import pytest
import survey_client

# Unique phone numbers for use local to each test.

next_phone_number = 1
def new_phone_number():
    global next_phone_number
    phone = next_phone_number
    next_phone_number += 1
    return '+%d' % phone

@pytest.fixture(scope='function')
def phone1():
    return new_phone_number()

@pytest.fixture(scope='function')
def phone2():
    return new_phone_number()

@pytest.fixture(scope='function')
def phone3():
    return new_phone_number()


# Set up surveys that are reusable across tests.

# params could be ['telerivet', 'twilio']
@pytest.fixture(scope='module', params=['telerivet'])
def empty_survey(request):
    return survey_client.SurveyClient('empty', [], client_type=request.param)

@pytest.fixture(scope='module', params=['telerivet'])
def simple_survey(request):
    return survey_client.SurveyClient('simple', [{
        'text': 'What is your name?',
        'summaryText': 'Name',
        'responseType': 'text'
    }], client_type=request.param)

@pytest.fixture(scope='module', params=['telerivet'])
def disease_survey(request):
    return survey_client.SurveyClient('disease', [{
        'text': 'How many new measles cases for that week?',
        'summaryText': 'Measles cases',
        'responseType': 'number',
        'cmId': 'q1'
    }, {
        'text': 'How many measles deaths for that week?',
        'summaryText': 'Measles deaths',
        'responseType': 'number',
        'cmId': 'q2'
    }, {
        'text': 'How many new meningitis cases for that week?',
        'summaryText': 'Meningitis cases',
        'responseType': 'number',
        'cmId': 'q3'
    }, {
        'text': 'How many meningitis deaths for that week?',
        'summaryText': 'Meningitis deaths',
        'responseType': 'number',
        'cmId': 'q4'
    }, {
        'text': 'How many new gastroenteritis cases for that week?',
        'summaryText': 'GE cases',
        'responseType': 'number',
        'cmId': 'q5'
    }, {
        'text': 'How many gastroenteritis deaths for that week?',
        'summaryText': 'GE deaths',
        'responseType': 'number',
        'cmId': 'q6'
    }], 'map1', 'topic1', 'key1', client_type=request.param)
