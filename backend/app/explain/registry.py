"""Engineering Explorer cards: physics copy + templated per-track sentences.

Each card answers, for one pipeline stage: what physically causes the effect,
where it lives on a real record, why engineers cannot simply eliminate it, and
what it measurably did to the user's own upload. The dynamic sentences are
filled from PipelineResult.stage_metrics and TrackObservations, so the numbers
always describe the audio the user just heard.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.dsp.constants import INNER_RADIUS_M
from app.explain.metrics import TrackObservations, tracing_cutoff_hz


@dataclass(frozen=True)
class ExplorerCard:
    key: str
    title: str
    subtitle: str
    physics: str
    where_on_record: str
    why_unavoidable: str
    your_track: list[str] = field(default_factory=list)
    enabled: bool = True


def _fmt_time(t_s: float) -> str:
    return f"{int(t_s // 60)}:{t_s % 60:04.1f}"


def build_cards(
    stage_metrics: dict[str, dict[str, float]],
    obs: TrackObservations,
    start_radius_mm: float,
    stylus_size: float,
    is_stereo: bool,
) -> list[ExplorerCard]:
    """Assemble the full card list for one processed result."""
    cards: list[ExplorerCard] = []
    r_start_m = start_radius_mm / 1000.0

    # ------------------------------------------------------------- RIAA ----
    m = stage_metrics.get("riaa")
    cards.append(ExplorerCard(
        key="riaa",
        title="RIAA equalization",
        subtitle="Why records are cut with the bass turned down and the treble turned up",
        physics=(
            "A cutter head driven at constant voltage carves constant groove "
            "*velocity*, so a bass note's excursion (velocity / 2πf) would be "
            "enormous — low frequencies would swing the groove into its "
            "neighbors — while treble would sit at microscopic excursions "
            "barely above the vinyl's own roughness. Since 1954 every record "
            "is therefore cut with bass attenuated and treble boosted along a "
            "standardized curve, and every phono preamp applies the exact "
            "mirror curve on playback."
        ),
        where_on_record=(
            "Everywhere — it is baked into the groove before any music is cut. "
            "Without it, an LP would hold about 5 minutes per side instead of 22."
        ),
        why_unavoidable=(
            "It is not a defect but a treaty with physics: excursion limits on "
            "one side, the noise floor on the other. Remove it and you lose "
            "either playing time or signal-to-noise — there is no third option."
        ),
        your_track=(
            [
                f"Before cutting, your clip's content at 10 kHz was raised {m['boost_at_10khz_db']:+.1f} dB "
                f"and its content at 50 Hz lowered {m['cut_at_50hz_db']:+.1f} dB; the preamp stage undid "
                "both exactly. Toggle RIAA off and the noise stage suddenly sounds much hissier — "
                "that difference is the treble headroom RIAA exists to buy.",
            ]
            if m
            else []
        ),
        enabled=m is not None,
    ))

    # ----------------------------------------------------------- Stylus ----
    m = stage_metrics.get("stylus")
    f_here = tracing_cutoff_hz(r_start_m, stylus_size)
    f_inner = tracing_cutoff_hz(INNER_RADIUS_M, stylus_size)
    cards.append(ExplorerCard(
        key="stylus",
        title="Stylus tracing & inner-groove distortion",
        subtitle="One tip, three symptoms: treble loss, tracing distortion, inner-groove strain",
        physics=(
            "The stylus tip is ~8 µm across and reads a weighted average of the "
            "groove wall under its contact patch — it physically cannot follow "
            "wiggles smaller than itself. The groove passes the tip at "
            "ω·r meters per second, so a given audio frequency occupies a "
            "spatial wavelength λ = v/f that *shrinks* as the record plays "
            "inward. The same fixed tip therefore erases progressively more "
            "treble, and where the wall curves tighter than the tip it "
            "mistracks and generates harmonics. Treble loss, tracing "
            "distortion, and 'inner groove distortion' are one phenomenon, "
            "which is why they are one toggle here."
        ),
        where_on_record=(
            "Worst in the last track of a side: groove speed falls ~2.4× from "
            "edge to label. Mastering engineers sequence albums around it — "
            "gentle songs go last for a reason."
        ),
        why_unavoidable=(
            "A smaller tip would trace finer detail but exceeds the vinyl's "
            "contact-pressure limits (it would plow the groove); exotic shapes "
            "(elliptical, Shibata) narrow the scanning footprint and genuinely "
            "help, but no physical tip has zero size."
        ),
        your_track=[
            f"At your chosen radius ({start_radius_mm:.0f} mm) the contact patch's raw −3 dB "
            f"point is ≈{f_here / 1000:.1f} kHz; at the innermost groove it would fall to "
            f"≈{f_inner / 1000:.1f} kHz. Drag the groove-position slider inward and listen to "
            f"your brightest moment (at {_fmt_time(obs.brightest_moment_s)}) dull first.",
            f"Measured on this render: your clip's 5–14 kHz band changed by {obs.hf_loss_db:+.1f} dB "
            "relative to the original.",
        ] + (
            [f"The tip could not fully trace detail with RMS amplitude {m['hf_detail_removed_rms_um']:.3f} µm in your groove."]
            if m else []
        ),
        enabled=m is not None,
    ))

    # ------------------------------------------------------- Compliance ----
    m = stage_metrics.get("compliance")
    cards.append(ExplorerCard(
        key="compliance",
        title="Harmonic saturation ('warmth')",
        subtitle="Why hot passages come back rounder than they went in",
        physics=(
            "A cartridge outputs voltage proportional to groove-wall velocity "
            "— the wall's *slope* times the groove speed. The mechanical chain "
            "(cutter drive, vinyl elasticity, cantilever suspension) compresses "
            "steep slopes slightly and asymmetrically, adding low-order odd and "
            "even harmonics. Because the drive variable is slope, the effect "
            "keys to loud, bright material — and grows toward the center, where "
            "the same audio must be carved into steeper walls."
        ),
        where_on_record=(
            "Loud choruses, hot snares, fortissimo strings — anywhere the "
            "cutting engineer pushed level. This, not noise, is most of what "
            "people mean by 'vinyl warmth'."
        ),
        why_unavoidable=(
            "Every elastic material has a nonlinear stress–strain curve; you can "
            "push the knee further out with better materials, but a perfectly "
            "linear mechanical transducer does not exist."
        ),
        your_track=(
            [
                f"Your loudest moment ({_fmt_time(obs.loudest_moment_s)}) drove the groove wall to a "
                f"slope of {m['peak_slope']:.2f} and was compressed {m['peak_compression_pct']:.1f}% at "
                "the peak — that rounding is the 'warmth'. Raise the drive slider to hear the "
                "same mechanism pushed into obvious distortion.",
            ]
            if m
            else []
        ),
        enabled=m is not None,
    ))

    # ------------------------------------------------------ Wow/flutter ----
    m = stage_metrics.get("wow_flutter")
    cards.append(ExplorerCard(
        key="wow_flutter",
        title="Wow & flutter",
        subtitle="The platter never spins at exactly 33⅓",
        physics=(
            "Wow is a once-per-revolution speed breath (~0.56 Hz), mostly from "
            "the record's spindle hole being punched slightly off-center; "
            "flutter is a faster ripple from motor cogging and belt tooth "
            "engagement. We simulate them as actual speed variation — the "
            "simulated stylus literally reads the groove at a wobbling rate — "
            "so the pitch bend you hear *emerges* from mechanics rather than "
            "being painted on with a pitch-shifter."
        ),
        where_on_record=(
            "Most audible on sustained pure tones — piano, organ, held strings. "
            "Dense percussive music masks it almost completely."
        ),
        why_unavoidable=(
            "Pressing plants punch the center hole to a tolerance of roughly "
            "±0.1 mm; even a perfect turntable plays an imperfectly centered "
            "disc. Quartz-locked direct drives fix the motor, not the hole."
        ),
        your_track=(
            [
                f"This render's peak speed deviation is {m['peak_deviation_pct']:.2f}%, i.e. a pitch "
                f"wobble of about {m['peak_deviation_cents']:.1f} cents. Sustained notes in your clip "
                "will show it most — percussive moments hide it.",
            ]
            if m
            else []
        ),
        enabled=m is not None,
    ))

    # ----------------------------------------------------------- Clicks ----
    m = stage_metrics.get("clicks")
    cards.append(ExplorerCard(
        key="clicks",
        title="Clicks & pops",
        subtitle="Dust motes kicking a resonant cantilever",
        physics=(
            "A click's waveform is not the dust particle — it is the cantilever's "
            "own ~5 kHz mechanical resonance ringing for a few milliseconds after "
            "the kick, which is why all clicks on a given cartridge share a "
            "family sound. Defects live on the groove itself, so we scatter them "
            "per meter of groove and let the spiral map decide when you hear "
            "them. That yields a mildly counter-intuitive truth: clicks per "
            "*second* are slightly rarer near the center, because slower groove "
            "speed means fewer meters of vinyl pass the stylus each second."
        ),
        where_on_record=(
            "Everywhere dust lands. Each defect strikes the two groove walls "
            "unequally, so clicks scatter randomly across the stereo image."
        ),
        why_unavoidable=(
            "A groove is an exposed micrometer-scale surface handled in open "
            "air; electrostatic charge actively attracts dust to it. Wet "
            "cleaning helps; a sealed record cannot be played."
        ),
        your_track=(
            [
                f"This render placed {m['click_count']:.0f} defects along your clip's groove "
                f"({m['rate_start_hz']:.1f}/s at your radius; the same disc would give "
                f"{m['rate_inner_hz']:.1f}/s at the innermost groove — fewer, not more, "
                "contrary to the folklore).",
            ]
            if m
            else []
        ),
        enabled=m is not None,
    ))

    # -------------------------------------------------------- Crosstalk ----
    m = stage_metrics.get("crosstalk")
    stereo_note = (
        f"Your upload is stereo with a side/mid energy ratio of {obs.stereo_width_rms:.2f}; "
        "leakage narrows that image slightly."
        if is_stereo
        else "Your upload is mono, so there is no image to narrow — toggling this stage "
        "changes essentially nothing, which is itself the correct physics."
    )
    cards.append(ExplorerCard(
        key="crosstalk",
        title="Channel crosstalk",
        subtitle="Stereo separation limited by a bendable cantilever",
        physics=(
            "Stereo vinyl encodes L and R on two groove walls tilted 45° each "
            "way; the cartridge separates them by sensing two orthogonal motion "
            "axes. Real cantilevers flex and their suspensions are imperfectly "
            "symmetric, so each output hears a little of the other wall — "
            "typically −30 dB at 1 kHz, worsening above a few kHz where the "
            "cantilever no longer moves as a rigid body."
        ),
        where_on_record=(
            "Hard-panned material shows it most: an instrument mixed fully left "
            "faintly ghosts in the right channel."
        ),
        why_unavoidable=(
            "One stylus must read both walls simultaneously through one "
            "mechanical linkage; perfect separation would need the linkage to "
            "be infinitely rigid in one axis and perfectly free in the other, "
            "at the same point, at all frequencies."
        ),
        your_track=(
            [
                f"Applied separation: {m['separation_at_1khz_db']:.0f} dB at 1 kHz, "
                f"{m['separation_hf_db']:.0f} dB in the top octaves. " + stereo_note,
            ]
            if m
            else []
        ),
        enabled=m is not None,
    ))

    # ------------------------------------------------------------ Noise ----
    m = stage_metrics.get("noise")
    margin = (obs.quietest_rms_dbfs - m["noise_floor_dbfs"]) if m else 0.0
    cards.append(ExplorerCard(
        key="noise",
        title="Surface noise & rumble",
        subtitle="The medium's own voice",
        physics=(
            "Vinyl compound is not molecularly smooth: filler particles and "
            "molding texture make the groove wall microscopically rough, read "
            "by the cartridge as near-pink broadband noise. It enters *before* "
            "the preamp, so RIAA de-emphasis rolls off its top — that "
            "post-filter spectrum is the familiar vinyl hiss. Below ~30 Hz, "
            "bearing and motor vibration add rumble. Noise on the two walls is "
            "uncorrelated, which is why surface noise sounds diffusely wide."
        ),
        where_on_record=(
            "Constant along the groove. We deliberately do NOT make it louder "
            "toward the center: wall roughness is a material property, and the "
            "honest reason records sound worse inside is tracing loss, not a "
            "rising noise floor."
        ),
        why_unavoidable=(
            "It is the thermodynamic floor of a mechanical medium: a quieter "
            "compound costs more and presses worse, and even a perfect pressing "
            "is read by a diamond dragged through plastic."
        ),
        your_track=(
            [
                f"Noise floor set at {m['noise_floor_dbfs']:.0f} dBFS. Your quietest passage "
                f"(around {_fmt_time(obs.quietest_moment_s)}, {obs.quietest_rms_dbfs:.0f} dBFS RMS) "
                f"sits {margin:.0f} dB above it — that margin is where you'll hear the hiss.",
            ]
            if m
            else []
        ),
        enabled=m is not None,
    ))

    return cards
