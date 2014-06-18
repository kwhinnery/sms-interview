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
    return survey_client.SurveyClient('empty', [], request.param)

@pytest.fixture(scope='module', params=['telerivet'])
def simple_survey(request):
    return survey_client.SurveyClient('simple', [{
        'text': 'What is your name?',
        'summaryText': 'Name',
        'responseType': 'text'
    }], request.param)

@pytest.fixture(scope='module', params=['telerivet'])
def disease_survey(request):
    return survey_client.SurveyClient('disease', [{
        'text': 'How many new measles cases for that week?',
        'summaryText': 'Measles cases',
        'responseType': 'number'
    }, {
        'text': 'How many measles deaths for that week?',
        'summaryText': 'Measles deaths',
        'responseType': 'number'
    }, {
        'text': 'How many new meningitis cases for that week?',
        'summaryText': 'Meningitis cases',
        'responseType': 'number'
    }, {
        'text': 'How many meningitis deaths for that week?',
        'summaryText': 'Meningitis deaths',
        'responseType': 'number'
    }, {
        'text': 'How many new gastroenteritis cases for that week?',
        'summaryText': 'GE cases',
        'responseType': 'number'
    }, {
        'text': 'How many gastroenteritis deaths for that week?',
        'summaryText': 'GE deaths',
        'responseType': 'number'
    }], request.param)
