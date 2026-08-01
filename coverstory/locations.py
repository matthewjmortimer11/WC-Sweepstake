"""Location dossiers for Cover Story."""

from __future__ import annotations

PACKS: dict[str, dict] = {
    "classic": {"name": "Classic", "description": "Readable places for first-time tables."},
    "luxury": {"name": "Luxury", "description": "Glamour, service, and suspicious privilege."},
    "chaos": {"name": "Chaos", "description": "Loud, messy locations with lots to bluff about."},
    "football": {"name": "Football", "description": "Matchday, tournaments, and sweepstake-friendly drama."},
    "weird": {"name": "Weird", "description": "Surreal places for groups that like nonsense."},
    "family": {"name": "Family", "description": "Clean, broad locations for mixed-age groups."},
    "afterdark": {"name": "After Dark", "description": "Sharper, more scandalous social settings."},
}

LOCATIONS: list[dict] = [
    {
        "id": "orbital-hotel",
        "name": "Orbital Hotel",
        "category": "Luxury / Space",
        "texture": "Zero-gravity champagne, velvet lounges, sunrise over Earth.",
        "roles": ["Concierge", "Pilot", "Honeymooner", "Chef", "Security Chief", "Influencer", "Engineer", "Bellhop"],
        "questions": ["What is the best view here?", "What keeps going wrong?", "Who gets the best treatment?"],
    },
    {
        "id": "underground-night-market",
        "name": "Underground Night Market",
        "category": "City / Secret",
        "texture": "Neon tarps, steam, counterfeit watches, dumplings at midnight.",
        "roles": ["Vendor", "Smuggler", "Food Critic", "Pickpocket", "Courier", "Tourist", "DJ", "Detective"],
        "questions": ["What would you buy first?", "What smell gives this place away?", "Who should we avoid?"],
    },
    {
        "id": "haunted-museum",
        "name": "Haunted Museum",
        "category": "Culture / Supernatural",
        "texture": "Dusty glass cases, moonlit portraits, alarms that trigger themselves.",
        "roles": ["Curator", "Night Guard", "Ghost Hunter", "Restorer", "School Teacher", "Thief", "Tour Guide", "Janitor"],
        "questions": ["What room do people whisper in?", "What should nobody touch?", "What happens after closing?"],
    },
    {
        "id": "submarine-gala",
        "name": "Submarine Gala",
        "category": "Ocean / High Society",
        "texture": "Piano music, black tie, sonar pings, ocean pressing on the glass.",
        "roles": ["Captain", "Violinist", "Marine Biologist", "Billionaire", "Diver", "Waiter", "Engineer", "Journalist"],
        "questions": ["What are you worried will leak?", "What did you dress up for?", "What can you hear outside?"],
    },
    {
        "id": "volcano-lab",
        "name": "Volcano Research Lab",
        "category": "Science / Hazard",
        "texture": "Orange warning lights, heat shimmer, ash on every clipboard.",
        "roles": ["Geologist", "Drone Pilot", "Medic", "Intern", "Safety Officer", "Reporter", "Cook", "Data Analyst"],
        "questions": ["What is the emergency plan?", "What ruined your shoes?", "What are you measuring?"],
    },
    {
        "id": "royal-wedding",
        "name": "Royal Wedding",
        "category": "Ceremony / Scandal",
        "texture": "Gold chairs, nervous speeches, cameras, a cake taller than a guard.",
        "roles": ["Bride", "Prince", "Florist", "Bodyguard", "Photographer", "Ex", "Baker", "Page Boy"],
        "questions": ["Who is causing the most stress?", "What will be remembered tomorrow?", "Where are you meant to stand?"],
    },
    {
        "id": "arctic-research-station",
        "name": "Arctic Research Station",
        "category": "Remote / Survival",
        "texture": "Whiteout windows, humming heaters, frozen antennas, instant coffee.",
        "roles": ["Meteorologist", "Mechanic", "Doctor", "Radio Operator", "Cook", "Biologist", "Pilot", "Expedition Lead"],
        "questions": ["What did you run out of?", "What sound makes everyone tense?", "How do you stay warm?"],
    },
    {
        "id": "floating-casino",
        "name": "Floating Casino",
        "category": "Gambling / Cruise",
        "texture": "Roulette wheels, sea spray, brass rails, a suspiciously lucky guest.",
        "roles": ["Dealer", "Magician", "High Roller", "Bartender", "Singer", "Pit Boss", "Lifeguard", "Accountant"],
        "questions": ["What game has the crowd?", "Who is cheating?", "What happens if the weather turns?"],
    },
    {
        "id": "film-set",
        "name": "Film Set",
        "category": "Production / Drama",
        "texture": "Hot lights, cables, fake rain, one more take after one more take.",
        "roles": ["Director", "Actor", "Stunt Double", "Makeup Artist", "Boom Operator", "Producer", "Extra", "Script Supervisor"],
        "questions": ["What keeps delaying us?", "Who is pretending?", "What is real here?"],
    },
    {
        "id": "moonlit-vineyard",
        "name": "Moonlit Vineyard",
        "category": "Countryside / Mystery",
        "texture": "Rows of vines, cellar doors, old barrels, a harvest party going sideways.",
        "roles": ["Winemaker", "Sommelier", "Heiress", "Gardener", "Chef", "Inspector", "Musician", "Neighbour"],
        "questions": ["What tastes best here?", "Where would you hide something?", "Who knows the family secret?"],
    },
    {
        "id": "airport-vip-lounge",
        "name": "Airport VIP Lounge",
        "category": "Travel / Delay",
        "texture": "Quiet carpets, gate changes, warm towels, panic hidden behind sunglasses.",
        "roles": ["Pilot", "Celebrity", "Travel Agent", "Security Officer", "Barista", "Business Traveller", "Cleaner", "Translator"],
        "questions": ["What are we waiting for?", "What perk matters most?", "Who should not miss their flight?"],
    },
    {
        "id": "mega-aquarium",
        "name": "Mega Aquarium",
        "category": "Family / Ocean",
        "texture": "Blue tunnels, jellyfish glow, wet floors, children glued to the glass.",
        "roles": ["Marine Vet", "Diver", "Gift Shop Clerk", "Parent", "Photographer", "Cleaner", "Announcer", "School Kid"],
        "questions": ["What is everyone staring at?", "What job gets wet?", "What would you never tap?"],
    },
    {
        "id": "desert-film-premiere",
        "name": "Desert Film Premiere",
        "category": "Celebrity / Heat",
        "texture": "Red carpet on sand, generators, flashbulbs, luxury tents.",
        "roles": ["Movie Star", "Critic", "Driver", "Stylist", "Security", "Sponsor", "Fan", "Projectionist"],
        "questions": ["What makes this awkward?", "Who arrived late?", "What would ruin the evening?"],
    },
    {
        "id": "wizard-university",
        "name": "Wizard University",
        "category": "Fantasy / School",
        "texture": "Floating books, argumentative portraits, potion stains, late homework.",
        "roles": ["Professor", "Apprentice", "Librarian", "Groundskeeper", "Potion Seller", "Head Student", "Exchange Wizard", "Caretaker"],
        "questions": ["What subject is hardest?", "What rule gets broken most?", "What is moving by itself?"],
    },
    {
        "id": "jungle-eco-resort",
        "name": "Jungle Eco Resort",
        "category": "Travel / Nature",
        "texture": "Canopy bridges, solar lamps, insects at dinner, expensive silence.",
        "roles": ["Guide", "Guest", "Botanist", "Chef", "Ranger", "Influencer", "Medic", "Owner"],
        "questions": ["What should we pack?", "What sound wakes you up?", "What is luxurious but impractical?"],
    },
    {
        "id": "underground-bunker",
        "name": "Underground Bunker",
        "category": "Emergency / Secrets",
        "texture": "Steel doors, stale air, canned food, maps with red circles.",
        "roles": ["Commander", "Engineer", "Doctor", "Cook", "Archivist", "Guard", "Scientist", "Courier"],
        "questions": ["What do we ration?", "What door should stay shut?", "Who has authority here?"],
    },
]

LOCATIONS.extend([
    {"id": "champions-locker-room", "pack": "football", "name": "Champions Locker Room", "category": "Football / Pressure", "texture": "Boots on tiles, tactics on a whiteboard, cameras waiting outside.", "roles": ["Captain", "Goalkeeper", "Coach", "Physio", "Rookie", "Kit Manager", "Agent", "Journalist"], "questions": ["What smells strongest?", "Who should not speak to the press?", "What happens if we lose?"]},
    {"id": "var-control-room", "pack": "football", "name": "VAR Control Room", "category": "Football / Tech", "texture": "Frozen frames, headset chatter, coffee cups, everyone shouting at pixels.", "roles": ["VAR Lead", "Replay Operator", "Referee", "Technician", "Observer", "Producer", "Analyst", "Rules Expert"], "questions": ["What angle matters most?", "Who is angry with us?", "What do we rewind?"]},
    {"id": "fan-zone", "pack": "football", "name": "World Cup Fan Zone", "category": "Football / Crowd", "texture": "Flags, plastic cups, big screens, strangers hugging before disaster.", "roles": ["Superfan", "Vendor", "Steward", "Drummer", "Tourist", "Commentator", "Face Painter", "Police Liaison"], "questions": ["What chant starts first?", "What gets spilled?", "Who is taking this too seriously?"]},
    {"id": "press-conference", "pack": "football", "name": "Press Conference", "category": "Football / Media", "texture": "Sponsor boards, clipped answers, flashing cameras, one loaded question.", "roles": ["Manager", "Captain", "Reporter", "Translator", "PR Officer", "Camera Operator", "Podcast Host", "Security"], "questions": ["What question should be dodged?", "Who looks nervous?", "What phrase gets repeated?"]},
    {"id": "stadium-turnstiles", "pack": "football", "name": "Stadium Turnstiles", "category": "Football / Arrival", "texture": "Ticket scanners, scarf sellers, queues, and that first roar from inside.", "roles": ["Steward", "Late Fan", "Ticket Tout", "Mascot", "Police Officer", "Programme Seller", "Ground Staff", "VIP Guest"], "questions": ["What slows everyone down?", "What did someone forget?", "Where is the noise coming from?"]},
    {"id": "team-bus", "pack": "football", "name": "Team Bus", "category": "Football / Travel", "texture": "Tinted windows, headphones, police escort, and a manager pretending to relax.", "roles": ["Driver", "Striker", "Analyst", "Physio", "Coach", "Security", "Young Player", "Media Officer"], "questions": ["Who gets the front seat?", "What is everyone avoiding?", "What can you see outside?"]},
    {"id": "trophy-room", "pack": "luxury", "name": "Private Trophy Room", "category": "Luxury / Legacy", "texture": "Velvet ropes, polished glass, old medals, and locked drawers.", "roles": ["Collector", "Curator", "Heir", "Cleaner", "Insurance Agent", "Thief", "Historian", "Photographer"], "questions": ["What is worth the most?", "What should not be touched?", "Who has the keys?"]},
    {"id": "penthouse-auction", "pack": "luxury", "name": "Penthouse Auction", "category": "Luxury / Money", "texture": "Champagne whispers, numbered paddles, skyline views, fake smiles.", "roles": ["Auctioneer", "Collector", "Appraiser", "Bodyguard", "Heiress", "Art Dealer", "Waiter", "Journalist"], "questions": ["What would you bid on?", "Who is pretending to be rich?", "What item has a secret?"]},
    {"id": "private-island-spa", "pack": "luxury", "name": "Private Island Spa", "category": "Luxury / Escape", "texture": "White robes, cucumber water, speedboats, and a no-phones rule nobody follows.", "roles": ["Masseuse", "Resort Owner", "Guest", "Yoga Coach", "Boat Captain", "Chef", "Influencer", "Security"], "questions": ["What is forbidden here?", "What sounds relaxing?", "Who is hardest to please?"]},
    {"id": "diamond-vault", "pack": "luxury", "name": "Diamond Vault", "category": "Luxury / Security", "texture": "Laser grids, felt trays, steel doors, and one nervous fingerprint scan.", "roles": ["Gemologist", "Guard", "Client", "Cleaner", "Thief", "Insurance Broker", "Technician", "Manager"], "questions": ["What sets off the alarm?", "What is smallest but valuable?", "Who should not be alone?"]},
    {"id": "opera-box", "pack": "luxury", "name": "Royal Opera Box", "category": "Luxury / Culture", "texture": "Red velvet, binoculars, whispered gossip, and applause at the wrong time.", "roles": ["Patron", "Singer", "Conductor", "Critic", "Usher", "Royal Guest", "Stagehand", "Composer"], "questions": ["What do you pretend to understand?", "Who has the best seat?", "What interrupts the show?"]},
    {"id": "luxury-ski-lodge", "pack": "luxury", "name": "Luxury Ski Lodge", "category": "Luxury / Snow", "texture": "Fireplaces, wet gloves, private instructors, and gossip over hot chocolate.", "roles": ["Instructor", "Owner", "Guest", "Chef", "Medic", "Chauffeur", "Influencer", "Lift Operator"], "questions": ["What got lost in the snow?", "Who is showing off?", "What happens after dark?"]},
    {"id": "escape-room", "pack": "chaos", "name": "Escape Room", "category": "Chaos / Puzzle", "texture": "Padlocks, fake blood, ticking clocks, and someone overthinking a lamp.", "roles": ["Game Master", "Birthday Guest", "Puzzle Fan", "Actor", "Panicker", "Clue Hoarder", "Sceptic", "Manager"], "questions": ["What clue is too obvious?", "Who is least helpful?", "What should open next?"]},
    {"id": "school-disco", "pack": "chaos", "name": "School Disco", "category": "Chaos / Party", "texture": "Sticky floors, fizzy drinks, cheap lights, and teachers guarding the exit.", "roles": ["DJ", "Teacher", "Crush", "Wallflower", "Class Clown", "Parent Helper", "Prefect", "Snack Seller"], "questions": ["What song causes chaos?", "Who is hiding outside?", "What gets confiscated?"]},
    {"id": "airport-security-line", "pack": "chaos", "name": "Airport Security Line", "category": "Chaos / Travel", "texture": "Plastic trays, impatient sighs, belt alarms, and one abandoned water bottle.", "roles": ["Security Agent", "Late Passenger", "Pilot", "Parent", "Influencer", "Business Traveller", "Cleaner", "Translator"], "questions": ["What should be taken off?", "Who is holding everyone up?", "What bag looks suspicious?"]},
    {"id": "wedding-kitchen", "pack": "chaos", "name": "Wedding Kitchen", "category": "Chaos / Catering", "texture": "Steam, missing forks, collapsing timings, and a cake with structural concerns.", "roles": ["Head Chef", "Server", "Best Man", "Bride's Aunt", "Dishwasher", "Baker", "Planner", "Photographer"], "questions": ["What is late?", "Who is shouting?", "What cannot be dropped?"]},
    {"id": "live-tv-studio", "pack": "chaos", "name": "Live TV Studio", "category": "Chaos / Broadcast", "texture": "Countdown beeps, hot lights, earpieces, and a guest about to say too much.", "roles": ["Presenter", "Producer", "Guest", "Floor Manager", "Camera Operator", "Makeup Artist", "Weather Reporter", "Intern"], "questions": ["What happens in ten seconds?", "Who is off script?", "What should the audience not see?"]},
    {"id": "theme-park-queue", "pack": "family", "name": "Theme Park Queue", "category": "Family / Fun", "texture": "Sun cream, height charts, snack wrappers, and distant screams.", "roles": ["Ride Operator", "Parent", "Excited Kid", "Mascot", "Photographer", "Mechanic", "Teenager", "First-Aider"], "questions": ["What are we waiting for?", "Who changes their mind?", "What costs too much?"]},
    {"id": "library-story-hour", "pack": "family", "name": "Library Story Hour", "category": "Family / Quiet", "texture": "Beanbags, picture books, whispers, and one child asking enormous questions.", "roles": ["Librarian", "Parent", "Child", "Author", "Volunteer", "Teacher", "Cleaner", "Book Club Member"], "questions": ["What voice would you use?", "What must stay quiet?", "Who knows the ending?"]},
    {"id": "animal-shelter", "pack": "family", "name": "Animal Shelter", "category": "Family / Care", "texture": "Clipboards, donated blankets, squeaky toys, and hopeful visitors.", "roles": ["Vet", "Volunteer", "Adopter", "Manager", "Cleaner", "Trainer", "Photographer", "Delivery Driver"], "questions": ["What needs feeding?", "Who is hardest to say no to?", "What smell gives this away?"]},
    {"id": "science-fair", "pack": "family", "name": "Science Fair", "category": "Family / School", "texture": "Poster boards, baking soda volcanoes, proud parents, and unsafe extension cords.", "roles": ["Student", "Judge", "Teacher", "Parent", "Rival", "Photographer", "Principal", "Lab Assistant"], "questions": ["What experiment might explode?", "Who practised the most?", "What gets a ribbon?"]},
    {"id": "ice-cream-parlour", "pack": "family", "name": "Ice Cream Parlour", "category": "Family / Treat", "texture": "Freezer fog, sticky counters, waffle cones, and impossible flavour choices.", "roles": ["Server", "Child", "Parent", "Manager", "Delivery Driver", "Tourist", "Cleaner", "Birthday Guest"], "questions": ["What flavour divides people?", "What melts first?", "Who wants toppings?"]},
    {"id": "wizard-court", "pack": "weird", "name": "Wizard Court", "category": "Weird / Justice", "texture": "Floating gavels, cursed paperwork, and witnesses under truth spells.", "roles": ["Judge", "Familiar", "Accused Wizard", "Bailiff", "Potion Lawyer", "Scribe", "Witness", "Hex Inspector"], "questions": ["What spell is illegal?", "Who is lying badly?", "What object is evidence?"]},
    {"id": "time-travel-agency", "pack": "weird", "name": "Time Travel Agency", "category": "Weird / Travel", "texture": "Brochures for extinct beaches, paradox waivers, clocks running backwards.", "roles": ["Agent", "Tourist", "Historian", "Mechanic", "Future Child", "Security", "Guide", "Accountant"], "questions": ["When should we avoid?", "What souvenir is dangerous?", "Who has met themselves?"]},
    {"id": "cloud-factory", "pack": "weird", "name": "Cloud Factory", "category": "Weird / Weather", "texture": "Silver pipes, bottled thunder, ladders into fog, and damp paperwork.", "roles": ["Forecaster", "Engineer", "Rain Tester", "Manager", "Storm Wrangler", "Cleaner", "Inspector", "Intern"], "questions": ["What kind of weather is late?", "What leaks here?", "Who controls the thunder?"]},
    {"id": "dream-hotel", "pack": "weird", "name": "Dream Hotel", "category": "Weird / Sleep", "texture": "Endless corridors, floating luggage, breakfast served before yesterday.", "roles": ["Concierge", "Sleeper", "Nightmare", "Bellhop", "Manager", "Dream Critic", "Cleaner", "Lost Guest"], "questions": ["What makes no sense?", "Who cannot wake up?", "What room changes shape?"]},
    {"id": "miniature-city", "pack": "weird", "name": "Miniature City", "category": "Weird / Tiny", "texture": "Model trains, tiny traffic jams, enormous fingers, and mayoral panic.", "roles": ["Mayor", "Model Maker", "Giant Visitor", "Train Driver", "Planner", "Photographer", "Police Chief", "Shopkeeper"], "questions": ["What looks bigger than it should?", "Who is in charge?", "What breaks if touched?"]},
    {"id": "midnight-karaoke", "pack": "afterdark", "name": "Midnight Karaoke", "category": "After Dark / Party", "texture": "Sticky microphones, neon lyrics, private booths, and emotional key changes.", "roles": ["Singer", "Bartender", "Ex", "Birthday Friend", "Bouncer", "DJ", "Regular", "Taxi Driver"], "questions": ["What song is dangerous?", "Who should stop singing?", "What happens after the chorus?"]},
    {"id": "secret-rooftop-bar", "pack": "afterdark", "name": "Secret Rooftop Bar", "category": "After Dark / City", "texture": "Password doors, city lights, expensive ice, and gossip over the ledge.", "roles": ["Bartender", "Bouncer", "Influencer", "Owner", "Date", "DJ", "Regular", "Detective"], "questions": ["What is the password?", "Who was not invited?", "What can you see from here?"]},
    {"id": "casino-back-room", "pack": "afterdark", "name": "Casino Back Room", "category": "After Dark / Risk", "texture": "Cigar smoke, stacked chips, locked doors, and numbers nobody writes down.", "roles": ["Pit Boss", "Dealer", "Card Counter", "Cleaner", "Loan Shark", "Magician", "Guard", "High Roller"], "questions": ["Who owes money?", "What game is private?", "What should stay hidden?"]},
    {"id": "film-wrap-party", "pack": "afterdark", "name": "Film Wrap Party", "category": "After Dark / Celebrity", "texture": "Champagne towers, tired crew, fake friendships, and phones recording everything.", "roles": ["Actor", "Director", "Producer", "Stunt Double", "Publicist", "Fan", "Bartender", "Photographer"], "questions": ["Who gets thanked?", "What secret almost came out?", "Who leaves first?"]},
    {"id": "mansion-masquerade", "pack": "afterdark", "name": "Mansion Masquerade", "category": "After Dark / Mystery", "texture": "Masks, candlelight, locked studies, and guests lying about their names.", "roles": ["Host", "Guest", "Butler", "Heiress", "Musician", "Detective", "Gatecrasher", "Driver"], "questions": ["Who is impossible to recognise?", "What room is off limits?", "What would you hide in a mask?"]},
    {"id": "city-hospital", "pack": "classic", "name": "City Hospital", "category": "Classic / Emergency", "texture": "Bright corridors, rolling beds, coffee, and announcements nobody understands.", "roles": ["Doctor", "Nurse", "Patient", "Surgeon", "Receptionist", "Paramedic", "Cleaner", "Visitor"], "questions": ["What is urgent?", "Who is waiting?", "What sound keeps repeating?"]},
    {"id": "train-station", "pack": "classic", "name": "Train Station", "category": "Classic / Travel", "texture": "Platform boards, luggage wheels, crowded benches, and late announcements.", "roles": ["Commuter", "Conductor", "Tourist", "Cafe Worker", "Ticket Inspector", "Cleaner", "Lost Child", "Musician"], "questions": ["What is delayed?", "Where do people look?", "Who has the wrong ticket?"]},
    {"id": "police-station", "pack": "classic", "name": "Police Station", "category": "Classic / Authority", "texture": "Desks, radios, interview rooms, and vending machine coffee.", "roles": ["Detective", "Desk Sergeant", "Lawyer", "Witness", "Suspect", "Forensics Tech", "Reporter", "Cleaner"], "questions": ["Who is nervous?", "What gets written down?", "What room has no windows?"]},
    {"id": "supermarket", "pack": "classic", "name": "Supermarket", "category": "Classic / Everyday", "texture": "Trolleys, checkout beeps, freezer doors, and someone blocking an aisle.", "roles": ["Cashier", "Manager", "Shopper", "Security Guard", "Butcher", "Shelf Stacker", "Delivery Driver", "Child"], "questions": ["What aisle are we in?", "What is on offer?", "Who forgot a list?"]},
    {"id": "hotel-lobby", "pack": "classic", "name": "Hotel Lobby", "category": "Classic / Travel", "texture": "Rolling suitcases, polished floors, key cards, and floral arrangements.", "roles": ["Receptionist", "Guest", "Porter", "Manager", "Cleaner", "Concierge", "Tour Guide", "Taxi Driver"], "questions": ["What do you ask for first?", "Who is checking out?", "What is too expensive?"]},
    {"id": "beach-cafe", "pack": "classic", "name": "Beach Cafe", "category": "Classic / Leisure", "texture": "Sand under chairs, umbrellas, gulls, and cold drinks sweating on tables.", "roles": ["Server", "Lifeguard", "Tourist", "Surfer", "Chef", "Owner", "Musician", "Local"], "questions": ["What gets sandy?", "Who needs sunscreen?", "What is best cold?"]},
    {"id": "city-zoo", "pack": "family", "name": "City Zoo", "category": "Family / Animals", "texture": "Maps, feeding times, gift shops, and children sprinting to the next enclosure.", "roles": ["Keeper", "Parent", "Child", "Vet", "Photographer", "Tour Guide", "Cleaner", "Snack Seller"], "questions": ["What has a feeding time?", "Who is lost?", "What makes the loudest noise?"]},
    {"id": "camping-site", "pack": "family", "name": "Camping Site", "category": "Family / Outdoors", "texture": "Tent pegs, damp socks, campfire smoke, and torchlight arguments.", "roles": ["Scout Leader", "Camper", "Cook", "Ranger", "Parent", "Kid", "Neighbour", "First-Aider"], "questions": ["What did we forget?", "What happens if it rains?", "Who snores?"]},
    {"id": "toy-shop", "pack": "family", "name": "Toy Shop", "category": "Family / Retail", "texture": "Bright shelves, demo buttons, birthday money, and tiny wheels everywhere.", "roles": ["Shopkeeper", "Child", "Parent", "Collector", "Cashier", "Stockroom Worker", "Mascot", "Security"], "questions": ["What makes noise?", "What is too expensive?", "Who wants everything?"]},
    {"id": "community-pool", "pack": "family", "name": "Community Pool", "category": "Family / Sport", "texture": "Chlorine, lockers, whistles, and wet footprints down the corridor.", "roles": ["Lifeguard", "Swimmer", "Parent", "Coach", "Receptionist", "Cleaner", "Diver", "Snack Vendor"], "questions": ["What rule gets shouted?", "Who forgot something?", "What should not run?"]},
    {"id": "robot-restaurant", "pack": "weird", "name": "Robot Restaurant", "category": "Weird / Dining", "texture": "Chrome waiters, confused menus, sparks, and perfectly square chips.", "roles": ["Robot Waiter", "Chef", "Customer", "Mechanic", "Reviewer", "Owner", "Programmer", "Cleaner"], "questions": ["What order goes wrong?", "Who needs rebooting?", "What tastes suspiciously precise?"]},
    {"id": "underwater-post-office", "pack": "weird", "name": "Underwater Post Office", "category": "Weird / Bureaucracy", "texture": "Bubble stamps, waterproof envelopes, coral queues, and soggy complaints.", "roles": ["Postmaster", "Diver", "Courier", "Clerk", "Tourist", "Marine Guard", "Collector", "Cleaner"], "questions": ["What cannot get wet?", "Who is waiting in line?", "What address is impossible?"]},
    {"id": "moon-cheese-mine", "pack": "weird", "name": "Moon Cheese Mine", "category": "Weird / Space", "texture": "Crumbly tunnels, low gravity carts, silver helmets, and snack-based geology.", "roles": ["Miner", "Taster", "Engineer", "Astronaut", "Inspector", "Cook", "Cart Driver", "Scientist"], "questions": ["What crumbles?", "Who samples too much?", "What floats away?"]},
    {"id": "storm-chasing-van", "pack": "chaos", "name": "Storm Chasing Van", "category": "Chaos / Weather", "texture": "Radar screens, snack wrappers, screaming wind, and a door nobody should open.", "roles": ["Driver", "Meteorologist", "Camera Operator", "Intern", "Mechanic", "Reporter", "Medic", "Navigator"], "questions": ["What direction is bad?", "Who forgot equipment?", "What should be strapped down?"]},
    {"id": "courtroom-drama", "pack": "chaos", "name": "Courtroom Drama", "category": "Chaos / Argument", "texture": "Objections, paper stacks, tense silence, and a judge losing patience.", "roles": ["Judge", "Lawyer", "Witness", "Defendant", "Journalist", "Clerk", "Security", "Jury Member"], "questions": ["Who should stop talking?", "What is evidence?", "What surprises everyone?"]},
    {"id": "hotel-fire-alarm", "pack": "chaos", "name": "Hotel Fire Alarm", "category": "Chaos / Evacuation", "texture": "Dressing gowns, flashing lights, stairwell echoes, and nobody knowing if it is real.", "roles": ["Guest", "Manager", "Firefighter", "Cleaner", "Receptionist", "Chef", "Security", "Tourist"], "questions": ["What did you grab?", "Who is still upstairs?", "What caused the alarm?"]},
    {"id": "late-night-tattoo-shop", "pack": "afterdark", "name": "Late Night Tattoo Shop", "category": "After Dark / Choices", "texture": "Buzzing needles, flash sheets, leather chairs, and someone reconsidering a name.", "roles": ["Artist", "Customer", "Friend", "Apprentice", "Receptionist", "Regular", "Cleaner", "Biker"], "questions": ["What design is risky?", "Who is pretending it does not hurt?", "What should be spelled twice?"]},
    {"id": "private-detective-office", "pack": "afterdark", "name": "Private Detective Office", "category": "After Dark / Noir", "texture": "Blinds, folders, cheap whisky, and rain making everything look guilty.", "roles": ["Detective", "Client", "Secretary", "Suspect", "Photographer", "Lawyer", "Cleaner", "Informant"], "questions": ["What is in the envelope?", "Who is being followed?", "What does nobody admit?"]},
])


def normalise_packs(pack_ids: list[str] | tuple[str, ...] | None) -> list[str]:
    selected = [str(p).strip().lower() for p in (pack_ids or []) if str(p).strip().lower() in PACKS]
    return selected or ["classic"]


def locations_for_packs(pack_ids: list[str] | tuple[str, ...] | None) -> list[dict]:
    packs = set(normalise_packs(pack_ids))
    chosen = [loc for loc in LOCATIONS if loc.get("pack", "classic") in packs]
    return chosen or [loc for loc in LOCATIONS if loc.get("pack", "classic") == "classic"]


def public_packs() -> list[dict]:
    counts = {pid: 0 for pid in PACKS}
    for loc in LOCATIONS:
        counts[loc.get("pack", "classic")] = counts.get(loc.get("pack", "classic"), 0) + 1
    return [
        {"id": pid, "name": meta["name"], "description": meta["description"], "count": counts.get(pid, 0)}
        for pid, meta in PACKS.items()
    ]


def public_locations(pack_ids: list[str] | tuple[str, ...] | None = None) -> list[dict]:
    return [
        {
            "id": loc["id"],
            "name": loc["name"],
            "category": loc["category"],
            "pack": loc.get("pack", "classic"),
        }
        for loc in locations_for_packs(pack_ids)
    ]
