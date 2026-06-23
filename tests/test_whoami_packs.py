"""Who Am I? identity packs."""

from whoami.packs import (
    characters_for_packs,
    normalize_pack_ids,
    pack_label,
    pack_meta,
    words_for_pack,
)


def test_default_pack_is_uk_celebs():
    assert normalize_pack_ids(None) == ["uk_celebs"]
    assert normalize_pack_ids([]) == ["uk_celebs"]


def test_normalize_merges_valid_packs():
    ids = normalize_pack_ids(["marvel", "cartoons", "nope", "marvel"])
    assert ids == ["marvel", "cartoons"]


def test_characters_merge_without_duplicates():
    pool = characters_for_packs(["uk_celebs", "marvel"])
    assert "Ed Sheeran" in pool
    assert "Spider-Man" in pool
    assert len(pool) == len(set(pool))


def test_notorious_pack_has_hitler_and_mao():
    words = words_for_pack("notorious")
    assert "Adolf Hitler" in words
    assert "Mao Zedong" in words


def test_pack_meta_lists_all_selectable():
    meta = pack_meta()
    ids = {p["id"] for p in meta}
    assert "uk_celebs" in ids
    assert "objects" in ids
    assert "marvel" in ids
    assert "cartoons" in ids
    assert "notorious" in ids
    notorious = next(p for p in meta if p["id"] == "notorious")
    assert notorious["tier"] == "mature"


def test_pack_label_single_and_multi():
    assert pack_label(["uk_celebs"]) == "UK Celebs"
    assert "Marvel" in pack_label(["uk_celebs", "marvel", "cartoons", "objects"])


def test_enough_identities_for_typical_game():
    pool = characters_for_packs(["uk_celebs", "objects", "marvel", "cartoons", "notorious"])
    assert len(pool) >= 50
