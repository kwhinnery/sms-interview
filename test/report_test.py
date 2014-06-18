def norm_spaces(text):
    return ' '.join(text.split())

def test_report_unregistered(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    assert norm_spaces(s.send(p1, 'report 1,2,3,4,5,6')) == norm_spaces('''
This phone number has not yet been registered -
text the "register" command to sign up.
''')

def test_report_invalid(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.1')
    assert norm_spaces(s.send(p1, 'report')) == norm_spaces('''
[MSF]: Please enter the following data for ACHIDA in epi week 25:
Measles cases,
Measles deaths,
Meningitis cases,
Meningitis deaths,
GE cases,
GE deaths
''')
    assert norm_spaces(s.send(p1, 'report foo')) == norm_spaces('''
[MSF]: Please enter the following data for ACHIDA in epi week 25:
Measles cases,
Measles deaths,
Meningitis cases,
Meningitis deaths,
GE cases,
GE deaths
''')
    s.send(p1, 'register kb.1.1')
    assert norm_spaces(s.send(p1, 'report 1,2,3,a,5,6')) == norm_spaces('''
Error: numeric input required for Meningitis deaths.
[MSF]: Please enter the following data for ACHIDA in epi week 25:
Measles cases,
Measles deaths,
Meningitis cases,
Meningitis deaths,
GE cases,
GE deaths
''')

def test_report_valid(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.1')
    assert norm_spaces(s.send(p1, 'report 1,2,3,4,5,6')) == norm_spaces('''
Your report has been successfully completed.  Thank you for this information.
''')

def test_report_with_unknown_answer(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    s.send(p1, 'register kb.1.1')
    assert norm_spaces(s.send(p1, 'report 1,2,u,4,U,6')) == norm_spaces('''
Your report has been successfully completed.  Thank you for this information.
''')
