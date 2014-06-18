def norm_spaces(text):
    return ' '.join(text.split())

def test_report_unregistered(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
Your phone number has not been registered.
Please use a registered phone or call the hotline for help.
''')
    assert norm_spaces(s.send(p1, 'report 1,2,3,4,5,6')) == norm_spaces('''
Your phone number has not been registered.
Please use a registered phone or call the hotline for help.
''')

def test_report_invalid(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.5')
    # hard coded epi week - this will break the test soon
    assert norm_spaces(s.send(p1, 'report extra stuff')) == norm_spaces('''
Please enter data for DANWARAI, Week 25 in order:
Measles, Measles deaths, CSM, CSM deaths, GE, GE deaths.
For unknowns enter "U".
''')
    assert norm_spaces(s.send(p1, 'foo')) == norm_spaces('''
Please enter data for DANWARAI, Week 25 as 6 items
with a comma after each:
Measles, Measles deaths, CSM, CSM deaths, GE, GE deaths.
For unknowns enter "U".
''')
    assert norm_spaces(s.send(p1, '1,2,3,a,5,6')) == norm_spaces('''
A number (or "U" for unknown) is required for CSM deaths.
Please enter data for DANWARAI, Week 25 in order:
Measles, Measles deaths, CSM, CSM deaths, GE, GE deaths.
''')
    assert norm_spaces(s.send(p1, '1,2,3,4,5,6')) == norm_spaces('''
For DANWARAI, Week 25 we have:
Measles: 1, Measles deaths: 2, CSM: 3, CSM deaths: 4, GE: 5, GE deaths: 6.
Is this correct? Reply "yes" or "no".
''')

def test_report_valid(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.5')
    s.send(p1, 'report extra stuff');
    assert norm_spaces(s.send(p1, '1,2,3,4,5,6 extra stuff')) == norm_spaces('''
For DANWARAI, Week 25 we have:
Measles: 1, Measles deaths: 2, CSM: 3, CSM deaths: 4, GE: 5, GE deaths: 6.
Is this correct? Reply "yes" or "no".
''')
    assert norm_spaces(s.send(p1, 'maybe extra stuff')) == norm_spaces('''
For DANWARAI, Week 25 we have:
Measles: 1, Measles deaths: 2, CSM: 3, CSM deaths: 4, GE: 5, GE deaths: 6.
Is this correct? Reply "yes" or "no".
''')
    assert norm_spaces(s.send(p1, ' - Yes! - my signature')) == norm_spaces('''
Any other diseases to report? Please provide details.
''')
    assert norm_spaces(s.send(p1, 'some other details')) == norm_spaces('''
Your report has been submitted. Thank you!''')

def test_report_with_unknown_answer(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.5')
    s.send(p1, 'report');
    assert norm_spaces(s.send(p1, '1,2,u,4,U,6')) == norm_spaces('''
For DANWARAI, Week 25 we have:
Measles: 1, Measles deaths: 2, CSM: Unknown, CSM deaths: 4, GE: Unknown, GE deaths: 6.
Is this correct? Reply "yes" or "no".
''')
    assert norm_spaces(s.send(p1, 'no, sorry...')) == norm_spaces('''
Please enter data for DANWARAI, Week 25 in order:
Measles, Measles deaths, CSM, CSM deaths, GE, GE deaths.
For unknowns enter "U".
''')

def test_location_selection(simple_survey, phone1):
    s, p1 = simple_survey, phone1
    s.send(p1, 'register kb.1.1 kb.1.4 kb.1.6')
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
Which location are you reporting for? Reply with a number:
1: ALIERO DANGALADIMA I, 2: ALIERO S/FADA II, 3: JIGA BIRNI
''')
    assert norm_spaces(s.send(p1, 'a')) == norm_spaces('''
Please reply with a number in this list:
1: ALIERO DANGALADIMA I, 2: ALIERO S/FADA II, 3: JIGA BIRNI
''')
    assert norm_spaces(s.send(p1, '  2 extra')) == norm_spaces('''
Please enter data for ALIERO S/FADA II, Week 25 in order: Name.
For unknowns enter "U".
''')

def test_interrupt_report(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.5')
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
Please enter data for DANWARAI, Week 25 in order:
Measles, Measles deaths, CSM, CSM deaths, GE, GE deaths.
For unknowns enter "U".
''')
    s.send(p1, '1,2,3,4,5,6')
    assert norm_spaces(s.send(p1, 'yes')) == norm_spaces('''
Any other diseases to report? Please provide details.
''')
    # Now in locked mode, the word "register" should be part of the comment.
    assert norm_spaces(s.send(p1, 'register')) == norm_spaces('''
Your report has been submitted. Thank you!''')

    # Start another report.
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
Please enter data for DANWARAI, Week 25 in order:
Measles, Measles deaths, CSM, CSM deaths, GE, GE deaths.
For unknowns enter "U".
''')
    # Instead of producing an error message about the report, this registers.
    assert norm_spaces(s.send(p1, 'register so.22.8 kb.1.5')) == norm_spaces('''
You are now registered for 2 locations:
Ward: ACHIDA, WURNO, SOKOTO;
Ward: DANWARAI, ALIERO, KEBBI''')

    # Start another report.
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
Which location are you reporting for? Reply with a number:
1: ACHIDA, 2: DANWARAI
''')
    # Instead of an error message about the location, this restarts.
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
Which location are you reporting for? Reply with a number:
1: ACHIDA, 2: DANWARAI
''')
    s.send(p1, '1')
