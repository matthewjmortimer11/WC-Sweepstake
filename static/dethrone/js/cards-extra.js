/* Extends the §27 starter set to the full 76-card playtest deck. Loaded after data.js. */
(function () {
  CT.ACTION_CARDS = CT.ACTION_CARDS.concat([
    // Market (+8)
    { id: "merchants_map", name: "Merchant's Map", deck: "Market", timing: "Movement", effect: "Move to any location connected to your current one.", requiresManualResolution: false },
    { id: "smugglers_run", name: "Smuggler's Run", deck: "Market", timing: "Movement", effect: "Move through the Graveyard without stopping there this turn.", requiresManualResolution: true },
    { id: "guild_seal", name: "Guild Seal", deck: "Market", timing: "Reaction", effect: "Ignore one Tax this round.", requiresManualResolution: false },
    { id: "loaded_dice", name: "Loaded Dice", deck: "Market", timing: "Duel", duelValue: 1, effect: "If you lose, the duel is cancelled instead.", requiresManualResolution: false },
    { id: "fence", name: "Fence", deck: "Market", timing: "OnTurn", effect: "Discard an action card; gain gold equal to half its deck's buy cost (min 1).", requiresManualResolution: true },
    { id: "caravan_manifest", name: "Caravan Manifest", deck: "Market", timing: "OnTurn", effect: "Draw 1 Market card; another player at your location may draw 1 Market card.", requiresManualResolution: true },
    { id: "spare_coin_purse", name: "Spare Coin Purse", deck: "Market", timing: "OnTurn", effect: "Gain 2 gold.", requiresManualResolution: false },
    { id: "market_day", name: "Market Day", deck: "Market", timing: "OnTurn", effect: "All players at Market gain 1 gold.", requiresManualResolution: true },
    // Tavern (+8)
    { id: "bought_round", name: "Bought Round", deck: "Tavern", timing: "OnTurn", effect: "Pay 1 gold: you and one other player at Tavern each gain 1 Reputation.", requiresManualResolution: true },
    { id: "tavern_brawl", name: "Tavern Brawl", deck: "Tavern", timing: "OnTurn", effect: "Start a duel with a player at Tavern. If you win, they lose 1 Reputation.", requiresManualResolution: true },
    { id: "whisper_network", name: "Whisper Network", deck: "Tavern", timing: "OnTurn", effect: "Look at one hidden role card from a player at Tavern (they choose which).", requiresManualResolution: true },
    { id: "loan_shark", name: "Loan Shark", deck: "Tavern", timing: "OnTurn", effect: "Take 3 gold from another player at Tavern; they may refuse and lose 1 Reputation instead.", requiresManualResolution: true },
    { id: "stitched_lip", name: "Stitched Lip", deck: "Tavern", timing: "Reaction", effect: "Cancel one Rumour or False Rumour targeting you.", requiresManualResolution: false },
    { id: "performers_tale", name: "Performer's Tale", deck: "Tavern", timing: "OnTurn", effect: "Gain 1 Reputation.", requiresManualResolution: false },
    { id: "hangover_cure", name: "Hangover Cure", deck: "Tavern", timing: "OnTurn", effect: "Remove Wounded or regain 1 Reputation if at 1–2.", requiresManualResolution: false },
    { id: "sow_doubt", name: "Sow Doubt", deck: "Tavern", timing: "OnTurn", effect: "Choose a player. They lose 1 Reputation unless they reveal a public role.", requiresManualResolution: true },
    // Knowledge (+8)
    { id: "study_companion", name: "Study Companion", deck: "Knowledge", timing: "OnTurn", effect: "Draw 1 Knowledge card; an ally at your location may look at your hand.", requiresManualResolution: false },
    { id: "sealed_warrant", name: "Sealed Warrant", deck: "Knowledge", timing: "Vote", effect: "Start a Banish vote without seconder against a player with Rep ≤2.", requiresManualResolution: true },
    { id: "witness_statement", name: "Witness Statement", deck: "Knowledge", timing: "OnTurn", effect: "Ask one player: did they visit the Graveyard last round? They must answer truthfully.", requiresManualResolution: true },
    { id: "old_prophecy", name: "Old Prophecy", deck: "Knowledge", timing: "OnTurn", effect: "Peek at the top card of any deck.", requiresManualResolution: true },
    { id: "map_of_tunnels", name: "Map of Tunnels", deck: "Knowledge", timing: "Movement", effect: "Move from Market to Scrolls or College to Barracks.", requiresManualResolution: true },
    { id: "court_summons", name: "Court Summons", deck: "Knowledge", timing: "OnTurn", effect: "Force one player to move to the Throne before their next turn (if able).", requiresManualResolution: true },
    { id: "alibi_check", name: "Alibi Check", deck: "Knowledge", timing: "OnTurn", effect: "Name a location; one player must truthfully say if they were there last round.", requiresManualResolution: true },
    { id: "secret_ledger", name: "Secret Ledger", deck: "Knowledge", timing: "OnTurn", effect: "Inspect one player's gold total privately; they may lie once per game.", requiresManualResolution: true },
    // Barracks (+7)
    { id: "training_dummy", name: "Training Dummy", deck: "Barracks", timing: "OnTurn", effect: "Draw 1 Barracks card.", requiresManualResolution: false },
    { id: "second_blade", name: "Second Blade", deck: "Barracks", timing: "Duel", duelValue: 2, effect: "If you win, choose an extra Shame or Disarm.", requiresManualResolution: true },
    { id: "parry", name: "Parry", deck: "Barracks", timing: "Duel", duelValue: 2, effect: "If you lose, ignore Wound.", requiresManualResolution: false },
    { id: "intimidate", name: "Intimidate", deck: "Barracks", timing: "OnTurn", effect: "A player at your location loses 1 Reputation unless they pay you 2 gold.", requiresManualResolution: true },
    { id: "challenged_again", name: "Challenged Again", deck: "Barracks", timing: "Duel", effect: "After losing a duel, immediately challenge the same opponent again.", requiresManualResolution: true },
    { id: "iron_gauntlet", name: "Iron Gauntlet", deck: "Barracks", timing: "Duel", duelValue: 1, effect: "Defender cannot play Flee.", requiresManualResolution: true },
    { id: "veterans_warning", name: "Veteran's Warning", deck: "Barracks", timing: "Reaction", effect: "Cancel a duel you did not start.", requiresManualResolution: true },
    // Graveyard (+8)
    { id: "mourning_veil", name: "Mourning Veil", deck: "Graveyard", timing: "Reaction", effect: "Ignore one Call Out targeting you.", requiresManualResolution: true },
    { id: "spirit_coin", name: "Spirit Coin", deck: "Graveyard", timing: "OnTurn", effect: "Gain 2 gold. Corruption +1.", corruptionChange: 1, requiresManualResolution: false },
    { id: "bone_dice", name: "Bone Dice", deck: "Graveyard", timing: "OnTurn", effect: "Roll: on high, gain 4 gold; on low, lose 1 Reputation. Corruption +1.", corruptionChange: 1, requiresManualResolution: true },
    { id: "grave_dust", name: "Grave Dust", deck: "Graveyard", timing: "OnTurn", effect: "Lower corruption by 1. Lose 1 Reputation.", corruptionChange: -1, reputationChange: -1, requiresManualResolution: false },
    { id: "last_rites", name: "Last Rites", deck: "Graveyard", timing: "OnTurn", effect: "If corruption is 6+, gain 1 Reputation. Corruption +1.", corruptionChange: 1, requiresManualResolution: false },
    { id: "stolen_offering", name: "Stolen Offering", deck: "Graveyard", timing: "OnTurn", effect: "Take 1 gold from each player at Graveyard.", requiresManualResolution: true },
    { id: "wraith_whisper", name: "Wraith Whisper", deck: "Graveyard", timing: "OnTurn", effect: "Look at one random card from the Graveyard discard pile.", requiresManualResolution: true },
    { id: "forbidden_tome", name: "Forbidden Tome", deck: "Graveyard", timing: "OnTurn", effect: "Draw 1 Graveyard card. Corruption +2.", corruptionChange: 2, requiresManualResolution: false },
    // Royal (+7)
    { id: "queens_favour", name: "Queen's Favour", deck: "Royal", timing: "OnTurn", effect: "Give one player +1 Reputation; you gain 1 gold from the bank.", requiresManualResolution: true },
    { id: "succession_edict", name: "Succession Edict", deck: "Royal", timing: "OnTurn", effect: "Open succession immediately.", requiresManualResolution: true },
    { id: "herald", name: "Herald", deck: "Royal", timing: "OnTurn", effect: "All players learn your public role; gain 1 Reputation.", requiresManualResolution: true },
    { id: "royal_purse", name: "Royal Purse", deck: "Royal", timing: "OnTurn", effect: "Gain 3 gold if you control the Throne.", requiresManualResolution: false },
    { id: "banish_letter", name: "Banish Letter", deck: "Royal", timing: "Vote", effect: "Start Banish against a player with Rep ≤1 without seconder.", requiresManualResolution: true },
    { id: "kneel", name: "Kneel", deck: "Royal", timing: "Reaction", effect: "Ignore one formal vote targeting you if a royal controls the Throne.", requiresManualResolution: true },
    { id: "crown_witness", name: "Crown Witness", deck: "Royal", timing: "Vote", effect: "During a vote at Throne, add +2 vote weight to either side.", requiresManualResolution: true },
  ]);
})();
