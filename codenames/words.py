"""
Word packs for Cipher.

Each pack is a curated list of single tokens suitable for a word-association
guessing game. Players can also supply their own custom list at game-creation
time; the built-in packs below are the defaults and are deliberately broad,
family-friendly and visual so clues are fun to give.
"""

from __future__ import annotations

# ── Classic ──────────────────────────────────────────────────────────────────
# The all-rounder. Concrete, evocative nouns that pull in many directions.
CLASSIC = [
    "Africa", "Agent", "Air", "Alien", "Alps", "Amazon", "Ambulance", "America",
    "Angel", "Antarctica", "Apple", "Arm", "Atlantis", "Australia", "Aztec",
    "Back", "Ball", "Band", "Bank", "Bar", "Beach", "Bear", "Beat", "Bed",
    "Beijing", "Bell", "Belt", "Berlin", "Bermuda", "Berry", "Bill", "Block",
    "Board", "Bomb", "Bond", "Boom", "Boot", "Bottle", "Bow", "Box", "Bridge",
    "Brush", "Buck", "Buffalo", "Bug", "Bugle", "Button", "Calf", "Canada",
    "Cap", "Capital", "Car", "Card", "Carrot", "Casino", "Cast", "Cat",
    "Cell", "Centaur", "Center", "Chair", "Change", "Charge", "Check", "Chest",
    "Chick", "China", "Chocolate", "Church", "Circle", "Cliff", "Cloak", "Club",
    "Code", "Cold", "Comic", "Compound", "Concert", "Conductor", "Contract",
    "Cook", "Copper", "Cotton", "Court", "Cover", "Crane", "Crash", "Cricket",
    "Cross", "Crown", "Cycle", "Czech", "Dance", "Date", "Day", "Death",
    "Deck", "Degree", "Diamond", "Dice", "Dinosaur", "Disease", "Doctor", "Dog",
    "Draft", "Dragon", "Dress", "Drill", "Drop", "Duck", "Dwarf", "Eagle",
    "Egypt", "Embassy", "Engine", "England", "Eye", "Face", "Fair", "Fall",
    "Fan", "Fence", "Field", "Fighter", "Figure", "File", "Film", "Fire",
    "Fish", "Flute", "Fly", "Foot", "Force", "Forest", "Fork", "France",
    "Game", "Gas", "Genius", "Germany", "Ghost", "Giant", "Glass", "Glove",
    "Gold", "Grace", "Grass", "Greece", "Green", "Ground", "Ham", "Hand",
    "Hawk", "Head", "Heart", "Helicopter", "Himalayas", "Hole", "Hollywood",
    "Honey", "Hood", "Hook", "Horn", "Horse", "Horseshoe", "Hospital", "Hotel",
    "Ice", "Iron", "Ivory", "Jack", "Jam", "Jet", "Jupiter", "Kangaroo",
    "Ketchup", "Key", "Kid", "King", "Kiwi", "Knife", "Knight", "Lab", "Lap",
    "Laser", "Lawyer", "Lead", "Lemon", "Leprechaun", "Life", "Light", "Limousine",
    "Line", "Link", "Lion", "Litter", "Loch", "Lock", "Log", "London", "Luck",
    "Mail", "Mammoth", "Maple", "Marble", "March", "Mass", "Match", "Mercury",
    "Mexico", "Microscope", "Millionaire", "Mine", "Mint", "Missile", "Model",
    "Mole", "Moon", "Moscow", "Mount", "Mouse", "Mouth", "Mug", "Nail", "Needle",
    "Net", "New York", "Night", "Ninja", "Note", "Novel", "Nurse", "Nut",
    "Octopus", "Oil", "Olive", "Olympus", "Opera", "Orange", "Organ", "Palm",
    "Pan", "Pants", "Paper", "Parachute", "Park", "Part", "Pass", "Paste",
    "Penguin", "Phoenix", "Piano", "Pie", "Pilot", "Pin", "Pipe", "Pirate",
    "Pistol", "Pit", "Pitch", "Plane", "Plastic", "Plate", "Platypus", "Play",
    "Plot", "Point", "Poison", "Pole", "Police", "Pool", "Port", "Post",
    "Pound", "Press", "Princess", "Pumpkin", "Pupil", "Pyramid", "Queen", "Rabbit",
    "Racket", "Ray", "Revolution", "Ring", "Robin", "Robot", "Rock", "Rome",
    "Root", "Rose", "Roulette", "Round", "Row", "Ruler", "Satellite", "Saturn",
    "Scale", "School", "Scientist", "Scorpion", "Screen", "Scuba", "Seal", "Server",
    "Shadow", "Shakespeare", "Shark", "Ship", "Shoe", "Shop", "Shot", "Sink",
    "Skyscraper", "Slip", "Slug", "Smuggler", "Snow", "Snowman", "Sock", "Soldier",
    "Soul", "Sound", "Space", "Spell", "Spider", "Spike", "Spine", "Spot",
    "Spring", "Spy", "Square", "Stadium", "Staff", "Star", "State", "Stick",
    "Stock", "Straw", "Stream", "Strike", "String", "Sub", "Suit", "Superhero",
    "Swing", "Switch", "Table", "Tablet", "Tag", "Tail", "Tap", "Teacher",
    "Telescope", "Temple", "Theater", "Thief", "Thumb", "Tick", "Tie", "Time",
    "Tokyo", "Tooth", "Torch", "Tower", "Track", "Train", "Triangle", "Trip",
    "Trunk", "Tube", "Turkey", "Undertaker", "Unicorn", "Vacuum", "Van", "Vet",
    "Wake", "Wall", "War", "Washer", "Washington", "Watch", "Water", "Wave",
    "Web", "Well", "Whale", "Whip", "Wind", "Witch", "Worm", "Yard",
    "Anchor", "Badge", "Battery", "Blanket", "Bubble", "Bucket", "Bulb",
    "Cabin", "Cactus", "Cage", "Candle", "Canyon", "Carpet", "Castle",
    "Cave", "Chain", "Chalk", "Chimney", "Circus", "Closet", "Coast",
    "Compass", "Coral", "Couch", "Crab", "Creek", "Crib", "Crowd",
    "Curtain", "Dagger", "Daisy", "Desert", "Dome", "Donkey", "Dune",
    "Echo", "Feather", "Fence", "Ferry", "Flame", "Flamingo", "Flash",
    "Fog", "Fossil", "Fountain", "Frost", "Fungus", "Furnace", "Geyser",
    "Glacier", "Glove", "Goose", "Guitar", "Harbor", "Harvest", "Hay",
    "Hedge", "Helmet", "Herb", "Hive", "Hornet", "Igloo", "Ink", "Insect",
    "Island", "Jacket", "Jar", "Jeep", "Jungle", "Kite", "Ladder", "Lagoon",
    "Lantern", "Laundry", "Lava", "Lawn", "Leaf", "Leash", "Lens", "Lighthouse",
    "Lily", "Lizard", "Luggage", "Magnet", "Meadow", "Meteor", "Moss", "Motel",
    "Motor", "Mud", "Museum", "Nectar", "Nest", "Oar", "Oasis", "Otter",
    "Oyster", "Paddle", "Pebble", "Pepper", "Pier", "Pillow", "Pirate",
    "Pocket", "Pond", "Porch", "Prairie", "Puddle", "Puppet", "Quilt", "Radar",
    "Rain", "Raven", "Reef", "Rifle", "River", "Roof", "Rope", "Ruin",
    "Saddle", "Sail", "Saw", "Scarf", "Scissors", "Seagull", "Seashell",
    "Seed", "Shed", "Shell", "Sheriff", "Shovel", "Shrine", "Sign", "Silk",
    "Siren", "Skull", "Sled", "Sleeve", "Snail", "Snowflake", "Soap", "Spear",
    "Spoon", "Spray", "Squirrel", "Stamp", "Statue", "Steam", "Storm", "Stove",
    "Strawberry", "Summit", "Sunset", "Swamp", "Sweater", "Sword", "Tent",
    "Thorn", "Thunder", "Ticket", "Tide", "Tissue", "Tomb", "Tornado", "Trail",
    "Treasure", "Trench", "Trophy", "Tunnel", "Turtle", "Twig", "Valley", "Vase",
    "Vine", "Volcano", "Wagon", "Wallet", "Weasel", "Weed", "Wheel", "Willow",
    "Window", "Wolf", "Wool", "Wrench", "Zebra",
]

# ── Movies & TV ──────────────────────────────────────────────────────────────
MOVIES = [
    "Action", "Actor", "Award", "Blockbuster", "Box Office", "Camera", "Cast",
    "Cinema", "Climax", "Close-up", "Comedy", "Costume", "Credits", "Cut",
    "Director", "Drama", "Editing", "Extra", "Fantasy", "Flashback", "Frame",
    "Genre", "Hero", "Horror", "Lighting", "Lines", "Location", "Makeup",
    "Montage", "Musical", "Mystery", "Plot", "Popcorn", "Premiere", "Producer",
    "Prop", "Reel", "Remake", "Reboot", "Romance", "Scene", "Score", "Screen",
    "Script", "Sequel", "Set", "Soundtrack", "Spotlight", "Stage", "Star",
    "Stunt", "Studio", "Subtitle", "Suspense", "Take", "Theater", "Thriller",
    "Trailer", "Twist", "Villain", "Voiceover", "Western", "Wrap", "Zoom",
    "Binge", "Channel", "Episode", "Finale", "Pilot", "Ratings", "Remote",
    "Season", "Series", "Show", "Sitcom", "Streaming", "Spinoff", "Network",
    "Antagonist", "Arc", "Audience", "Backdrop", "Backlot", "Ballad", "Banter",
    "Binge-watch", "Biopic", "Boom mic", "Breakdown", "Broadway", "Bromance",
    "Cameo", "Casting", "Cliché", "Cliffhanger", "Cold open", "Confessional",
    "Crossover", "Cue card", "Deadpan", "Debut", "Dialogue", "Docuseries",
    "Dub", "Ensemble", "Expose", "Fan theory", "Fandom", "Flash mob", "Flop",
    "Foreshadow", "Green screen", "Guest star", "Heist", "Improv", "Interval",
    "Laugh track", "Lead", "MacGuffin", "Melodrama", "Monologue", "Narrator",
    "Oscar bait", "Outtake", "Parody", "Plot hole", "Post-credits", "Protagonist",
    "Reboot", "Red carpet", "Review", "Ripoff", "Rom-com", "Satire", "Saga",
    "Satire", "Screen test", "Selfie", "Soap opera", "Solo", "Soundstage",
    "Spoiler", "Stand-in", "Stinger", "Storyboard", "Subplot", "Supercut",
    "Teaser", "Trope", "Understudy", "Unreliable narrator", "Villain arc",
    "Voice actor", "Walk-on", "Whodunit",
]

# ── Food & Drink ─────────────────────────────────────────────────────────────
FOOD = [
    "Almond", "Apple", "Apron", "Avocado", "Bacon", "Bagel", "Banana", "Basil",
    "Bean", "Beef", "Berry", "Biscuit", "Bowl", "Bread", "Broth", "Brownie",
    "Burger", "Butter", "Cabbage", "Cake", "Candy", "Caramel", "Carrot",
    "Cereal", "Cheese", "Cherry", "Chili", "Chips", "Chocolate", "Cinnamon",
    "Coconut", "Coffee", "Cookie", "Corn", "Cream", "Crust", "Cucumber",
    "Cupcake", "Curry", "Custard", "Dessert", "Dough", "Dumpling", "Egg",
    "Espresso", "Feast", "Fig", "Flour", "Fork", "Fries", "Garlic", "Ginger",
    "Grape", "Gravy", "Grill", "Honey", "Jam", "Jelly", "Juice", "Ketchup",
    "Kettle", "Kiwi", "Lemon", "Lentil", "Lettuce", "Lime", "Lobster", "Mango",
    "Maple", "Marmalade", "Melon", "Menu", "Milk", "Mint", "Muffin", "Mushroom",
    "Mustard", "Noodle", "Nutmeg", "Oat", "Olive", "Omelette", "Onion", "Orange",
    "Oven", "Pancake", "Pasta", "Pastry", "Peach", "Peanut", "Pear", "Pepper",
    "Pickle", "Pie", "Pizza", "Plate", "Plum", "Popcorn", "Potato", "Pretzel",
    "Pudding", "Pumpkin", "Radish", "Recipe", "Rice", "Roast", "Salad", "Salt",
    "Sandwich", "Sauce", "Sausage", "Scone", "Seafood", "Skillet", "Soup",
    "Spice", "Spinach", "Steak", "Stew", "Strawberry", "Sugar", "Sushi", "Syrup",
    "Taco", "Tea", "Toast", "Tofu", "Tomato", "Truffle", "Turkey", "Vanilla",
    "Waffle", "Walnut", "Wasabi", "Whisk", "Yeast", "Yogurt",
]

# ── Sci-Fi & Fantasy ─────────────────────────────────────────────────────────
SCIFI = [
    "Alien", "Android", "Antimatter", "Armor", "Asteroid", "Beacon", "Beam",
    "Black Hole", "Blaster", "Cloak", "Clone", "Colony", "Comet", "Console",
    "Cosmos", "Crystal", "Cyborg", "Dimension", "Dragon", "Drone", "Dwarf",
    "Eclipse", "Elf", "Engine", "Galaxy", "Gateway", "Goblin", "Gravity",
    "Hologram", "Hyperdrive", "Jetpack", "Knight", "Laser", "Lightyear",
    "Mage", "Mars", "Mech", "Meteor", "Mothership", "Mutant", "Nebula", "Neon",
    "Nova", "Oracle", "Orbit", "Orc", "Phaser", "Plasma", "Portal", "Potion",
    "Prophecy", "Quantum", "Quest", "Radiation", "Ray", "Reactor", "Realm",
    "Relic", "Robot", "Rocket", "Rune", "Saber", "Scroll", "Sentinel", "Shield",
    "Singularity", "Sorcerer", "Spaceship", "Spell", "Sprite", "Star", "Stardust",
    "Starship", "Supernova", "Teleport", "Terraform", "Throne", "Titan", "Troll",
    "Universe", "Vortex", "Warp", "Warlock", "Wizard", "Wormhole", "Wraith",
    "Xenon", "Android", "Asteroid",
]

# ── Emoji (visual / silly mode) ──────────────────────────────────────────────
EMOJI = [
    "🚀", "🐙", "🍕", "🎸", "👑", "🦄", "🌋", "🧊", "🔥", "🎲", "🧲", "🛸",
    "🦊", "🐉", "🌈", "⚓", "🎯", "🧩", "🪐", "🍄", "🤖", "📸", "🎩", "🧨",
    "🗝️", "🔮", "🦂", "🐝", "🍯", "🧁", "🎻", "🥁", "🎺", "🏰", "🗿", "🌪️",
    "❄️", "☂️", "🪁", "🎈", "🧸", "🪀", "🦖", "🐧", "🦅", "🦉", "🐺", "🦈",
    "🐡", "🦚", "🦜", "🌵", "🍩", "🥨", "🧇", "🥞", "🍔", "🌮", "🍫", "🍓",
    "🍋", "🥥", "🌶️", "🧄", "🧅", "⚙️", "🔭", "🔬", "🧬", "🛰️", "🪂", "🎳",
    "🎮", "🕹️", "🎨", "🖌️", "📡", "🎁", "💎", "🪓", "🛡️", "⚔️", "🏆", "🔑",
]


# ── Countries ─────────────────────────────────────────────────────────────────
COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia",
    "Austria", "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium",
    "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia", "Botswana", "Brazil",
    "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon",
    "Canada", "Chad", "Chile", "China", "Colombia", "Congo", "Costa Rica",
    "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark", "Djibouti", "Dominica",
    "Ecuador", "Egypt", "El Salvador", "England", "Eritrea", "Estonia",
    "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia",
    "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guyana",
    "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran",
    "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan",
    "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos",
    "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein",
    "Lithuania", "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives",
    "Mali", "Malta", "Mauritania", "Mauritius", "Mexico", "Moldova", "Monaco",
    "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
    "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria",
    "North Korea", "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama",
    "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania",
    "Russia", "Rwanda", "Samoa", "Scotland", "Senegal", "Serbia", "Seychelles",
    "Singapore", "Slovakia", "Slovenia", "Somalia", "South Africa", "South Korea",
    "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
    "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga", "Tunisia",
    "Turkey", "Turkmenistan", "Uganda", "Ukraine", "United Arab Emirates",
    "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu",
    "Vatican", "Venezuela", "Vietnam", "Wales", "Yemen", "Zambia", "Zimbabwe",
    "Andorra", "Angola", "Antigua", "Bahamas", "Barbados", "Comoros", "Dominican Republic",
    "Equatorial Guinea", "Eswatini", "Guinea-Bissau", "Ivory Coast", "North Macedonia",
    "Papua New Guinea", "Saint Lucia", "San Marino", "Sao Tome", "Sierra Leone",
    "Solomon Islands", "South Sudan", "Timor-Leste", "Trinidad", "Vatican City",
]

# ── Marvel ────────────────────────────────────────────────────────────────────
MARVEL = [
    "Avengers", "Iron Man", "Captain America", "Thor", "Hulk", "Black Widow",
    "Hawkeye", "Spider-Man", "Doctor Strange", "Black Panther", "Ant-Man",
    "Wasp", "Captain Marvel", "Scarlet Witch", "Vision", "Falcon", "Winter Soldier",
    "War Machine", "Nick Fury", "Loki", "Thanos", "Ultron", "Red Skull", "Venom",
    "Deadpool", "Wolverine", "Storm", "Cyclops", "Jean Grey", "Professor X",
    "Magneto", "Mystique", "Gambit", "Rogue", "Beast", "Nightcrawler", "Colossus",
    "Silver Surfer", "Galactus", "Daredevil", "Punisher", "Luke Cage", "Jessica Jones",
    "Iron Fist", "She-Hulk", "Moon Knight", "Blade", "Ghost Rider", "Namor",
    "Fantastic Four", "Mister Fantastic", "Invisible Woman", "Human Torch", "Thing",
    "Doctor Doom", "Green Goblin", "Doc Ock", "Sandman", "Vulture", "Mysterio",
    "Kingpin", "Electro", "Rhino", "Shang-Chi", "Ms Marvel", "America Chavez",
    "Star-Lord", "Gamora", "Drax", "Rocket", "Groot", "Nebula", "Mantis",
    "Yondu", "Ego", "Ronan", "Korath", "Kree", "Skrull", "Nova Corps",
    "Asgard", "Wakanda", "Sokovia", "New York", "Sanctum", "Tesseract", "Infinity Stone",
    "Mjolnir", "Stormbreaker", "Vibranium", "Arc Reactor", "Shield", "Cape",
    "Suit", "Helmet", "Gauntlet", "Portal", "Bifrost", "Quinjet", "Helicarrier",
    "Stark Tower", "Avengers Tower", "Xavier School", "Oscorp", "Latveria",
    "Kamar-Taj", "Quantum Realm", "Multiverse", "Variant", "Kang", "Celestial",
    "Eternals", "Sersi", "Ikaris", "Kingo", "Phastos", "Makkari", "Sprite",
    "Arishem", "Deviant", "Symbiote", "Gamma", "Super soldier", "Mutant", "Inhuman",
    "Hydra", "SHIELD", "AIM", "Roxxon", "Ten Rings", "Ravager", "Collector",
    "Grandmaster", "Watcher", "Howard the Duck", "Howard Stark", "Peggy Carter",
    "Maria Hill", "Happy Hogan", "Ned Leeds", "MJ", "Aunt May", "Uncle Ben",
    "J Jonah Jameson", "Daily Bugle", "Oscorp", "Stark Expo", "Pym Particle",
]

# ── UK Snacks ─────────────────────────────────────────────────────────────────
UK_SNACKS = [
    "Crisps", "Walkers", "Quavers", "Wotsits", "Monster Munch", "Skips", "Hula Hoops",
    "Nik Naks", "Squares", "Pom-Bear", "McCoy's", "Kettle Chips", "Tyrrells",
    "Salt and vinegar", "Cheese and onion", "Ready salted", "Prawn cocktail",
    "Biscuit", "Digestive", "Hobnob", "Rich Tea", "Custard Cream", "Bourbon",
    "Jammie Dodger", "Party Ring", "Ginger Nut", "Shortbread", "Malted Milk",
    "Chocolate Digestive", "Fig Roll", "Garibaldi", "Viennese Whirl", "Caramel Wafer",
    "Tunnock's Teacake", "Tunnock's Caramel Log", "Club", "Penguin", "KitKat",
    "Twirl", "Flake", "Crunchie", "Boost", "Double Decker", "Yorkie", "Wispa",
    "Mars Bar", "Snickers", "Bounty", "Galaxy", "Dairy Milk", "Creme Egg",
    "Mini Egg", "Buttons", "Freddo", "Milkybar", "Aero", "Maltesers", "Minstrels",
    "Revels", "Wine Gums", "Jelly Babies", "Percy Pig", "Cola Bottles", "Fizzy Cola",
    "Haribo", "Starmix", "Tangfastics", "Love Hearts", "Refreshers", "Drumstick",
    "Sherbet Fountain", "Dib Dab", "Parma Violets", "Flying Saucer", "Bonbon",
    "Pick and mix", "Liquorice Allsorts", "Pontefract Cake", "Bassett's", "Maynards",
    "Sweets", "Chippy", "Chippy chips", "Chip butty", "Scotch egg", "Pork pie",
    "Sausage roll", "Greggs", "Cornish pasty", "Cheese straw", "Cheese puff",
    "Pork scratchings", "Flapjack", "Millionaire shortbread", "Eccles cake",
    "Bakewell tart", "Cherry Bakewell", "Victoria sponge", "Scone", "Clotted cream",
    "Jam", "Marmite", "Bovril", "Branston Pickle", "HP Sauce", "Brown sauce",
    "Tomato sauce", "Piccalilli", "Chutney", "Pickled onion", "Gherkin", "Rollmop",
    "Irn-Bru", "Lucozade", "Ribena", "Robinsons", "Squash", "Tizer", "Dandelion and burdock",
    "Ginger beer", "Shandy", "Lilt", "Oasis", "Capri-Sun", "Fruit Shoot",
    "Yorkshire Tea", "PG Tips", "Typhoo", "Builder's tea", "Milk two sugars",
    "Fish and chips", "Curry sauce", "Gravy", "Mushy peas", "Mint sauce",
    "Pasty", "Pie", "Steak bake", "Sausage bean melt", "Bacon bap", "Full English",
    "Black pudding", "White pudding", "Bubble and squeak", "Toad in the hole",
]


def _clean_emoji_pack(pack):
    # Normalise to a de-duplicated list of distinct single glyphs.
    seen = []
    for item in pack:
        if item and item not in seen:
            seen.append(item)
    return seen


# ── Drinking (18+) ────────────────────────────────────────────────────────────
DRINKING = [
    "Booze", "Vodka", "Tequila", "Whiskey", "Gin", "Rum", "Brandy", "Champagne",
    "Prosecco", "Sangria", "Margarita", "Mojito", "Martini", "Negroni", "Old fashioned",
    "Blackout", "Hangover", "Wasted", "Tipsy", "Buzzed", "Hammered", "Sloshed",
    "Beer pong", "Keg stand", "Shotgun", "Jagerbomb", "Fireball", "Malort",
    "Wine mom", "Day drinking", "Hair of the dog", "Pre-game", "Afters", "Last call",
    "Power hour", "Beer funnel", "Body shot", "Tequila shot", "Disco nap",
    "Bar tab", "Happy hour", "Open bar", "Cash bar", "Bartender", "Bouncer",
    "Dive bar", "Speakeasy", "Pub crawl", "House party", "Frat party", "Tailgate",
    "Flask", "Shot glass", "Pint", "Growler", "Keg", "Cork", "Cocktail shaker",
    "Ice bucket", "Lime wedge", "Salt rim", "Garnish", "Mixer", "Soda gun",
    "Hangxiety", "Drunk text", "Drunk dial", "Uber home", "Designated driver",
    "Breathalyzer", "DUI", "Public intoxication", "Bail", "Mugshot",
    "Wine drunk", "Tequila regret", "Whiskey courage", "Champagne problems",
    "Bottomless brunch", "Mimosas", "Bloody Mary", "Irish coffee", "Hot toddy",
    "Sake bomb", "Soju", "Absinthe", "Moonshine", "Hooch", "Brewery", "Distillery",
    "Hangover cure", "Greasy spoon", "Diner booth", "3am pizza", "Late night kebab",
    "Regrets", "What happened", "Blackout gap", "Walk of shame", "Mystery bruise",
    "Room spin", "Floor is lava", "One more round", "Closing time", "Afterparty",
    "Rooftop bar", "Nightclub", "VIP booth", "Cover charge", "ID check",
    "Fake ID", "Bouncer glare", "Spilled drink", "Sticky floor", "Bathroom line",
    "Karaoke drunk", "Dance floor", "Jukebox", "Pool table", "Dartboard",
    "Beer garden", "Patio season", "Porch beers", "Campfire drinks", "Cooler",
    "Red cup", "Solo cup", "Pong table", "Flip cup", "Kings", "Never have I ever",
    "Truth or drink", "Drinking game", "Penalty shot", "Chug", "Skull", "Cheers",
    "Toast", "Clink", "Round on me", "It's five o'clock", "Hair of the dog",
]

# ── Rude (18+) ────────────────────────────────────────────────────────────────
# Crude, gross-out and edgy humour — no slurs or hate targeting protected groups.
RUDE = [
    "Vomit", "Fart", "Diarrhea", "Skid mark", "Dutch oven", "Morning breath",
    "Food baby", "Beer belly", "Dad bod", "Man boobs", "Plumber crack",
    "Camel toe", "Wedgie", "Muffin top", "Back fat", "Nose hair", "Nipple",
    "Booty", "Twerk", "Thirst trap", "Nudes", "Sexting", "Tinder", "Ghosting",
    "Catfish", "Sugar daddy", "Booty call", "One night stand", "Walk of shame",
    "Side piece", "Wingman", "Friend zone", "Simp", "Situationship", "Ick",
    "Condom", "Viagra", "Blue balls", "Morning wood", "Wet dream", "Cougar",
    "MILF", "OnlyFans", "Stripper", "Lap dance", "Pole dance", "Strip club",
    "Bachelor party", "Regrets", "Divorce", "Alimony", "Midlife crisis",
    "Therapy", "Daddy issues", "Toxic ex", "Restraining order", "Group chat",
    "Drunk text", "Snack", "Bong", "Edibles", "Munchies", "Couch lock",
    "Mooning", "Streaking", "Speedo", "Mankini", "Crocs", "Cargo shorts",
    "Fanny pack", "Tramp stamp", "Mullet", "Comb over", "Toupee", "Spray tan",
    "Botox", "Manscaping", "Swamp ass", "Pit stains", "Hemorrhoids",
    "Colonoscopy", "Vasectomy", "Prostate", "Menopause", "Prune juice",
    "Adult diaper", "Karaoke", "Cringe", "Clout", "Karen", "Boomer",
    "Hickey", "Walk-in", "Thin walls", "Roommate", "Landlord", "Overdraft",
    "Screenshot", "Read receipt", "Block", "Unfollow", "Ex", "Rebound",
    "Hall pass", "Open relationship", "Poly", "Throuple", "Safe word",
    "Queef", "Gagging", "Brazilian", "Waxing", "Ingrown", "Bacne", "Jock itch",
    "Toe fungus", "Crop dusting", "Shart", "Code brown", "Debt", "Credit score",
    "BNPL", "Beige flag", "Red flag", "Gaslight", "Love bombing", "Dry spell",
    "Body count", "Main character", "NPC", "Delulu", "Rizz", "Down bad",
    "Office crush", "HR meeting", "PIP", "Quiet firing", "Bare minimum Monday",
    "Crop dust", "Mystery stain", "Crusty sock", "Bad angle", "Double chin",
]

# ── Adult (18+) ───────────────────────────────────────────────────────────────
# Sexual and bleak adult humour. No slurs or hate; use custom words for zero guardrails.
ADULT = [
    "Anal", "Oral", "Facial", "Creampie", "Bukkake", "Pegging", "Strap-on",
    "Dildo", "Butt plug", "Lube", "Spit", "Choke", "Choking", "Spanking",
    "Bondage", "Handcuffs", "Blindfold", "Fetish", "Kink", "Sub", "Dom",
    "Switch", "Aftercare", "Post nut clarity", "Whiskey dick", "Limp dick",
    "Premature", "Performance anxiety", "Dead bedroom", "Stealthing", "Raw",
    "Finish inside", "Money shot", "Glory hole", "Deep throat", "Gag reflex",
    "Morning after", "Plan B", "Pregnancy scare", "STD test", "Burning",
    "Itching", "Discharge", "Smegma", "Yeast infection", "UTI",
    "Period sex", "Tampon", "Pad", "Panty liner", "Skid marks", "Streak",
    "Brown star", "Rusty trombone", "Blumpkin", "Cleveland steamer",
    "Motorboat", "Tea bag", "Hummer", "Prolapse", "Hemorrhoid", "Fistula",
    "Colon blow", "Explosive diarrhea", "Public bathroom", "Gas station toilet",
    "Porta potty", "Wet fart", "Cum sock", "Incognito mode", "Browser history",
    "OnlyFans leak", "Sextape", "Tape", "Blackmail", "Sugar baby", "Findom",
    "Humiliation", "Degradation", "Objectify", "Thirst trap DM", "Bathroom selfie",
    "Mirror pic", "Ex's new partner", "Instagram official", "Soft launch",
    "Hard launch", "Cheating", "Affair", "Emotional affair", "Work spouse",
    "Office affair", "HR complaint", "Hostile workplace", "Wrongful termination",
    "Severance", "Child support", "Ankle monitor", "Community service",
    "Intervention", "Rock bottom", "Relapse", "Dry drunk", "Functioning alcoholic",
    "Jail", "Intervention", "STD", "Clinic", "Pullout", "Rawdog", "Edge", "Edging",
    "Finsta", "Edging", "Plan B", "Stealthing",
]

# ── Offensive (18+) ───────────────────────────────────────────────────────────
# Political figures, ideologies and historical villains for edgy groups.
# Optional toggle — no slurs or content targeting protected groups.
OFFENSIVE = [
    "Hitler", "Nazi", "Nazis", "Fascist", "Fascists", "Fascism", "Socialist",
    "Socialists", "Socialism", "Communist", "Communists", "Communism", "Liberal",
    "Liberals", "Conservative", "Conservatives", "Libertarian", "Anarchist",
    "Capitalist", "Marxist", "Leninist", "Maoist", "Stalinist", "Trotskyist",
    "Stalin", "Mussolini", "Lenin", "Mao", "Pol Pot", "Pinochet", "Franco",
    "Goebbels", "Himmler", "Eichmann", "Goring", "Hess", "Bormann",
    "Dictator", "Tyrant", "Despot", "Autocrat", "Oligarch", "War criminal",
    "Genocide", "Holocaust", "Concentration camp", "Gulag", "Propaganda",
    "Censorship", "Book burning", "Purge", "Secret police", "Gestapo", "KGB",
    "SS", "Brownshirt", "Swastika", "Sieg heil", "Third Reich", "Reichstag",
    "Blitzkrieg", "Axis", "Allies", "D-Day", "Pearl Harbor", "Atomic bomb",
    "Cold War", "Iron Curtain", "Berlin Wall", "Cuban Missile Crisis",
    "Vietnam", "Draft dodger", "Protest", "Riot", "Coup", "Insurrection",
    "Impeachment", "Scandal", "Watergate", "Monica", "Email server",
    "Fake news", "Deep state", "Culture war", "Woke", "Anti-woke", "Cancel culture",
    "Culture war", "Red pill", "Blue pill", "Echo chamber", "Filter bubble",
    "Brexit", "Referendum", "Populist", "Nationalist", "Separatist", "Secession",
    "Border wall", "Immigration", "Deportation", "Refugee crisis", "Asylum",
    "Lobbyist", "Super PAC", "Gerrymandering", "Filibuster", "Shutdown",
    "Debt ceiling", "Tax evasion", "Offshore account", "Panama Papers",
    "Conspiracy", "Flat earth", "QAnon", "Illuminati", "New World Order",
    "Cult leader", "Jim Jones", "Charles Manson", "David Koresh", "Jonestown",
    "Serial killer", "Ted Bundy", "Jeffrey Dahmer", "Jack the Ripper",
    "Terrorist", "Terrorism", "Jihad", "Crusade", "Holy war", "Fatwa",
    "Assassination", "Regicide", "Treason", "Sedition", "Espionage", "Spygate",
    "Waterboarding", "Torture", "Guantanamo", "Drone strike", "Collateral damage",
    "Collateral", "War crime", "Hague", "Nuremberg", "War tribunal",
    "Apartheid", "Segregation", "Jim Crow", "KKK", "White supremacy",
    "Neo-Nazi", "Skinhead", "Proud Boys", "Antifa", "BLM", "MAGA",
    "Trump", "Biden", "Obama", "Bush", "Clinton", "Reagan", "Thatcher",
    "Putin", "Kim Jong-un", "Xi Jinping", "Netanyahu", "Zelenskyy", "Orban",
    "Bolsonaro", "Modi", "Erdogan", "Khamenei", "Ayatollah", "Castro",
    "Che Guevara", "Fidel", "Chavez", "Maduro", "Saddam", "Gaddafi", "Osama",
    "ISIS", "Al-Qaeda", "Taliban", "Hezbollah", "Hamas", "IRA", "ETA",
]

# ── Unfiltered (18+) ──────────────────────────────────────────────────────────
# Filthier than Adult — truly no apologies. Still no slurs or hate.
UNFILTERED = [
    "Anal", "Oral", "Facial", "Creampie", "Bukkake", "Pegging", "Strap-on",
    "Dildo", "Butt plug", "Lube", "Spit", "Choke", "Choking", "Spanking",
    "Bondage", "Handcuffs", "Blindfold", "Fetish", "Kink", "Sub", "Dom",
    "Switch", "Aftercare", "Post nut clarity", "Whiskey dick", "Limp dick",
    "Premature", "Performance anxiety", "Dead bedroom", "Stealthing", "Raw",
    "Finish inside", "Money shot", "Glory hole", "Deep throat", "Gag reflex",
    "Morning after", "Plan B", "Pregnancy scare", "STD test", "Burning",
    "Itching", "Discharge", "Smegma", "Yeast infection", "UTI",
    "Period sex", "Tampon", "Pad", "Panty liner", "Skid marks", "Streak",
    "Brown star", "Rusty trombone", "Blumpkin", "Cleveland steamer", "Alabama hot pocket",
    "Space dock", "Mung", "Santorum", "Felching", "Snowball", "Rusty hook",
    "Donkey punch", "Dirty sanchez", "Cincinnati bowtie", "Alaskan pipeline",
    "Hot carl", "Hot lunch", "Motorboat", "Tea bag", "Hummer", "Rusty anchor",
    "Prolapse", "Hemorrhoid", "Fistula", "Colon blow", "Explosive diarrhea",
    "Public bathroom", "Gas station toilet", "Porta potty", "Wet fart",
    "Mystery stain", "Crusty sock", "Cum sock", "Incognito mode", "Browser history",
    "OnlyFans leak", "Sextape", "Tape", "Blackmail",
    "Sugar baby", "Findom", "Humiliation", "Degradation", "Objectify", "Thirst trap DM",
    "Bathroom selfie", "Mirror pic", "Bad angle", "Double chin", "Muffin top pic",
    "Ex's new partner", "Instagram official", "Soft launch", "Hard launch", "Cheating",
    "Affair", "Emotional affair", "Work spouse", "Office affair", "HR complaint",
    "Hostile workplace", "Wrongful termination", "Severance", "Alimony", "Child support",
    "DUI", "Mugshot", "Breathalyzer", "Ankle monitor", "Community service",
    "Intervention", "Rock bottom", "Relapse", "Dry drunk", "Functioning alcoholic",
    "Wine drunk", "Tequila regret", "Jail", "Bail", "Public intoxication",
]

# ── Too Far (18+) ─────────────────────────────────────────────────────────────
# Beyond Offensive and Unfiltered — taboo, bleak and deliberately awful.
# Still no slurs or hate targeting protected groups; no sexual content involving minors.
TOO_FAR = [
    "Necrophilia", "Cannibalism", "Incest", "Bestiality", "Snuff film", "Gore",
    "Decapitation", "Dismemberment", "Flaying", "Skinning alive", "Buried alive",
    "Drawing and quartering", "Impalement", "Crucifixion", "Stoning", "Beheading",
    "Boiling alive", "Rat torture", "Waterboarding", "Electric shock torture",
    "Thumbscrew", "Iron maiden", "Pear of anguish", "Breaking wheel", "Strangulation",
    "Suffocation", "Chloroform", "Kidnapping", "Hostage", "Human trafficking",
    "Sex trafficking", "Rape", "Gang rape", "Prison rape", "Date rape drug",
    "Pedophile", "Child molester", "Grooming", "Epstein", "Jeffrey Epstein",
    "Suicide", "Self-harm", "Cutting", "Overdose", "Fentanyl OD", "Jumping",
    "Hanging", "Carbon monoxide", "Pills", "Miscarriage", "Stillbirth", "Abortion",
    "Infanticide", "Shaken baby", "Dumpster baby", "Patricide", "Matricide",
    "Uxoricide", "Mercy killing", "Euthanasia", "Mass grave", "Ethnic cleansing",
    "Gas chamber", "Crematorium", "Auschwitz", "Bergen-Belsen", "Mass shooting",
    "School shooter", "9/11", "Twin Towers", "Chernobyl", "Hiroshima", "Nagasaki",
    "Unit 731", "Tuskegee", "MKUltra", "Human experimentation", "Forced sterilization",
    "Eugenics", "Lynching", "Lynch mob", "Rotting", "Maggots", "Decomposition",
    "Corpse", "Cadaver", "Morgue", "Autopsy", "Body bag", "Embalming", "Grave robbing",
    "Coprophagia", "Urine drinking", "Vore", "Guro", "Goatse", "Two girls one cup",
    "Painal", "Fist fucking", "Rectal prolapse", "Vaginal tearing", "Sounding",
    "Tentacle rape", "Inbreeding", "Gangrene", "Septic shock", "Amputation",
    "Botched surgery", "Wrongful amputation", "Solitary confinement", "Bonesaw",
    "Arsenic", "Cyanide", "Famine", "Starvation", "Genocide", "Holocaust",
    "Concentration camp", "War crime", "Torture", "Terror attack", "Beheading video",
    "ISIS", "Al-Qaeda", "Serial killer", "Ted Bundy", "Jeffrey Dahmer", "Ed Gein",
    "Charles Manson", "Jack the Ripper", "Jim Jones", "Jonestown", "Cult suicide",
    "Rock bottom", "Relapse", "Intervention", "DUI death", "Hit and run", "Manslaughter",
    "Wrongful death", "Blackmail tape", "Revenge porn", "Deepfake porn", "Doxxing",
    "Swatting", "Stalking", "Obsession", "Restraining order", "Hostile takeover",
    "Wrongful conviction", "Death row", "Lethal injection", "Electric chair", "Guillotine",
]

# Legacy alias content (kept for migration tests).
AFTER_DARK = [
    "Booze", "Vodka", "Tequila", "Blackout", "Hangover", "Wasted", "Beer pong",
    "Keg stand", "Shotgun", "Wine mom", "Day drinking", "Hair of the dog",
    "Vomit", "Fart", "Diarrhea", "Skid mark", "Dutch oven", "Morning breath",
    "Food baby", "Beer belly", "Dad bod", "Man boobs", "Plumber crack",
    "Camel toe", "Wedgie", "Muffin top", "Back fat", "Nose hair", "Nipple",
    "Booty", "Twerk", "Thirst trap", "Nudes", "Sexting", "Tinder", "Ghosting",
    "Catfish", "Sugar daddy", "Booty call", "One night stand", "Walk of shame",
    "Side piece", "Wingman", "Friend zone", "Simp", "Situationship", "Ick",
    "Condom", "Viagra", "Blue balls", "Morning wood", "Wet dream", "Cougar",
    "MILF", "OnlyFans", "Stripper", "Lap dance", "Pole dance", "Strip club",
    "Bachelor party", "Regerts", "Divorce", "Alimony", "Midlife crisis",
    "Therapy", "Daddy issues", "Toxic ex", "Restraining order", "Group chat",
    "Drunk text", "Snack", "Bong", "Edibles", "Munchies", "Couch lock",
    "Mooning", "Streaking", "Speedo", "Mankini", "Crocs", "Cargo shorts",
    "Fanny pack", "Tramp stamp", "Mullet", "Comb over", "Toupee", "Spray tan",
    "Botox", "Manscaping", "Swamp ass", "Pit stains", "Hemorrhoids",
    "Colonoscopy", "Vasectomy", "Prostate", "Menopause", "Prune juice",
    "Adult diaper", "Karaoke", "Cringe", "Clout", "Karen", "Boomer",
    "Hickey", "Walk-in", "Thin walls", "Roommate", "Landlord", "Overdraft",
    "Hangxiety", "Pre-game", "Afters", "Jagerbomb", "Fireball", "Malort",
    "Tequila shot", "Body shot", "Beer funnel", "Power hour", "Last call",
    "Disco nap", "Uber home", "Drunk dial", "Screenshot", "Read receipt",
    "Block", "Unfollow", "Ex", "Rebound", "Hall pass", "Open relationship",
    "Poly", "Throuple", "Safe word", "Plan B", "Pullout", "Rawdog",
    "STD", "Clinic", "Urinal", "Queef", "Gagging", "Brazilian", "Waxing",
    "Ingrown", "Bacne", "Jock itch", "Toe fungus", "Crop dusting", "Shart",
    "Code brown", "Debt", "Credit score", "BNPL", "Beige flag", "Red flag",
    "Gaslight", "Love bombing", "Dry spell", "Body count", "Main character",
    "NPC", "Delulu", "Rizz", "Down bad", "Edge", "Edging", "Finsta",
    "Office crush", "HR meeting", "PIP", "Quiet firing", "Bare minimum Monday",
    "Jagerbomb", "Fireball", "Malort", "Body shot", "Beer funnel", "Power hour",
    "Disco nap", "Drunk dial", "Screenshot", "Read receipt", "Hall pass",
    "Open relationship", "Rebound", "Hickey", "Walk-in", "Thin walls",
]

# ── Bottom Drawer (18+) ───────────────────────────────────────────────────────
# Filthier than After Dark — more sexual, bleak, and bodily. Still no slurs or
# hate; use a custom list if you want zero guardrails.
BOTTOM_DRAWER = [
    "Anal", "Oral", "Facial", "Creampie", "Bukkake", "Pegging", "Strap-on",
    "Dildo", "Butt plug", "Lube", "Spit", "Choke", "Choking", "Spanking",
    "Bondage", "Handcuffs", "Blindfold", "Fetish", "Kink", "Sub", "Dom",
    "Switch", "Aftercare", "Post nut clarity", "Whiskey dick", "Limp dick",
    "Premature", "Performance anxiety", "Dead bedroom", "Stealthing", "Raw",
    "Finish inside", "Money shot", "Glory hole", "Deep throat", "Gag reflex",
    "Morning after", "Plan B", "Pregnancy scare", "STD test", "Burning",
    "Itching", "Discharge", "Smegma", "Yeast infection", "UTI",
    "Period sex", "Tampon", "Pad", "Panty liner", "Skid marks", "Streak",
    "Brown star", "Rusty trombone", "Blumpkin", "Cleveland steamer", "Alabama hot pocket",
    "Space dock", "Mung", "Santorum", "Felching", "Snowball", "Rusty hook",
    "Donkey punch", "Dirty sanchez", "Cincinnati bowtie", "Alaskan pipeline",
    "Hot carl", "Hot lunch", "Motorboat", "Tea bag", "Hummer", "Rusty anchor",
    "Prolapse", "Hemorrhoid", "Fistula", "Colon blow", "Explosive diarrhea",
    "Public bathroom", "Gas station toilet", "Porta potty", "Wet fart",
    "Mystery stain", "Crusty sock", "Cum sock", "Incognito mode", "Browser history",
    "OnlyFans leak", "Sextape", "Tape", "Blackmail",
    "Sugar baby", "Findom", "Humiliation", "Degradation", "Objectify", "Thirst trap DM",
    "Bathroom selfie", "Mirror pic", "Bad angle", "Double chin", "Muffin top pic",
    "Ex's new partner", "Instagram official", "Soft launch", "Hard launch", "Cheating",
    "Affair", "Emotional affair", "Work spouse", "Office affair", "HR complaint",
    "Hostile workplace", "Wrongful termination", "Severance", "Alimony", "Child support",
    "DUI", "Mugshot", "Breathalyzer", "Ankle monitor", "Community service",
    "Intervention", "Rock bottom", "Relapse", "Dry drunk", "Functioning alcoholic",
    "Wine drunk", "Tequila regret", "Jail", "Bail", "Public intoxication",
]


def _dedupe_words(words: list[str]) -> list[str]:
    """Preserve order, drop blanks and duplicates (case-sensitive)."""
    seen: set[str] = set()
    out: list[str] = []
    for w in words:
        w = (w or "").strip()
        if w and w not in seen:
            seen.add(w)
            out.append(w)
    return out


PACKS = {
    "classic": {"name": "Classic", "emoji": "🕵️", "tier": "family",
                "words": _dedupe_words(CLASSIC),
                "blurb": "The all-rounder. Concrete, evocative nouns."},
    "movies": {"name": "Movies & TV", "emoji": "🎬", "tier": "family",
               "words": _dedupe_words(MOVIES),
               "blurb": "Lights, camera, association."},
    "food": {"name": "Food & Drink", "emoji": "🍜", "tier": "family",
             "words": _dedupe_words(FOOD),
             "blurb": "A delicious tangle of clues."},
    "scifi": {"name": "Sci-Fi & Fantasy", "emoji": "🚀", "tier": "family",
              "words": _dedupe_words(SCIFI),
              "blurb": "Wizards, warp drives and wormholes."},
    "emoji": {"name": "Emoji Chaos", "emoji": "😎", "tier": "family",
              "words": _clean_emoji_pack(EMOJI),
              "blurb": "No words at all — pure picture mayhem."},
    "countries": {"name": "Countries", "emoji": "🌍", "tier": "family",
                  "words": _dedupe_words(COUNTRIES),
                  "blurb": "Nations, states and geography from every continent."},
    "marvel": {"name": "Marvel", "emoji": "🦸", "tier": "family",
               "words": _dedupe_words(MARVEL),
               "blurb": "Heroes, villains, places and MCU lore."},
    "uksnacks": {"name": "UK Snacks", "emoji": "🇬🇧", "tier": "family",
                 "words": _dedupe_words(UK_SNACKS),
                 "blurb": "Crisps, biscuits, sweets and Greggs classics."},
    "drinking": {"name": "Drinking", "emoji": "🍻", "tier": "mature",
                 "words": _dedupe_words(DRINKING),
                 "blurb": "Bars, booze and bad decisions. 18+."},
    "rude": {"name": "Rude", "emoji": "🤬", "tier": "mature",
             "words": _dedupe_words(RUDE),
             "blurb": "Crude, gross-out and edgy humour. 18+."},
    "adult": {"name": "Adult", "emoji": "🔞", "tier": "adult",
              "words": _dedupe_words(ADULT),
              "blurb": "Sexual and bleak adult humour. 18+."},
    "offensive": {"name": "Offensive", "emoji": "💣", "tier": "adult",
                  "words": _dedupe_words(OFFENSIVE),
                  "blurb": "Politics, villains and culture-war chaos. 18+."},
    "unfiltered": {"name": "Unfiltered", "emoji": "☠️", "tier": "adult",
                   "words": _dedupe_words(UNFILTERED),
                   "blurb": "Filthier than Adult. Truly 18+. No apologies."},
    "toofar": {"name": "Too Far", "emoji": "💀", "tier": "toofar",
               "words": _dedupe_words(TOO_FAR),
               "blurb": "Beyond Offensive & Unfiltered. Genuinely awful. Double-check your group."},
    # Legacy ids — still resolve for old rooms / API calls.
    "afterdark": {"name": "After Dark", "emoji": "🔞", "tier": "adult",
                  "words": _dedupe_words(AFTER_DARK),
                  "blurb": "Legacy pack — use Drinking + Rude + Adult instead."},
    "bottomdrawer": {"name": "Bottom Drawer", "emoji": "☠️", "tier": "adult",
                     "words": _dedupe_words(BOTTOM_DRAWER),
                     "blurb": "Legacy pack — use Unfiltered instead."},
}

# Packs shown in the lobby toggle UI (excludes legacy aliases).
SELECTABLE_PACK_IDS = [
    "classic", "movies", "food", "scifi", "emoji",
    "countries", "marvel", "uksnacks",
    "drinking", "rude", "adult", "offensive", "unfiltered", "toofar",
]

_LEGACY_PACK_MAP = {
    "afterdark": ["drinking", "rude", "adult"],
    "bottomdrawer": ["unfiltered"],
}


def normalize_pack_ids(pack_ids: list[str] | None) -> list[str]:
    """Validate and de-dupe pack ids; always returns at least classic."""
    if not pack_ids:
        return ["classic"]
    out: list[str] = []
    for raw in pack_ids:
        pid = str(raw or "").strip().lower()
        if not pid:
            continue
        if pid in _LEGACY_PACK_MAP:
            for leg in _LEGACY_PACK_MAP[pid]:
                if leg not in out:
                    out.append(leg)
            continue
        if pid in SELECTABLE_PACK_IDS and pid not in out:
            out.append(pid)
    return out or ["classic"]


def pack_label(pack_ids: list[str]) -> str:
    """Human-readable label for a set of selected packs."""
    ids = normalize_pack_ids(pack_ids)
    if len(ids) == 1:
        return PACKS[ids[0]]["name"]
    names = [PACKS[i]["name"] for i in ids[:3]]
    extra = len(ids) - 3
    label = " + ".join(names)
    if extra > 0:
        label += f" +{extra}"
    return label


def pack_meta() -> list[dict]:
    """Lightweight pack descriptors for the lobby UI (no full word lists)."""
    return [
        {"id": pid, "name": p["name"], "emoji": p["emoji"],
         "blurb": p["blurb"], "count": len(p["words"]), "tier": p.get("tier", "family")}
        for pid, p in PACKS.items()
        if pid in SELECTABLE_PACK_IDS
    ]


def words_for(pack_id: str) -> list[str]:
    pack = PACKS.get(pack_id)
    if not pack:
        return list(CLASSIC)
    return list(pack["words"])


def words_for_packs(pack_ids: list[str] | None) -> list[str]:
    """Merge words from multiple selected packs (de-duplicated, order preserved)."""
    merged: list[str] = []
    for pid in normalize_pack_ids(pack_ids):
        merged.extend(words_for(pid))
    return _dedupe_words(merged)
