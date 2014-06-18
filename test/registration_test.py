def norm_spaces(text):
    return ' '.join(text.split())

def test_registration(empty_survey, phone1):
    s, p1 = empty_survey, phone1
    assert s.send(p1, 'register clear') == \
        'You are now registered for 0 locations.'
    assert s.send(p1, 'register') == \
        'You are currently registered for 0 locations.'
    assert norm_spaces(s.send(p1, 'register so.22.8 extra input')) == \
        'You are now registered for 1 location: Ward: ACHIDA, WURNO, SOKOTO'
    assert norm_spaces(s.send(p1, 'register extra input')) == \
        'You are currently registered for 1 location: Ward: ACHIDA, WURNO, SOKOTO'

def test_register_with_two_locations(empty_survey, phone1):
    s, p1 = empty_survey, phone1
    assert norm_spaces(s.send(p1, 'register so.22.8 kb.1.5')) == \
        'You are now registered for 2 locations: Ward: ACHIDA, WURNO, SOKOTO; Ward: DANWARAI, ALIERO, KEBBI'
    assert s.send(p1, 'register clear') == \
        'You are now registered for 0 locations.'
    assert s.send(p1, 'register extra input') == \
        'You are currently registered for 0 locations.'
