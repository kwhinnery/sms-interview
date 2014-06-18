def norm_spaces(text):
    return ' '.join(text.split())

def test_report(disease_survey, phone1):
    s, p1 = disease_survey, phone1
    assert norm_spaces(s.send(p1, 'report 1,2,3,4,5,6')) == norm_spaces('''
This phone number has not yet been registered -
text the "register" command to sign up.
''')
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
    assert norm_spaces(s.send(p1, 'report 1,2,3,4,5,6')) == norm_spaces('''
Your report has been successfully completed.  Thank you for this information.
''')
