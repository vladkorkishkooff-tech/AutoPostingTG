from ai_gen import _parse_image_queries, _parse_image_search_plan
from image_fetcher import (
    ImageResult,
    _fallback_queries,
    _image_asset_key,
    _image_url_is_excluded,
    _ordered_queries,
    _provider_names_for_query,
    _provider_is_paused,
    _record_provider_failure,
    _select_relevant_candidate,
    _PROVIDER_FAILURES,
)


def test_ai_query_parser_keeps_concrete_ranked_queries():
    content = """1. Titan methane rain surface
2. Saturn moon Titan landscape
3. Titan icy mountains
"""

    assert _parse_image_queries(content) == [
        "Titan methane rain surface",
        "Saturn moon Titan landscape",
        "Titan icy mountains",
    ]


def test_ai_query_parser_rejects_generic_stock_fillers():
    assert _parse_image_queries("science research\nlaboratory scientist\ntechnology concept") == []


def test_structured_plan_preserves_subject_and_focal_feature():
    plan = _parse_image_search_plan(
        '{"subject":"giant squid","focus":"eye close-up",'
        '"required_terms":["giant","squid","eye"],'
        '"queries":["giant squid eye closeup","giant squid eye anatomy"]}'
    )

    assert plan is not None
    assert plan.required_terms == ("giant", "squid", "eye")
    assert all("eye" in query.lower() for query in plan.queries)


def test_structured_plan_drops_connector_words_from_required_terms():
    plan = _parse_image_search_plan(
        '{"subject":"Olympus Mons","focus":"volcano summit and slopes",'
        '"required_terms":["olympus","mons","volcano"],'
        '"queries":["olympus mons volcano summit"]}'
    )

    assert plan is not None
    assert plan.required_terms == ("olympus", "mons", "volcano")
    assert plan.queries == ("olympus mons volcano summit",)


def test_structured_plan_fails_closed_without_two_anchors():
    assert (
        _parse_image_search_plan(
            '{"subject":"squid","focus":"animal",'
            '"required_terms":["squid"],"queries":["giant squid"]}'
        )
        is None
    )


def test_structured_plan_keeps_eye_required_but_lens_optional():
    plan = _parse_image_search_plan(
        '{"subject":"giant squid","focus":"eye lens",'
        '"required_terms":["giant","squid","lens"],'
        '"queries":["giant squid eye lens"]}'
    )

    assert plan is not None
    assert plan.required_terms == ("giant", "squid", "eye")
    assert plan.queries[0] == "giant squid eye lens"


def test_unknown_russian_topic_has_no_generic_fallback():
    assert _fallback_queries("На Титане идут метановые дожди") == []
    assert "science research" not in _fallback_queries("На Титане идут метановые дожди")


def test_known_topic_keeps_explicit_fallback():
    assert _fallback_queries("космос")[0] == "space astronomy"


def test_relevance_filter_rejects_microscope_for_titan():
    query = "Titan moon methane rain"
    candidates = [
        ImageResult("https://example.test/microscope.jpg", "Pexels", "Microscope in laboratory"),
        ImageResult("https://example.test/titan.jpg", "NASA", "Titan, Saturn's largest moon"),
    ]

    selected = _select_relevant_candidate(candidates, query)

    assert selected is not None
    assert selected.source == "NASA"


def test_single_word_overlap_is_not_enough_for_specific_query():
    candidates = [
        ImageResult(
            "https://example.test/methane.jpg",
            "Openverse",
            "Methane molecular orbitals",
        )
    ]

    assert _select_relevant_candidate(candidates, "Titan liquid methane rain") is None


def test_provider_description_can_prove_relevance():
    candidates = [
        ImageResult(
            "https://example.test/titan-lakes.jpg",
            "NASA",
            "Looking Down on Lakes",
            search_text="Cassini view of lakes on Titan filled with liquid methane",
        )
    ]

    selected = _select_relevant_candidate(candidates, "Titan methane lakes")

    assert selected is not None
    assert selected.source == "NASA"


def test_relevance_filter_returns_none_when_all_candidates_are_unrelated():
    candidates = [ImageResult("https://example.test/microscope.jpg", "Pexels", "Microscope in laboratory")]

    assert _select_relevant_candidate(candidates, "Titan moon methane rain") is None


def test_required_feature_rejects_whole_squid_without_visible_eye():
    candidates = [
        ImageResult(
            "https://example.test/squid.jpg",
            "Pexels",
            "A person holding a giant squid at a market",
        )
    ]

    assert (
        _select_relevant_candidate(
            candidates,
            "giant squid eye closeup",
            ("giant", "squid", "eye"),
        )
        is None
    )


def test_required_feature_accepts_exact_squid_eye_closeup():
    candidates = [
        ImageResult(
            "https://example.test/squid-eye.jpg",
            "Wikimedia Commons",
            "Close-up of a giant squid eye",
        )
    ]

    assert (
        _select_relevant_candidate(
            candidates,
            "giant squid eye closeup",
            ("giant", "squid", "eye"),
        )
        is not None
    )


def test_exact_subject_title_beats_a_related_partial_feature():
    candidates = [
        ImageResult(
            "https://example.test/rupes.jpg",
            "NASA",
            "Olympus Rupes",
            search_text="Olympus Mons volcano escarpment on Mars",
        ),
        ImageResult(
            "https://example.test/mons.jpg",
            "NASA",
            "Olympus Mons",
            search_text="Full view of the Olympus Mons volcano on Mars",
        ),
    ]

    selected = _select_relevant_candidate(
        candidates,
        "Olympus Mons volcano Mars",
        ("olympus", "mons", "volcano"),
        "Olympus Mons",
    )

    assert selected is not None
    assert selected.title == "Olympus Mons"


def test_exact_subject_in_description_cannot_rescue_generic_frame():
    candidates = [
        ImageResult(
            "https://example.test/terrain.jpg",
            "NASA",
            "Unidentified Martian terrain",
            search_text="A context image from an observation near Olympus Mons volcano",
        )
    ]

    assert _select_relevant_candidate(
        candidates,
        "Olympus Mons volcano Mars",
        ("olympus", "mons", "volcano"),
        "Olympus Mons",
        "volcano",
    ) is None


def test_focus_must_be_visible_in_title_not_only_broad_metadata():
    whole_squid = ImageResult(
        "https://example.test/squid.jpg",
        "Openverse",
        "Giant squid specimen",
        search_text="Giant squid specimen with a very large eye",
    )
    assert _select_relevant_candidate(
        [whole_squid], "giant squid eye", ("giant", "squid", "eye"), "giant squid", "eye"
    ) is None


def test_provider_circuit_opens_after_three_failures():
    _PROVIDER_FAILURES.clear()
    host = "broken.example"
    _record_provider_failure(host, 120, now=100)
    _record_provider_failure(host, 120, now=100)
    assert not _provider_is_paused(host, now=100)
    _record_provider_failure(host, 120, now=100)
    assert _provider_is_paused(host, now=101)
    assert not _provider_is_paused(host, now=221)
    _PROVIDER_FAILURES.clear()


def test_astronomy_queries_prioritize_scientific_archives():
    providers = _provider_names_for_query("Titan moon methane rain")

    assert providers[:2] == ["NASA", "Wikimedia Commons"]


def test_historical_images_do_not_rotate_away_from_best_query():
    queries = ["first subject", "second subject", "third subject"]

    assert _ordered_queries(queries, {"https://example.test/old.jpg"}) == [
        "first subject",
        "second subject",
        "third subject",
    ]


def test_nasa_size_variants_share_one_asset_key():
    medium = "https://images-assets.nasa.gov/image/PIA26305/PIA26305~medium.jpg"
    thumb = "https://images-assets.nasa.gov/image/PIA26305/PIA26305~thumb.jpg"

    assert _image_asset_key(medium) == _image_asset_key(thumb)
    assert _image_url_is_excluded(thumb, {medium})


def test_different_nasa_archive_images_remain_distinct():
    first = "https://images-assets.nasa.gov/image/PIA26305/PIA26305~medium.jpg"
    second = "https://images-assets.nasa.gov/image/PIA02982/PIA02982~small.jpg"

    assert _image_asset_key(first) != _image_asset_key(second)
    assert not _image_url_is_excluded(second, {first})
