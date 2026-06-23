"""Who Am I? — identity packs (UK celebs, objects, Marvel, cartoons, notorious figures)."""

from __future__ import annotations

DEFAULT_PACK_IDS = ["uk_celebs"]

UK_CELEBS = [
    "Ed Sheeran",
    "Harry Styles",
    "Adele",
    "Stormzy",
    "Dua Lipa",
    "Charli XCX",
    "Central Cee",
    "Dave",
    "Skepta",
    "Olivia Rodrigo",
    "Taylor Swift",
    "Billie Eilish",
    "Ariana Grande",
    "Beyoncé",
    "Drake",
    "Sabrina Carpenter",
    "Rihanna",
    "Kanye West",
    "Marcus Rashford",
    "Mo Salah",
    "Harry Kane",
    "Jude Bellingham",
    "Lewis Hamilton",
    "David Beckham",
    "Cristiano Ronaldo",
    "Lionel Messi",
    "Erling Haaland",
    "Kylian Mbappé",
    "Tyson Fury",
    "Tommy Fury",
    "Ant & Dec",
    "Alison Hammond",
    "Holly Willoughby",
    "Gregg Wallace",
    "Jeremy Clarkson",
    "Gordon Ramsay",
    "Simon Cowell",
    "Gemma Collins",
    "KSI",
    "MrBeast",
    "TommyInnit",
    "Molly-Mae Hague",
    "King Charles III",
    "Prince Harry",
    "Kate Middleton",
    "Rishi Sunak",
    "Keir Starmer",
    "Boris Johnson",
    "Nigel Farage",
    "Tom Holland",
    "Zendaya",
    "Timothée Chalamet",
    "Margot Robbie",
    "Ryan Reynolds",
    "Robert Downey Jr.",
    "Elon Musk",
    "Greta Thunberg",
    "Kim Kardashian",
    "Donald Trump",
    "Doctor Who",
    "Paddington Bear",
    "Mr Bean",
    "James Bond",
    "Wallace & Gromit",
]

OBJECTS = [
    "A light bulb",
    "A Greggs sausage roll",
    "A Tesco meal deal",
    "A red phone box",
    "A double-decker bus",
    "A traffic cone",
    "A teapot",
    "A rugby ball",
    "A pint glass",
    "A uni house plant",
    "A lava lamp",
    "A disco ball",
    "A haunted Victorian lamp",
    "A Roman candle",
    "A toaster",
    "A microwave",
    "A Roomba",
    "A passive-aggressive Post-it note",
    "A wheelie bin",
    "A Boris bike",
    "An Oyster card",
    "A Tesco bag for life",
    "A Prime energy drink",
    "A Stanley cup",
    "A vape",
    "A fidget spinner",
    "A Tamagotchi",
    "A conspiracy corkboard",
    "A tax return",
    "A hung parliament",
    "The British weather",
    "A pint of milk",
    "A kettle",
    "A USB stick",
    "A Nokia 3310",
    "A flip phone",
    "A selfie stick",
    "A ring light",
    "A protein shaker",
]

MARVEL = [
    "Spider-Man",
    "Iron Man",
    "Captain America",
    "Thor",
    "The Hulk",
    "Black Widow",
    "Loki",
    "Thanos",
    "Wolverine",
    "Deadpool",
    "Doctor Strange",
    "Black Panther",
    "Groot",
    "Rocket Raccoon",
    "Scarlet Witch",
    "Vision",
    "Captain Marvel",
    "Shuri",
    "Venom",
    "Green Goblin",
    "Hawkeye",
    "Ant-Man",
    "Wasp",
    "Star-Lord",
    "Gamora",
    "Drax",
    "Nebula",
    "Nick Fury",
    "Professor X",
    "Magneto",
    "Storm",
    "Mystique",
    "Daredevil",
    "She-Hulk",
    "Moon Knight",
    "Ms. Marvel",
    "America Chavez",
    "The Thing",
    "Human Torch",
    "Silver Surfer",
]

CARTOONS = [
    "Homer Simpson",
    "SpongeBob SquarePants",
    "Patrick Star",
    "Shrek",
    "Elsa",
    "Mickey Mouse",
    "Bart Simpson",
    "Peter Griffin",
    "Rick Sanchez",
    "Morty Smith",
    "Dora the Explorer",
    "Peppa Pig",
    "Bluey",
    "Oscar the Grouch",
    "Scooby-Doo",
    "Bugs Bunny",
    "Tom (Tom & Jerry)",
    "Jerry (Tom & Jerry)",
    "Pikachu",
    "Ash Ketchum",
    "Naruto",
    "Goku",
    "Sonic the Hedgehog",
    "Mario",
    "Luigi",
    "Bowser",
    "Princess Peach",
    "Donkey Kong",
    "Woody (Toy Story)",
    "Buzz Lightyear",
    "Minions",
    "Gru",
    "Po (Kung Fu Panda)",
    "Toothless",
    "Hiccup",
    "Stitch",
    "Lilo",
    "Daffy Duck",
    "Tweety Bird",
    "Garfield",
    "Snoopy",
    "Charlie Brown",
    "Courage the Cowardly Dog",
    "Finn the Human",
    "Jake the Dog",
]

NOTORIOUS = [
    "Adolf Hitler",
    "Mao Zedong",
    "Joseph Stalin",
    "Benito Mussolini",
    "Pol Pot",
    "Idi Amin",
    "Kim Jong-un",
    "Genghis Khan",
    "Nero",
    "Caligula",
    "Vlad the Impaler",
    "Osama bin Laden",
    "Robert Mugabe",
    "Fidel Castro",
    "Vladimir Putin",
    "Xi Jinping",
    "Napoleon Bonaparte",
    "Henry VIII",
    "Marie Antoinette",
    "Cleopatra",
    "Julius Caesar",
    "Alexander the Great",
    "Joan of Arc",
    "Winston Churchill",
    "Margaret Thatcher",
    "Ronald Reagan",
    "Emmanuel Macron",
    "Mahatma Gandhi",
    "The Pope",
    "Karl Marx",
    "Thomas Edison",
    "Nikola Tesla",
    "Queen Elizabeth II",
    "Silvio Berlusconi",
]

PACKS: dict[str, dict] = {
    "uk_celebs": {
        "name": "UK Celebs",
        "emoji": "🇬🇧",
        "blurb": "Musicians, footballers, presenters and internet-famous faces UK teens know",
        "tier": "family",
        "words": UK_CELEBS,
    },
    "objects": {
        "name": "Objects",
        "emoji": "🔦",
        "blurb": "Random things — bulbs, buses, meal deals and absurd literal guesses",
        "tier": "family",
        "words": OBJECTS,
    },
    "marvel": {
        "name": "Marvel",
        "emoji": "🦸",
        "blurb": "MCU and comic-book heroes and villains",
        "tier": "family",
        "words": MARVEL,
    },
    "cartoons": {
        "name": "Cartoons",
        "emoji": "📺",
        "blurb": "Animated characters from TV, film and games",
        "tier": "family",
        "words": CARTOONS,
    },
    "notorious": {
        "name": "Notorious",
        "emoji": "⚠️",
        "blurb": "Dictators, tyrants and controversial historical figures — mature room only",
        "tier": "mature",
        "words": NOTORIOUS,
    },
}

SELECTABLE_PACK_IDS = list(PACKS.keys())


def normalize_pack_ids(pack_ids: list[str] | None) -> list[str]:
    if not pack_ids:
        return list(DEFAULT_PACK_IDS)
    out: list[str] = []
    for raw in pack_ids:
        pid = str(raw or "").strip().lower()
        if pid in SELECTABLE_PACK_IDS and pid not in out:
            out.append(pid)
    return out or list(DEFAULT_PACK_IDS)


def pack_label(pack_ids: list[str]) -> str:
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
    return [
        {
            "id": pid,
            "name": p["name"],
            "emoji": p["emoji"],
            "blurb": p["blurb"],
            "count": len(p["words"]),
            "tier": p.get("tier", "family"),
        }
        for pid, p in PACKS.items()
        if pid in SELECTABLE_PACK_IDS
    ]


def words_for_pack(pack_id: str) -> list[str]:
    pack = PACKS.get(pack_id)
    if not pack:
        return list(UK_CELEBS)
    return list(pack["words"])


def characters_for_packs(pack_ids: list[str] | None) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for pid in normalize_pack_ids(pack_ids):
        for word in words_for_pack(pid):
            if word not in seen:
                seen.add(word)
                merged.append(word)
    return merged
