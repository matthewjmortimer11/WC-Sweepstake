/* ===========================================================================
   MOCK DATA — self-contained fallback so the app runs with no backend.
   In production main.py injects window.WC_DATA before this file; the `||`
   keeps the real data. With no server (static preview / "mock mode") this
   seed boots the app instead. Shape matches wc_data.generate_wc_data().
   =========================================================================== */
(function () {
  if (window.WC_DATA) return; // server already injected real data

  var TEAMS_RAW = [
    ['Mexico','MEX','🇲🇽','A','#1a7a44','+6000','r16'],['South Korea','KOR','🇰🇷','A','#d2143c','+20000','out-r32'],
    ['South Africa','RSA','🇿🇦','A','#0a7b3e','+50000','out-group'],['Czechia','CZE','🇨🇿','A','#11457e','+30000','out-group'],
    ['Canada','CAN','🇨🇦','B','#d52b1e','+22500','out-group'],['Switzerland','SUI','🇨🇭','B','#d52b1e','+15000','out-r32'],
    ['Qatar','QAT','🇶🇦','B','#7a1737','+50000','out-group'],['Bosnia & Herz.','BIH','🇧🇦','B','#0a3b8c','+40000','out-group'],
    ['Brazil','BRA','🇧🇷','C','#f7c600','+850','r16'],['Morocco','MAR','🇲🇦','C','#c1272d','+5000','out-r16'],
    ['Scotland','SCO','🏴󠁧󠁢󠁳󠁣󠁴󠁿','C','#0a3b8c','+30000','out-r32'],['Haiti','HAI','🇭🇹','C','#00209f','+100000','out-group'],
    ['USA','USA','🇺🇸','D','#0a3161','+6000','out-r32'],['Paraguay','PAR','🇵🇾','D','#d52b1e','+25000','out-r32'],
    ['Australia','AUS','🇦🇺','D','#0a7b3e','+20000','out-r32'],['Türkiye','TUR','🇹🇷','D','#e30a17','+15000','out-group'],
    ['Germany','GER','🇩🇪','E','#1a1a1a','+1400','r16'],['Ecuador','ECU','🇪🇨','E','#ffd100','+12000','out-r32'],
    ['Ivory Coast','CIV','🇨🇮','E','#f77f00','+15000','out-r32'],['Curaçao','CUW','🇨🇼','E','#002b7f','+100000','out-group'],
    ['Netherlands','NED','🇳🇱','F','#ec6608','+2200','r16'],['Japan','JPN','🇯🇵','F','#bc002d','+6600','r16'],
    ['Tunisia','TUN','🇹🇳','F','#e70013','+40000','out-group'],['Sweden','SWE','🇸🇪','F','#005b99','+12000','out-r32'],
    ['Belgium','BEL','🇧🇪','G','#c8102e','+3500','out-r32'],['Iran','IRN','🇮🇷','G','#cf1020','+30000','out-r32'],
    ['Egypt','EGY','🇪🇬','G','#c8102e','+20000','out-r32'],['New Zealand','NZL','🇳🇿','G','#1a1a1a','+50000','out-group'],
    ['Spain','ESP','🇪🇸','H','#c60b1e','+450','qf'],['Uruguay','URU','🇺🇾','H','#5b9ad5','+4000','r16'],
    ['Saudi Arabia','KSA','🇸🇦','H','#0a7b3e','+50000','out-r32'],['Cape Verde','CPV','🇨🇻','H','#0a3b8c','+80000','out-group'],
    ['France','FRA','🇫🇷','I','#0a2472','+500','r16'],['Senegal','SEN','🇸🇳','I','#0a7b3e','+6600','r16'],
    ['Norway','NOR','🇳🇴','I','#c8102e','+3500','qf'],['Iraq','IRQ','🇮🇶','I','#1a1a1a','+100000','out-group'],
    ['Argentina','ARG','🇦🇷','J','#6cace4','+1000','r16'],['Austria','AUT','🇦🇹','J','#c8102e','+12000','out-r32'],
    ['Algeria','ALG','🇩🇿','J','#0a7b3e','+25000','out-group'],['Jordan','JOR','🇯🇴','J','#1a1a1a','+80000','out-group'],
    ['Portugal','POR','🇵🇹','K','#c8102e','+900','r16'],['Colombia','COL','🇨🇴','K','#ffd100','+4000','r16'],
    ['Uzbekistan','UZB','🇺🇿','K','#0a7b3e','+50000','out-r32'],['DR Congo','COD','🇨🇩','K','#3aa0d8','+60000','out-group'],
    ['England','ENG','🏴󠁧󠁢󠁥󠁮󠁧󠁿','L','#1a1a1a','+650','out-r16'],['Croatia','CRO','🇭🇷','L','#d2143c','+6600','r16'],
    ['Panama','PAN','🇵🇦','L','#0a3b8c','+50000','out-r32'],['Ghana','GHA','🇬🇭','L','#0a7b3e','+40000','out-group']
  ];
  var STAGE_ROUNDS = { 'out-group':1, 'out-r32':2, 'out-r16':3, 'r16':3, 'qf':4 };

  var teams = [], byCode = {};
  TEAMS_RAW.forEach(function (r) {
    // Pre-tournament: not a ball kicked yet — everyone's still in.
    var t = { name:r[0], code:r[1], flag:r[2], group:r[3], color:r[4], odds:r[5],
      stage:'group', alive:true, rounds:0 };
    teams.push(t); byCode[r[1]] = t;
  });

  // seeded PRNG
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; var t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  var rng = mulberry32(20260611);
  function pick(arr){ return arr[(rng()*arr.length)|0]; }

  var FIRST=['Davie','Sarah','Mo','Priya','Callum','Aisha','Greg','Niamh','Tom','Iqra','Stuart','Bex','Liam','Hannah','Fraser','Jade','Connor','Ruth','Ali','Nina','Jonny','Eilidh','Rab','Chloe','Sam','Leah','Kev','Maya','Doug','Farah','Andy','Grace','Roisin','Pete','Suki','Hamish','Tara','Marcus','Lena','Orla','Jacob','Mei','Finlay','Zara','Owen','Carla','Dean','Anya','Gus','Polly','Reece','Imo','Nathan','Saoirse','Bobby','Yusuf','Lottie','Kai','Murray','Dani','Theo','Effie','Joe','Nadia','Will','Archie','Bea'];
  var LAST=['M.','T.','K.','R.','P.','B.','C.','S.','D.','G.','H.','N.','J.','W.','Mc.','F.'];
  var FEMALE={Sarah:1,Priya:1,Aisha:1,Niamh:1,Iqra:1,Bex:1,Hannah:1,Jade:1,Ruth:1,Nina:1,Eilidh:1,Chloe:1,Leah:1,Maya:1,Farah:1,Grace:1,Roisin:1,Suki:1,Tara:1,Lena:1,Orla:1,Mei:1,Zara:1,Carla:1,Anya:1,Polly:1,Imo:1,Saoirse:1,Lottie:1,Dani:1,Effie:1,Nadia:1,Bea:1};
  var DEPTS=['Engineering','Product','Design','Sales','Marketing','Finance','Legal','People','Operations','Data','Support','Delivery'];
  var COLORS=['#E8272A','#1a7a44','#0a3b8c','#7A3FB0','#E07A1A','#0d8a8a','#C0246B','#3a6ea5'];

  function initials(n){ var c=n.replace(/Wee |Big /g,''); var p=c.split(' '); var i=p[0]?p[0][0]:'?'; if(p[1]&&/[a-z]/i.test(p[1][0])) i+=p[1][0]; return i.toUpperCase(); }

  // BLANK SLATE — no participants. Real sign-ups populate the field; the pot
  // and contestant count grow from zero with every entry.
  var people = [];

  // No knockout fixtures yet — the group stage hasn't started.
  var r16 = [];

  // -------- upcoming games tracker: full group-stage fixture list ----------
  // Generated from the 12 groups (each team plays the other three). Dates are
  // spread across the group-stage window so the tracker has a real schedule to
  // count down to. Status flips to 'live'/'done' as results are recorded.
  var GROUPS_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L'];
  var VENUES = ['MetLife Stadium, NJ','SoFi Stadium, LA','AT&T Stadium, Dallas','Mercedes-Benz, Atlanta','Lincoln Financial, Philadelphia',
    'Gillette Stadium, Boston','Levi\'s Stadium, SF Bay','Hard Rock Stadium, Miami','NRG Stadium, Houston','Arrowhead, Kansas City',
    'Lumen Field, Seattle','BMO Field, Toronto','BC Place, Vancouver','Estadio Azteca, Mexico City','Estadio Akron, Guadalajara','Estadio BBVA, Monterrey'];
  var DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function dLabel(d){ return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]; }
  // round-robin pairings within a group of 4 (indexes), by matchday
  var RR = [[[0,1],[2,3]],[[0,2],[3,1]],[[0,3],[1,2]]];
  var START = new Date(2026,5,11);   // Thu 11 Jun 2026
  var TIMES = ['16:00','19:00','22:00'];
  var fixtures = [], vi = 0, fid = 0;
  GROUPS_ORDER.forEach(function(g, gi){
    var gteams = teams.filter(function(t){ return t.group===g; });
    if (gteams.length < 4) return;
    for (var md=0; md<3; md++){
      var dayOffset = md*6 + Math.floor(gi/2);   // MD1 d0-5, MD2 d6-11, MD3 d12-17
      var date = new Date(START); date.setDate(START.getDate()+dayOffset);
      RR[md].forEach(function(pair, pidx){
        var a = gteams[pair[0]], b = gteams[pair[1]];
        fixtures.push({
          id:'f'+(fid++), group:g, matchday:md+1,
          a:a.code, b:b.code,
          dateISO: date.toISOString().slice(0,10),
          dateLabel: dLabel(date),
          time: TIMES[(gi + pidx) % 3],
          venue: VENUES[vi++ % VENUES.length],
          status:'upcoming', score:null
        });
      });
    }
  });
  fixtures.sort(function(x,y){ return x.dateISO===y.dateISO ? (x.time<y.time?-1:1) : (x.dateISO<y.dateISO?-1:1); });

  // -------- predictions catalogue --------
  // Pre-tournament: every market is open (answer:null). Results get filled in
  // as the tournament unfolds; Store grades each pick against the answer.
  var PREDICTIONS = [
    { key:'winner', q:'Tournament Winner', kind:'team', points:25, answer:null,
      options:['ESP','FRA','BRA','ARG','GER','POR'] },
    { key:'final', q:'The Final Matchup', kind:'team2', points:15, answer:null,
      options:['ESP','FRA','BRA','ARG'] },
    { key:'goldenBoot', q:'Golden Boot Winner', kind:'player', points:15, answer:null,
      options:[{id:'mbappe',name:'K. Mbappé',team:'FRA'},{id:'yamal',name:'L. Yamal',team:'ESP'},{id:'haaland',name:'E. Haaland',team:'NOR'},{id:'vini',name:'Vinícius Jr',team:'BRA'}] },
    { key:'scotland', q:'How far do Scotland go?', kind:'stage', points:10, answer:null,
      options:['Group stage','Round of 32','Round of 16','Quarter Final','Semi Final','Final','Winner'] },
    { key:'england', q:'How far do England go?', kind:'stage', points:10, answer:null,
      options:['Group stage','Round of 32','Round of 16','Quarter Final','Semi Final','Final','Winner'] },
    { key:'surprise', q:'Biggest Surprise Team', kind:'team', points:10, answer:null,
      options:['NOR','MAR','SEN','JPN','CRO','COL'] },
    { key:'flop', q:'Biggest Disappointment', kind:'team', points:10, answer:null,
      options:['ENG','BEL','GER','USA','BRA'] },
    { key:'cleanSheets', q:'Most Clean Sheets', kind:'team', points:10, answer:null,
      options:['ESP','BRA','ARG','FRA'] },
    { key:'youngPlayer', q:'Best Young Player', kind:'player', points:10, answer:null,
      options:[{id:'yamal',name:'L. Yamal',team:'ESP'},{id:'yildiz',name:'K. Yıldız',team:'TUR'},{id:'endrick',name:'Endrick',team:'BRA'},{id:'wirtz',name:'F. Wirtz',team:'GER'}] }
  ];

  var lines = {
    welcome:"Right. Let's get this started. Wheesht is watching.",
    drawGood:"Oh aye. That's a tidy wee team. Ye might actually do something wi' that.",
    drawMid:"Could be worse. Could be better. Wheesht is reserving judgement.",
    drawBad:"…Wheesht is not going to insult ye. The flag's nice though.",
    england:"…Interesting. Wheesht is remaining professional. We'll see.",
    scotland:"SCOTLAND. The homeland. In a group with Brazil, mind — but Wheesht believes. Wheesht needs a minute. Then a parade.",
    eliminated:"Ye've been eliminated. Wheesht is… sorry. (Wheesht is not sorry. Wheesht saw this coming.)",
    predOpen:"Predictions are open. Back yerself. Wheesht will remember every single one.",
    predLocked:"Predictions are locked. No takebacks. Wheesht has yer answers in writing.",
    empty:"Nothing here yet. Wheesht is watching the space.",
    error:"Something went wrong. Wheesht is investigating. Wheesht suspects foul play."
  };

  var fee = 5, pot = 0;               // pot starts empty, grows per sign-up
  var still=0, out=0, tl=teams.length;

  window.WC_DATA = {
    teams: teams,
    people: people,
    r16: r16,
    fixtures: fixtures,
    predictions: PREDICTIONS,
    fee: fee, pot: pot,
    payouts: [
      {place:'Winner', pct:0.55, label:'holds the champion'},
      {place:'Runner-up', pct:0.20, label:'holds the losing finalist'},
      {place:'Prediction champ', pct:0.13, label:'best prediction score'},
      {place:'Wooden spoon', pct:0.12, label:'first team eliminated'}
    ],
    lines: lines,
    meta: {
      name:'The Office Sweepstake', season:'World Cup 2026', stageLabel:'Group Stage',
      phase:'pre', maxTeams: teams.length,
      groupSize: people.length, stillIn: still, out: out, teamsLeft: tl,
      kickoff:'Thu 11 June', finalVenue:'MetLife Stadium, New Jersey', finalDate:'Sun 19 July',
      predictionsLocked: false
    }
  };
})();
