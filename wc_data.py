"""
World Cup Sweepstake data generation.
Python port of the original data.js from the Claude Design prototype.
"""

import random
import math


TEAMS_RAW = [
    # Group A
    ('Mexico', 'MEX', '🇲🇽', 'A', '#1a7a44', '+6000', 'r16'),
    ('South Korea', 'KOR', '🇰🇷', 'A', '#d2143c', '+20000', 'out-r32'),
    ('South Africa', 'RSA', '🇿🇦', 'A', '#0a7b3e', '+50000', 'out-group'),
    ('Czechia', 'CZE', '🇨🇿', 'A', '#11457e', '+30000', 'out-group'),
    # Group B
    ('Canada', 'CAN', '🇨🇦', 'B', '#d52b1e', '+22500', 'out-group'),
    ('Switzerland', 'SUI', '🇨🇭', 'B', '#d52b1e', '+15000', 'out-r32'),
    ('Qatar', 'QAT', '🇶🇦', 'B', '#7a1737', '+50000', 'out-group'),
    ('Bosnia & Herzegovina', 'BIH', '🇧🇦', 'B', '#0a3b8c', '+40000', 'out-group'),
    # Group C
    ('Brazil', 'BRA', '🇧🇷', 'C', '#f7c600', '+850', 'r16'),
    ('Morocco', 'MAR', '🇲🇦', 'C', '#c1272d', '+5000', 'out-r16'),
    ('Scotland', 'SCO', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'C', '#0a3b8c', '+30000', 'out-r32'),
    ('Haiti', 'HAI', '🇭🇹', 'C', '#00209f', '+100000', 'out-group'),
    # Group D
    ('USA', 'USA', '🇺🇸', 'D', '#0a3161', '+6000', 'out-r32'),
    ('Paraguay', 'PAR', '🇵🇾', 'D', '#d52b1e', '+25000', 'out-r32'),
    ('Australia', 'AUS', '🇦🇺', 'D', '#0a7b3e', '+20000', 'out-r32'),
    ('Türkiye', 'TUR', '🇹🇷', 'D', '#e30a17', '+15000', 'out-group'),
    # Group E
    ('Germany', 'GER', '🇩🇪', 'E', '#1a1a1a', '+1400', 'r16'),
    ('Ecuador', 'ECU', '🇪🇨', 'E', '#ffd100', '+12000', 'out-r32'),
    ('Ivory Coast', 'CIV', '🇨🇮', 'E', '#f77f00', '+15000', 'out-r32'),
    ('Curaçao', 'CUW', '🇨🇼', 'E', '#002b7f', '+100000', 'out-group'),
    # Group F
    ('Netherlands', 'NED', '🇳🇱', 'F', '#ec6608', '+2200', 'r16'),
    ('Japan', 'JPN', '🇯🇵', 'F', '#bc002d', '+6600', 'r16'),
    ('Tunisia', 'TUN', '🇹🇳', 'F', '#e70013', '+40000', 'out-group'),
    ('Sweden', 'SWE', '🇸🇪', 'F', '#005b99', '+12000', 'out-r32'),
    # Group G
    ('Belgium', 'BEL', '🇧🇪', 'G', '#c8102e', '+3500', 'out-r32'),
    ('Iran', 'IRN', '🇮🇷', 'G', '#cf1020', '+30000', 'out-r32'),
    ('Egypt', 'EGY', '🇪🇬', 'G', '#c8102e', '+20000', 'out-r32'),
    ('New Zealand', 'NZL', '🇳🇿', 'G', '#1a1a1a', '+50000', 'out-group'),
    # Group H
    ('Spain', 'ESP', '🇪🇸', 'H', '#c60b1e', '+450', 'qf'),
    ('Uruguay', 'URU', '🇺🇾', 'H', '#5b9ad5', '+4000', 'r16'),
    ('Saudi Arabia', 'KSA', '🇸🇦', 'H', '#0a7b3e', '+50000', 'out-r32'),
    ('Cape Verde', 'CPV', '🇨🇻', 'H', '#0a3b8c', '+80000', 'out-group'),
    # Group I
    ('France', 'FRA', '🇫🇷', 'I', '#0a2472', '+500', 'r16'),
    ('Senegal', 'SEN', '🇸🇳', 'I', '#0a7b3e', '+6600', 'r16'),
    ('Norway', 'NOR', '🇳🇴', 'I', '#c8102e', '+3500', 'qf'),
    ('Iraq', 'IRQ', '🇮🇶', 'I', '#1a1a1a', '+100000', 'out-group'),
    # Group J
    ('Argentina', 'ARG', '🇦🇷', 'J', '#6cace4', '+1000', 'r16'),
    ('Austria', 'AUT', '🇦🇹', 'J', '#c8102e', '+12000', 'out-r32'),
    ('Algeria', 'ALG', '🇩🇿', 'J', '#0a7b3e', '+25000', 'out-group'),
    ('Jordan', 'JOR', '🇯🇴', 'J', '#1a1a1a', '+80000', 'out-group'),
    # Group K
    ('Portugal', 'POR', '🇵🇹', 'K', '#c8102e', '+900', 'r16'),
    ('Colombia', 'COL', '🇨🇴', 'K', '#ffd100', '+4000', 'r16'),
    ('Uzbekistan', 'UZB', '🇺🇿', 'K', '#0a7b3e', '+50000', 'out-r32'),
    ('DR Congo', 'COD', '🇨🇩', 'K', '#3aa0d8', '+60000', 'out-group'),
    # Group L
    ('England', 'ENG', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'L', '#1a1a1a', '+650', 'out-r16'),
    ('Croatia', 'CRO', '🇭🇷', 'L', '#d2143c', '+6600', 'r16'),
    ('Panama', 'PAN', '🇵🇦', 'L', '#0a3b8c', '+50000', 'out-r32'),
    ('Ghana', 'GHA', '🇬🇭', 'L', '#0a7b3e', '+40000', 'out-group'),
]

STAGE_ROUNDS = {
    'out-group': 1,
    'out-r32': 2,
    'out-r16': 3,
    'r16': 3,
    'qf': 4,
}

FIRST_NAMES = [
    'Davie', 'Sarah', 'Mo', 'Priya', 'Callum', 'Aisha', 'Greg', 'Niamh',
    'Tom', 'Iqra', 'Stuart', 'Bex', 'Liam', 'Hannah', 'Fraser', 'Jade',
    'Connor', 'Ruth', 'Ali', 'Nina', 'Jonny', 'Eilidh', 'Rab', 'Chloe',
    'Sam', 'Leah', 'Kev', 'Maya', 'Doug', 'Farah', 'Andy', 'Grace',
    'Wee Jamie', 'Roisin', 'Pete', 'Suki', 'Hamish', 'Tara', 'Marcus', 'Lena',
    'Big Steve', 'Orla', 'Jacob', 'Mei', 'Finlay', 'Zara', 'Owen', 'Carla',
    'Dean', 'Anya', 'Gus', 'Polly', 'Reece', 'Imo', 'Nathan', 'Saoirse',
    'Bobby', 'Yusuf', 'Lottie', 'Kai', 'Murray', 'Dani', 'Theo', 'Effie',
    'Joe', 'Nadia', 'Will', 'Senga', 'Archie', 'Bea',
]

LAST_NAMES = [
    'M.', 'T.', 'K.', 'from Sales', 'R.', 'P.', 'from Legal', 'B.',
    'from Finance', 'C.', 'in HR', 'S.', 'D.', 'from Ops', 'G.',
    'the intern', 'H.', 'from Marketing', 'N.', 'J.',
]

FEMALE_NAMES = {
    'Sarah', 'Priya', 'Aisha', 'Niamh', 'Iqra', 'Bex', 'Hannah', 'Jade',
    'Ruth', 'Nina', 'Eilidh', 'Chloe', 'Leah', 'Maya', 'Farah', 'Grace',
    'Roisin', 'Suki', 'Tara', 'Lena', 'Orla', 'Mei', 'Zara', 'Carla',
    'Anya', 'Polly', 'Imo', 'Saoirse', 'Lottie', 'Dani', 'Effie',
    'Nadia', 'Senga', 'Bea',
}

AVATAR_COLORS = [
    '#E8272A', '#1a7a44', '#0a3b8c', '#7A3FB0',
    '#E07A1A', '#0d8a8a', '#C0246B', '#3a6ea5',
]

CITIES = [('London', 38), ('Edinburgh', 27), ('Remote', 5)]

DEPARTMENTS = [
    'Engineering', 'Product', 'Design', 'Sales', 'Marketing', 'Finance',
    'Legal', 'People', 'Operations', 'Data', 'Support', 'Delivery',
]


def generate_wc_data() -> dict:
    # Build team objects.
    # Pre-tournament: no games have been played, so every team is still in.
    # As results come in, a future job flips alive/stage/rounds per team.
    teams = []
    teams_by_code = {}
    for r in TEAMS_RAW:
        name, code, flag, group, color, odds, stage = r
        t = {
            'name': name, 'code': code, 'flag': flag, 'group': group,
            'color': color, 'odds': odds, 'stage': 'group',
            'alive': True, 'rounds': 0,
        }
        teams.append(t)
        teams_by_code[code] = t

    # Seeded PRNG (kept for any future seeding needs)
    rng = random.Random(20260611)

    def make_initials(name: str) -> str:
        clean = name.replace('Wee ', '').replace('Big ', '')
        parts = clean.split(' ')
        ini = parts[0][0] if parts[0] else '?'
        if len(parts) > 1 and parts[1] and parts[1][0].isalpha():
            ini += parts[1][0]
        return ini.upper()

    # Live mode starts with an EMPTY field — real sign-ups (persisted in
    # data/participants.json and merged by main.py) populate it. The pot grows
    # with each entrant; below ~48 everyone gets a unique country, then shared.
    people: list = []

    # No knockout fixtures yet — the group stage hasn't started.
    r16: list = []

    # Upcoming games tracker — full group-stage fixture list, generated from the
    # 12 groups (each team plays the other three). Mirrors static/app/mock-data.js.
    import datetime as _dt
    VENUES = [
        'MetLife Stadium, NJ', 'SoFi Stadium, LA', 'AT&T Stadium, Dallas', 'Mercedes-Benz, Atlanta',
        'Lincoln Financial, Philadelphia', 'Gillette Stadium, Boston', "Levi's Stadium, SF Bay",
        'Hard Rock Stadium, Miami', 'NRG Stadium, Houston', 'Arrowhead, Kansas City', 'Lumen Field, Seattle',
        'BMO Field, Toronto', 'BC Place, Vancouver', 'Estadio Azteca, Mexico City',
        'Estadio Akron, Guadalajara', 'Estadio BBVA, Monterrey']
    DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    RR = [[(0, 1), (2, 3)], [(0, 2), (3, 1)], [(0, 3), (1, 2)]]
    TIMES = ['16:00', '19:00', '22:00']
    start = _dt.date(2026, 6, 11)
    fixtures = []
    vi = 0
    fid = 0
    for gi, g in enumerate('ABCDEFGHIJKL'):
        gteams = [t for t in teams if t['group'] == g]
        if len(gteams) < 4:
            continue
        for md in range(3):
            day_offset = md * 6 + gi // 2
            date = start + _dt.timedelta(days=day_offset)
            for pidx, (ia, ib) in enumerate(RR[md]):
                a, b = gteams[ia], gteams[ib]
                fixtures.append({
                    'id': f'f{fid}', 'group': g, 'matchday': md + 1,
                    'a': a['code'], 'b': b['code'],
                    'dateISO': date.isoformat(),
                    'dateLabel': f'{DOW[date.weekday()]} {date.day} {MON[date.month - 1]}',
                    'time': TIMES[(gi + pidx) % 3],
                    'venue': VENUES[vi % len(VENUES)],
                    'status': 'upcoming', 'score': None,
                })
                vi += 1
                fid += 1
    fixtures.sort(key=lambda f: (f['dateISO'], f['time']))

    fee = 5
    pot = len(people) * fee

    # Tournament prediction markets. answer=None → still open; once a result is
    # set, Store grades each pick against it. Mirrors static/app/mock-data.js.
    predictions = [
        {'key': 'winner', 'q': 'Tournament Winner', 'kind': 'team', 'points': 25,
         'answer': None, 'options': ['ESP', 'FRA', 'BRA', 'ARG', 'GER', 'POR']},
        {'key': 'final', 'q': 'The Final Matchup', 'kind': 'team2', 'points': 15,
         'answer': None, 'options': ['ESP', 'FRA', 'BRA', 'ARG']},
        {'key': 'goldenBoot', 'q': 'Golden Boot Winner', 'kind': 'player', 'points': 15,
         'answer': None, 'options': [
             {'id': 'mbappe', 'name': 'K. Mbappé', 'team': 'FRA'},
             {'id': 'yamal', 'name': 'L. Yamal', 'team': 'ESP'},
             {'id': 'haaland', 'name': 'E. Haaland', 'team': 'NOR'},
             {'id': 'vini', 'name': 'Vinícius Jr', 'team': 'BRA'}]},
        {'key': 'scotland', 'q': 'How far do Scotland go?', 'kind': 'stage', 'points': 10,
         'answer': None,
         'options': ['Group stage', 'Round of 32', 'Round of 16', 'Quarter Final', 'Semi Final', 'Final', 'Winner']},
        {'key': 'england', 'q': 'How far do England go?', 'kind': 'stage', 'points': 10,
         'answer': None,
         'options': ['Group stage', 'Round of 32', 'Round of 16', 'Quarter Final', 'Semi Final', 'Final', 'Winner']},
        {'key': 'surprise', 'q': 'Biggest Surprise Team', 'kind': 'team', 'points': 10,
         'answer': None, 'options': ['NOR', 'MAR', 'SEN', 'JPN', 'CRO', 'COL']},
        {'key': 'flop', 'q': 'Biggest Disappointment', 'kind': 'team', 'points': 10,
         'answer': None, 'options': ['ENG', 'BEL', 'GER', 'USA', 'BRA']},
        {'key': 'cleanSheets', 'q': 'Most Clean Sheets', 'kind': 'team', 'points': 10,
         'answer': None, 'options': ['ESP', 'BRA', 'ARG', 'FRA']},
        {'key': 'youngPlayer', 'q': 'Best Young Player', 'kind': 'player', 'points': 10,
         'answer': None, 'options': [
             {'id': 'yamal', 'name': 'L. Yamal', 'team': 'ESP'},
             {'id': 'yildiz', 'name': 'K. Yıldız', 'team': 'TUR'},
             {'id': 'endrick', 'name': 'Endrick', 'team': 'BRA'},
             {'id': 'wirtz', 'name': 'F. Wirtz', 'team': 'GER'}]},
    ]

    # Half of every £5 entry goes to charity; the rest is a single
    # winner-takes-all pot for whoever holds the champion.
    charity_split = 0.5
    payouts = [
        {'place': 'Winner', 'pct': 1.0 - charity_split, 'label': 'holds the champion — takes the whole pot'},
        {'place': 'Charity', 'pct': charity_split, 'label': 'half of every entry'},
    ]

    lines = {
        'welcome': "Right. Let's get this started. Wheesht is watching.",
        'drawGood': "Oh aye. That's a tidy wee team. Ye might actually do something wi' that.",
        'drawMid': "Could be worse. Could be better. Wheesht is reserving judgement.",
        'drawBad': "…Wheesht is not going to insult ye. The flag's nice though.",
        'drawYou': "Croatia. Experienced, thrawn, never know when they're beat. Wheesht approves. Quietly.",
        'upset': "Naebody saw that coming. Wheesht definitely didn't. Wheesht's predictions stand.",
        'england': "…Wheesht is remaining professional. Next question.",
        'scotland': "Scotland. The homeland. Drawn with Brazil, aye — but Wheesht believes. Wheesht needs a minute.",
        'eliminated': "Ye've been eliminated. Wheesht is… sorry. (Wheesht is not sorry. Wheesht saw this coming.)",
        'sideBets': "Aye, ye're out. But Wheesht's not done wi' ye yet.",
        'sideBets2': "We're the ones watching objectively now. Arguably the better position.",
        'predOpen': "Predictions are open. Back yerself. Wheesht will remember every single one.",
        'predLocked': "Predictions are locked. No takebacks. Wheesht has yer answers in writing.",
        'empty': "Nothing here yet. Wheesht is watching the space.",
        'error': "Something went wrong. Wheesht is investigating. Wheesht suspects foul play.",
        'finalBuild': "Two teams left. Wheesht has officiated since 1966. Wheesht is, for once, almost speechless. Almost.",
    }

    still_in = sum(1 for p in people if p['alive'])
    out_count = sum(1 for p in people if not p['alive'])
    teams_left = sum(1 for t in teams if t['alive'])

    meta = {
        'name': 'The Office Sweepstake',
        'season': 'World Cup 2026',
        'stageLabel': 'Group Stage',
        'phase': 'pre',
        'maxTeams': len(teams),
        'groupSize': len(people),
        'stillIn': still_in,
        'out': out_count,
        'teamsLeft': teams_left,
        'kickoff': 'Thu 11 June',
        'finalVenue': 'MetLife Stadium, New Jersey',
        'finalDate': 'Sun 19 July',
        'predictionsLocked': False,
    }

    return {
        'teams': teams,
        'people': people,
        'r16': r16,
        'fixtures': fixtures,
        'predictions': predictions,
        'fee': fee,
        'pot': pot,
        'charitySplit': charity_split,
        'payouts': payouts,
        'lines': lines,
        'meta': meta,
    }
