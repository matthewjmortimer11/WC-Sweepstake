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


def _clean_emoji_pack(pack):
    # Normalise to a de-duplicated list of distinct single glyphs.
    seen = []
    for item in pack:
        if item and item not in seen:
            seen.append(item)
    return seen


# ── After Dark (18+) ──────────────────────────────────────────────────────────
# Crude, raunchy, dark-humour adult fare in the spirit of a certain card game:
# booze, bad decisions, bodily betrayals and dad-bod despair. Deliberately edgy,
# but kept to taboo/gross-out comedy — no slurs or content targeting protected
# groups. (Want something sharper for your group? Use the custom word list.)
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
    "classic": {"name": "Classic", "emoji": "🕵️", "words": _dedupe_words(CLASSIC),
                "blurb": "The all-rounder. Concrete, evocative nouns."},
    "movies": {"name": "Movies & TV", "emoji": "🎬", "words": _dedupe_words(MOVIES),
               "blurb": "Lights, camera, association."},
    "food": {"name": "Food & Drink", "emoji": "🍜", "words": _dedupe_words(FOOD),
             "blurb": "A delicious tangle of clues."},
    "scifi": {"name": "Sci-Fi & Fantasy", "emoji": "🚀", "words": _dedupe_words(SCIFI),
              "blurb": "Wizards, warp drives and wormholes."},
    "emoji": {"name": "Emoji Chaos", "emoji": "😎", "words": _clean_emoji_pack(EMOJI),
              "blurb": "No words at all — pure picture mayhem."},
    "afterdark": {"name": "After Dark", "emoji": "🔞", "words": _dedupe_words(AFTER_DARK),
                  "blurb": "Crude, rude, NSFW. Not for grandma. 18+."},
    "bottomdrawer": {"name": "Bottom Drawer", "emoji": "☠️", "words": _dedupe_words(BOTTOM_DRAWER),
                     "blurb": "Filthier than After Dark. Truly 18+. No apologies."},
}


def pack_meta() -> list[dict]:
    """Lightweight pack descriptors for the lobby UI (no full word lists)."""
    return [
        {"id": pid, "name": p["name"], "emoji": p["emoji"],
         "blurb": p["blurb"], "count": len(p["words"])}
        for pid, p in PACKS.items()
    ]


def words_for(pack_id: str) -> list[str]:
    pack = PACKS.get(pack_id)
    if not pack:
        return list(CLASSIC)
    return list(pack["words"])
