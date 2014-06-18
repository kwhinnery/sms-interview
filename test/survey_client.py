import base64
import json
import os
import pytest
import urllib
import urllib2
import xml.etree.ElementTree

USERNAME = os.environ['BASIC_UN']
PASSWORD = os.environ['BASIC_PW']
SERVER_URL = os.environ['SERVER_URL'].rstrip('/')

def post_request(path, data, **kwargs):
    auth = USERNAME + ':' + PASSWORD
    headers = {'Authorization': 'Basic ' + base64.b64encode(auth)}
    headers.update({n.replace('_', '-'): v for n, v in kwargs.items()})
    request = urllib2.Request(SERVER_URL + path, data, headers=headers)
    return json.load(urllib2.urlopen(request))

def create_survey(name, questions):
    params = {'surveyName': name}
    survey_id = post_request('/surveys', urllib.urlencode(params))['_id']
    post_request('/surveys/%s/update' % survey_id, json.dumps(questions),
                 content_type='application/json')
    return survey_id


class SurveyClient:
    """Sets up a survey and allows you to send messages to it."""

    def __init__(self, name, questions, client_type='telerivet'):
        self.id = create_survey(name, questions)
        self.hook_url = SERVER_URL + '/surveys/' + self.id
        if client_type == 'twilio':
            self.send = self.twilio_send
        else:
            self.send = self.telerivet_send

    def twilio_send(self, sender, message):
        data = {'From': sender, 'Body': message}
        request = urllib2.Request(self.hook_url, urllib.urlencode(data))
        reply = xml.etree.ElementTree.parse(urllib2.urlopen(request))
        return reply.find('.//Message').text

    def telerivet_send(self, sender, message):
        data = {'from_number': sender, 'content': message}
        request = urllib2.Request(self.hook_url, urllib.urlencode(data))
        reply = json.load(urllib2.urlopen(request))
        return reply['messages'][0]['content']
