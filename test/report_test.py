def norm_spaces(text):
    return ' '.join(text.split())

def test_report_unregistered(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
This phone number has not been registered.
Please use a registered phone or call the hotline for help.
''')
    assert norm_spaces(s.send(p1, 'report 1,2,3,4,5,6')) == norm_spaces('''
This phone number has not been registered.
Please use a registered phone or call the hotline for help.
''')

def test_report_invalid(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.1')
    # hard coded epi week - this will break the test soon
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
[MSF]: Please enter the following data for KB.1.1 in Epi Week 25 (2014):
Measles,
Measles deaths,
CSM,
CSM deaths,
GE,
GE deaths
''')
    assert norm_spaces(s.send(p1, 'foo')) == norm_spaces('''
[MSF]: Please enter the following data for KB.1.1 in Epi Week 25 (2014):
Measles,
Measles deaths,
CSM,
CSM deaths,
GE,
GE deaths
''')
    assert norm_spaces(s.send(p1, '1,2,3,a,5,6')) == norm_spaces('''
Error: numeric input required for CSM deaths.
[MSF]: Please enter the following data for KB.1.1 in Epi Week 25 (2014):
Measles,
Measles deaths,
CSM,
CSM deaths,
GE,
GE deaths
''')
    assert norm_spaces(s.send(p1, '1,2,3,4,5,6')) == norm_spaces('''
Please review your report for KB.1.1 in Epi Week 25 (2014):
Measles: 1
Measles deaths: 2
CSM: 3
CSM deaths: 4
GE: 5
GE deaths: 6
Is this correct? Text "yes" or "no".
''')

def test_report_valid(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.1')
    s.send(p1, 'report');
    assert norm_spaces(s.send(p1, '1,2,3,4,5,6')) == norm_spaces('''
Please review your report for KB.1.1 in Epi Week 25 (2014):
Measles: 1
Measles deaths: 2
CSM: 3
CSM deaths: 4
GE: 5
GE deaths: 6
Is this correct? Text "yes" or "no".
''')
    assert norm_spaces(s.send(p1, 'maybe')) == norm_spaces('''
Please review your report for KB.1.1 in Epi Week 25 (2014):
Measles: 1
Measles deaths: 2
CSM: 3
CSM deaths: 4
GE: 5
GE deaths: 6
Is this correct? Text "yes" or "no".
''')
    assert norm_spaces(s.send(p1, ' - Yes! - my signature')) == norm_spaces('''
Any other diseases to report? Please provide details.
''')
    assert norm_spaces(s.send(p1, 'some other details')) == norm_spaces('''
Your report has been submitted.  Thank you!''')

def test_report_with_unknown_answer(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.1')
    s.send(p1, 'report');
    assert norm_spaces(s.send(p1, '1,2,u,4,U,6')) == norm_spaces('''
Please review your report for KB.1.1 in Epi Week 25 (2014):
Measles: 1
Measles deaths: 2
CSM: Unknown
CSM deaths: 4
GE: Unknown
GE deaths: 6
Is this correct? Text "yes" or "no".
''')
    assert norm_spaces(s.send(p1, 'no, sorry...')) == norm_spaces('''
[MSF]: Please enter the following data for KB.1.1 in Epi Week 25 (2014):
Measles,
Measles deaths,
CSM,
CSM deaths,
GE,
GE deaths
''')
