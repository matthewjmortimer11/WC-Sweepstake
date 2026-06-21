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


PACKS = {
    "classic": {"name": "Classic", "emoji": "🕵️", "words": CLASSIC,
                "blurb": "The all-rounder. Concrete, evocative nouns."},
    "movies": {"name": "Movies & TV", "emoji": "🎬", "words": MOVIES,
               "blurb": "Lights, camera, association."},
    "food": {"name": "Food & Drink", "emoji": "🍜", "words": FOOD,
             "blurb": "A delicious tangle of clues."},
    "scifi": {"name": "Sci-Fi & Fantasy", "emoji": "🚀", "words": SCIFI,
              "blurb": "Wizards, warp drives and wormholes."},
    "emoji": {"name": "Emoji Chaos", "emoji": "😎", "words": _clean_emoji_pack(EMOJI),
              "blurb": "No words at all — pure picture mayhem."},
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
